#!/usr/bin/env python3
"""One authenticated SSH request on stdin; no listener, shell or credentials."""
import argparse
import json
import re
import socket
import sqlite3
import sys
from pathlib import Path
from paseo_bot import Bot, ID, PERMISSION_PID, private_file, scrub
from gui_projection import apply_supervisor, snapshot
from gui_state import Conversations

MAX_INPUT = 200000


def read_json(path, default):
    if not path.exists():
        return default
    private_file(path)
    return json.loads(path.read_text(encoding='utf-8-sig'))


MEMORY_KEYS = {
    'list': {'action', 'op', 'project', 'status'},
    'search': {'action', 'op', 'query', 'project'},
    'approve': {'action', 'op', 'key', 'requestId'},
    'reject': {'action', 'op', 'key', 'requestId'},
    'forget': {'action', 'op', 'id', 'requestId'},
}
MEMORY_KEY = re.compile(r'[a-z0-9]{12}\Z')


def memory_request(home, request, allow_submit):
    """Read/write curated memory through the same bridge as every other action."""
    import memory
    op = request.get('op')
    if op not in MEMORY_KEYS or set(request) - MEMORY_KEYS[op]:
        raise ValueError('Unsupported memory request')
    if op in ('approve', 'reject', 'forget') and not allow_submit:
        raise ValueError('Read-only bridge')
    if not (home / memory.DB_NAME).exists():
        raise ValueError('Memory is not configured')
    store = memory.MemoryStore(home)
    try:
        if op == 'list':
            status = request.get('status')
            if status is not None and status not in memory.STATUSES:
                raise ValueError('Invalid memory status')
            project = request.get('project')
            if project is not None and (not isinstance(project, str) or not ID.fullmatch(project)):
                raise ValueError('Invalid project')
            return store.list_items(project, status)
        if op == 'search':
            query = request.get('query')
            if not isinstance(query, str) or not query.strip() or len(query) > 300:
                raise ValueError('Invalid memory query')
            project = request.get('project')
            if project is not None and (not isinstance(project, str) or not ID.fullmatch(project)):
                raise ValueError('Invalid project')
            return store.search(query, project, 20)
        if op in ('approve', 'reject'):
            key = request.get('key')
            if not isinstance(key, str) or not MEMORY_KEY.fullmatch(key):
                raise ValueError('Invalid memory approval key')
            item = store.approve(key) if op == 'approve' else store.reject(key)
            return {'accepted': True, 'op': op, 'key': key,
                    'id': item['id'] if isinstance(item, dict) and 'id' in item else '',
                    'state': (item.get('status') or item.get('state')) if isinstance(item, dict) else 'rejected'}
        item_id = request.get('id')
        if not isinstance(item_id, str) or not ID.fullmatch(item_id):
            raise ValueError('Invalid memory id')
        return {'accepted': True, 'id': item_id, 'state': store.forget(item_id)['status']}
    finally:
        store.close()


