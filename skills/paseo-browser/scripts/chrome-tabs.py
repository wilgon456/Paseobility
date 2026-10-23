#!/usr/bin/env python3
"""Own a task tab in an already-running macOS Chrome window; never launch Chrome.

Only tab lifecycle is automated here. Bind the returned tab ID using the
installed browser integration for page interaction. State survives CLI exits.
"""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

JXA = r'''
ObjC.import('AppKit');
function run(argv) {
  const req=JSON.parse(argv[0]);
  const apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.google.Chrome');
  const candidates=[];
  for(let i=0;i<Number(apps.count);i++) {
    const a=apps.objectAtIndex(i);
    const key=String(a.processIdentifier)+':'+String(a.launchDate.timeIntervalSince1970);
    if(req.instance ? key===req.instance : Number(a.activationPolicy)===0) candidates.push(a);
  }
  if (candidates.length!==1) throw Error('Chrome absent, restarted or ambiguous; no browser was launched');
  const app=candidates[0];
  const instance=String(app.processIdentifier)+':'+String(app.launchDate.timeIntervalSince1970);
  if(req.instance && req.instance!==instance) throw Error('Chrome restarted; refusing stale tab IDs');
  // Address the actual process, not a bundle lookup that may pick another
  // concurrently running headless Chrome (Apple WWDC 2014 session 306).
  const chrome=Application(Number(app.processIdentifier));
  if(!chrome.running()) throw Error('Chrome is not running');
  const windows=()=>chrome.windows().map(w=>({id:String(w.id()),mode:w.mode(),tabs:w.tabs().map(t=>({id:String(t.id()),url:t.url()}))}));
  const find=()=>{
    for(const w of chrome.windows()) for(const t of w.tabs())
      if(String(t.id())===req.tabId) return {w,t};
    return null;
  };
  if(req.action==='snapshot') return JSON.stringify({instance,windows:windows()});
  if(req.action==='create') {
    const w=chrome.windows().find(w=>String(w.id())===req.windowId && w.mode()==='normal');
    if(!w) throw Error('Selected existing normal window is gone; no replacement window created');
    // An explicit existing window is essential: chrome.Tab/openLocation alone
    // can delegate placement to Chrome/extension session routing.
    w.tabs.push(chrome.Tab({url:req.marker}));
    const matches=w.tabs().filter(t=>t.url()===req.marker);
    if(matches.length!==1) throw Error('Creation outcome unknown; recover using the journal marker');
    return JSON.stringify({id:String(matches[0].id())});
  }
  const hit=find();
  if(req.action==='close') {
    if(hit) hit.t.close();
    if(find()) throw Error('Owned tab remains after close');
    return JSON.stringify({closed:!!hit});
  }
  if(req.action==='navigate') {
    if(!hit) throw Error('Owned tab no longer exists');
    hit.t.url=req.url;
    return JSON.stringify({id:req.tabId});
  }
  throw Error('Unknown action');
}
'''


class Chrome:
    def call(self, action, **kwargs):
        if sys.platform != 'darwin':
            raise RuntimeError('This adapter requires macOS; use an installed existing-window adapter on this host')
        result = subprocess.run(
            ['/usr/bin/osascript', '-l', 'JavaScript', '-', json.dumps({'action': action, **kwargs})],
            input=JXA, text=True, capture_output=True, timeout=20)
        if result.returncode:
            raise RuntimeError(result.stderr.strip())
        return json.loads(result.stdout)


def tabs(snapshot):
    return {t['id']: (w, t) for w in snapshot['windows'] for t in w['tabs']}