def handle(home, request, allow_submit=False):
    if not isinstance(request, dict):
        raise ValueError('Invalid request')
    action = request.get('action')
    allowed = {'status': {'action', 'offset'}, 'result': {'action', 'id'}, 'submit': {'action', 'task'},
               'control': {'action', 'conversationId', 'taskId', 'op', 'requestId'},
               'permission': {'action', 'conversationId', 'taskId', 'pid', 'decision', 'requestId'},
               'peek': {'action', 'conversationId', 'taskId', 'tail'},
               'sync': {'action', 'offset', 'conversationId', 'before', 'query', 'project', 'machine', 'requester', 'scope', 'group', 'sort'},
               'create': {'action', 'requestId'}, 'send': {'action', 'conversationId', 'messageId', 'text', 'retryOf', 'selection'},
               'start': {'action', 'requestId', 'messageId', 'text', 'selection'},
               'approve': {'action', 'conversationId', 'planId', 'digest'}, 'reject': {'action', 'conversationId', 'planId'},
               'remember': {'action', 'conversationId', 'messageId', 'project'}, 'resolve': {'action', 'conversationId'},
               'memory': {'action', 'op', 'key', 'requestId', 'id', 'project', 'status', 'query'}}
    if action not in allowed or set(request) - allowed[action]:
        raise ValueError('Unsupported request')
    home = Path(home)
    if action == 'memory':
        return memory_request(home, request, allow_submit)
    if action in ['create', 'start', 'send', 'approve', 'reject', 'remember', 'resolve']:
        if not allow_submit:
            raise ValueError('Read-only bridge')
        c = Conversations(home)
        try:
            if action == 'create':
                return c.create(request['requestId'])
            if action == 'start':
                out = c.create(request['requestId'])
                return dict(c.send(out['conversationId'], request['messageId'], request['text'], selection=request.get('selection')), **out)
            if action == 'send':
                return c.send(request['conversationId'], request['messageId'], request['text'], request.get('retryOf'), request.get('selection'))
            if action == 'approve':
                return c.approve(request['conversationId'], request['planId'], request['digest'])
            if action == 'reject':
                return c.reject(request['conversationId'], request['planId'])
            if action == 'resolve':
                return c.resolve(request['conversationId'])
            return c.remember(request['conversationId'], request['messageId'], request['project'])
        finally:
            c.close()
    if action == 'submit':
        if not allow_submit:
            raise ValueError('Read-only bridge')
        bot = Bot(home)
        try:
            # Exactly the same admission/owner fence/idempotency as CLI submit.
            if bot.db.execute("SELECT 1 FROM sqlite_master WHERE name='gui_conversations'").fetchone():
                raise ValueError('GUI v2 requires an approved manager plan')
            return scrub(bot.submit(request['task']))
        finally:
            bot.db.close()
    if action in ('control', 'permission', 'peek'):
        if not allow_submit:
            raise ValueError('Read-only bridge')
        conversation = request.get('conversationId')
        task_id = request.get('taskId')
        if not isinstance(conversation, str) or not ID.fullmatch(conversation):
            raise ValueError('Invalid conversation')
        if not isinstance(task_id, str) or not ID.fullmatch(task_id):
            raise ValueError('Invalid ID')
        bot = Bot(home)
        try:
            origin = bot.db.execute('SELECT context FROM task_origins WHERE task_id=?', (task_id,)).fetchone()
            # A chat control may only touch a task admitted from that same conversation.
            if not origin or json.loads(origin[0]).get('conversationId') != conversation:
                raise ValueError('Task scope')
            if action == 'permission':
                pid = request.get('pid')
                decision = request.get('decision')
                request_id = request.get('requestId')
                if not isinstance(pid, str) or not PERMISSION_PID.fullmatch(pid):
                    raise ValueError('Invalid permission key')
                if decision not in ('allow', 'deny'):
                    raise ValueError('Invalid permission decision')
                if not isinstance(request_id, str) or not ID.fullmatch(request_id):
                    raise ValueError('Invalid request ID')
                out = bot.control(task_id, 'permit-' + decision, request_id,
                                  {'conversationId': conversation, 'pid': pid})
                return {'accepted': True, 'controlId': out['controlId'], 'state': out['state']}
            if action == 'control':
                op = request.get('op')
                request_id = request.get('requestId')
                if op not in ('cancel', 'pause', 'resume'):
                    raise ValueError('Invalid control op')
                if not isinstance(request_id, str) or not ID.fullmatch(request_id):
                    raise ValueError('Invalid request ID')
                out = bot.control(task_id, op, request_id, {'conversationId': conversation})
                return {'accepted': True, 'controlId': out['controlId'], 'state': out['state']}
            return {'text': bot.peek(task_id, request.get('tail', 40))['text']}
        finally:
            bot.db.close()
    dbpath = home / 'queue.sqlite3'
    private_file(dbpath)
    # No Bot constructor, schema creation, PRAGMA writes or queue mutations.
    db = sqlite3.connect(dbpath.resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
    try:
        db.execute('PRAGMA query_only=ON')
        if action == 'result':
            task_id = request.get('id')
            if not isinstance(task_id, str) or not ID.fullmatch(task_id):
                raise ValueError('Invalid ID')
            row = db.execute('SELECT record FROM tasks WHERE id=?', (task_id,)).fetchone()
            if not row:
                raise ValueError('Unknown task')
            return scrub(json.loads(row[0]))
        if action == 'sync':
            return snapshot(db, home, request, allow_submit, read_json)
        offset = request.get('offset', 0)
        if type(offset) is not int or offset < 0 or offset > 1000000:
            raise ValueError('Invalid offset')
        # A transaction keeps counts and the page consistent during dispatcher ticks.
        db.execute('BEGIN')
        counts = dict(db.execute('SELECT state,count(*) FROM tasks GROUP BY state'))
        rows = db.execute('SELECT id,state,body,record FROM tasks ORDER BY rowid DESC LIMIT 100 OFFSET ?', (offset,)).fetchall()
        tasks = []
        for task_id, state, body, record in rows:
            body, record = json.loads(body), json.loads(record)
            tasks.append(dict(id=task_id, state=state, title=body.get('title', task_id),
                              project=record.get('project', body.get('project', '')),
                              updatedAt=record.get('updatedAt', record.get('createdAt', 0))))
        health = read_json(home / 'health.json', {})
        owner = read_json(home / 'owner.json', {})
        config = read_json(home / 'projects.json', {'projects': []})
        import time
        active = owner.get('mode') == 'active' and owner.get('host', '').casefold() == socket.gethostname().casefold()
        return scrub(apply_supervisor(dict(host=socket.gethostname(), healthy=time.time() - health.get('lastTickAt', 0) < 120,
                          lastTickAt=health.get('lastTickAt', 0), acceptsTasks=active and allow_submit,
                          queue=counts, tasks=tasks, total=sum(counts.values()), offset=offset,
                          projects=[dict(id=p['id'], enabled=any(t.get('enabled') for t in p.get('targets', [])))
                                    for p in config.get('projects', [])]), home, read_json))
    finally:
        db.close()


def serve(state, allow_submit, stdin=None, stdout=None):
    """Resident mode for chat gateways: one JSON request per line in, one JSON line out.
    Avoids a Python cold start (and on Windows an AV scan) for every poll."""
    stdin = stdin or sys.stdin
    stdout = stdout or sys.stdout
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        try:
            if len(line) > MAX_INPUT:
                raise ValueError('Oversize request')
            result = handle(state, json.loads(line), allow_submit)
            out = json.dumps({'ok': True, 'result': result}, ensure_ascii=False)
        except (ValueError, OSError, sqlite3.Error, KeyError, TypeError):
            out = '{"ok":false,"error":"Bot GUI request failed. Check task, queue ownership and bridge permissions."}'
        stdout.write(out + '\n')
        stdout.flush()
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, default=Path.home() / '.config/paseo-bot')
    parser.add_argument('--allow-submit', action='store_true')
    parser.add_argument('--serve', action='store_true', help='resident JSON-lines mode for the Discord gateway')
    args = parser.parse_args()
    if args.serve:
        sys.stdin.reconfigure(encoding='utf-8')
        return serve(args.state, args.allow_submit)
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT + 1)
        if len(raw) > MAX_INPUT:
            raise ValueError('Oversize request')
        result = handle(args.state, json.loads(raw.decode('utf-8-sig')), args.allow_submit)
        sys.stdout.write(json.dumps({'ok': True, 'result': result}, ensure_ascii=False))
    except (ValueError, OSError, sqlite3.Error, KeyError, TypeError):
        sys.stdout.write('{"ok":false,"error":"Bot GUI request failed. Check task, queue ownership and bridge permissions."}')
        return 1
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