class TaskTab:
    def __init__(self, root, task, backend=None):
        if not task or len(task) > 200:
            raise ValueError('Use a nonempty task ID, at most 200 characters')
        self.root = Path(root)
        self.key = hashlib.sha256(task.encode()).hexdigest()
        self.file = self.root / (self.key + '.json')
        self.backend = backend or Chrome()

    @contextmanager
    def locked(self):
        # Kernel locks release on process death, unlike stale mkdir/PID locks.
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (self.root / (self.key + '.lock')).open('a+b') as lock:
            try:
                if sys.platform == 'win32':
                    import msvcrt
                    if lock.tell() == 0:
                        lock.write(b'0')
                        lock.flush()
                    lock.seek(0)
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                raise RuntimeError('Another lifecycle operation owns this task; retry after it finishes') from None
            yield

    def read(self):
        return json.loads(self.file.read_text()) if self.file.exists() else None

    def save(self, state):
        fd, name = tempfile.mkstemp(dir=self.root, prefix=self.key + '.')
        try:
            with os.fdopen(fd, 'w') as out:
                json.dump(state, out)
                out.flush()
                os.fsync(out.fileno())
            os.replace(name, self.file)
        finally:
            if os.path.exists(name):
                os.unlink(name)

    def owned(self, state, snapshot):
        if state['instance'] != snapshot['instance']:
            raise RuntimeError('Chrome restarted; refusing stale tab IDs. Use a new task ID')
        if state['tabId']:
            return state['tabId'] if state['tabId'] in tabs(snapshot) else None
        # A creation timeout may have happened after Chrome created the tab.
        matches = [t['id'] for w in snapshot['windows'] for t in w['tabs']
                   if t['url'] == state['marker'] and t['id'] not in state['baseline']]
        if len(matches) != 1:
            raise RuntimeError('Ambiguous creation outcome; refusing to create another tab or close an unknown one')
        state['tabId'] = matches[0]
        self.save(state)
        return matches[0]

    def open(self, window_id, url):
        if not url.startswith(('http://', 'https://', 'about:blank')):
            raise ValueError('Only HTTP(S) or about:blank URLs are accepted')
        with self.locked():
            state = self.read()
            snapshot = self.backend.call('snapshot', **(
                {'instance': state['instance']} if state and state['status'] != 'closed' else {}))
            if state and state['status'] != 'closed':
                tab_id = self.owned(state, snapshot)
                if tab_id is None:
                    # The user closed this task tab. Recreate only on explicit open.
                    state['status'] = 'closed'
                    self.save(state)
            if not state or state['status'] == 'closed':
                if not any(w['id'] == window_id and w['mode'] == 'normal' for w in snapshot['windows']):
                    raise RuntimeError('Select a current normal window from list; no window will be created')
                state = {'version': 1, 'instance': snapshot['instance'], 'windowId': window_id,
                         'marker': 'about:blank#paseobility-' + uuid.uuid4().hex,
                         'baseline': list(tabs(snapshot)), 'tabId': None, 'status': 'creating'}
                self.save(state)  # write intent BEFORE the external side effect
                # If this raises, retain intent; next open/close recovers the marker.
                self.backend.call('create', instance=state['instance'], windowId=window_id, marker=state['marker'])
                snapshot = self.backend.call('snapshot', instance=state['instance'])
                tab_id = self.owned(state, snapshot)
            else:
                tab_id = state['tabId']
            if state['status'] == 'creating' and tabs(snapshot)[tab_id][0]['id'] != state['windowId']:
                self._close(state)
                raise RuntimeError('Host created tab in a different window; owned tab closed instead of continuing')
            state['status'] = 'open'
            self.save(state)
            try:
                self.backend.call('navigate', instance=state['instance'], tabId=tab_id, url=url)
            except Exception:
                self._close(state)
                raise
            return {'tabId': tab_id, 'windowId': tabs(snapshot)[tab_id][0]['id'], 'stateFile': str(self.file)}

    def _close(self, state):
        if not state or state['status'] == 'closed':
            return {'closed': False}
        snapshot = self.backend.call('snapshot', instance=state['instance'])
        tab_id = self.owned(state, snapshot)
        if tab_id:
            self.backend.call('close', instance=state['instance'], tabId=tab_id)
            after = self.backend.call('snapshot', instance=state['instance'])
            if after['instance'] != state['instance'] or tab_id in tabs(after):
                raise RuntimeError('Could not verify owned tab closure')
        state['status'] = 'closed'
        self.save(state)
        return {'closed': bool(tab_id), 'tabId': tab_id, 'verifiedAbsent': True}

    def close(self):
        with self.locked():
            return self._close(self.read())

    @contextmanager
    def session(self, window_id, url):
        try:
            yield self.open(window_id, url)
        finally:
            self.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['list', 'open', 'close'])
    parser.add_argument('--task', help='Unique agent/task ID; reuse for this task only')
    parser.add_argument('--window', help='Existing normal window ID returned by list')
    parser.add_argument('--url', default='about:blank')
    parser.add_argument('--state-dir', default=str(Path.home() / '.local/state/paseobility/browser-tabs'))
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('macOS adapter only; never launches a replacement browser on unsupported hosts')
    if args.action == 'list':
        result = Chrome().call('snapshot')
        # Avoid printing potentially private tab URLs; task recovery reads them internally.
        for w in result['windows']:
            for t in w['tabs']:
                t.pop('url', None)
    else:
        if not args.task:
            parser.error('--task is required')
        task = TaskTab(args.state_dir, args.task)
        if args.action == 'open':
            if not args.window:
                parser.error('--window is required; select one from list')
            result = task.open(args.window, args.url)
        else:
            result = task.close()
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        sys.exit(1)
