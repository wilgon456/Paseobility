#!/usr/bin/env python3
"""Opt-in Ego GUI verification against a disposable loopback fixture.

No browser calls on import or without --live. An unexpected failure stops the
run and preserves its exact space ID; it never starts a replacement task or
finishes an errored/user-controlled space.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import threading
import uuid


class FixtureHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def end_headers(self):
        if self.path.split('?')[0] == '/download.txt':
            self.send_header('Content-Disposition', 'attachment; filename="download.txt"')
        super().end_headers()


def fixture(root):
    root.mkdir()
    (root / 'index.html').write_text('''<!doctype html><meta charset="utf-8">
<title>Paseobility Ego fixture</title><h1>Ego fixture</h1>
<label>Name<input id="name"></label><button id="apply" onclick="document.querySelector('#result').textContent=document.querySelector('#name').value">Apply</button><p id="result"></p>
<iframe title="Test frame" src="/frame.html"></iframe>
<a id="popup" href="/popup.html" target="_blank">Open fixture popup</a>
<a id="download" href="/download.txt" download>Download fixture</a>
<label>Upload fixture<input id="upload" type="file" onchange="this.files[0].text().then(t=>document.querySelector('#uploaded').textContent=t)"></label><p id="uploaded"></p>
''', encoding='utf-8')
    (root / 'frame.html').write_text('<label>Frame input<input id="frame-input"></label>', encoding='utf-8')
    (root / 'popup.html').write_text('<h1>Owned fixture popup</h1>', encoding='utf-8')
    (root / 'download.txt').write_bytes(b'paseobility-download-ok\n')


class EgoSmoke:
    def __init__(self, output, cli, timeout=45):
        self.output = Path(output).resolve()
        # Refuse existing artifacts; no replay/overwrite of a prior mutation.
        self.output.mkdir(parents=True, exist_ok=False)
        self.cli = cli
        self.timeout = timeout
        self.round = 0
        self.state_path = self.output / 'state.json'
        self.report = {'status': 'running', 'rounds': [], 'spaceId': None}

    def save_report(self):
        if self.state_path.exists():
            self.report['spaceId'] = json.loads(self.state_path.read_text(encoding='utf-8')).get('spaceId')
        (self.output / 'report.json').write_text(json.dumps(self.report, indent=2) + '\n', encoding='utf-8')

    def run(self, code, expected_failure=False):
        self.round += 1
        script = self.output / f'round-{self.round:02d}.mjs'
        # Inputs are literals in UTF-8 files; never shell interpolation/env.
        prefix = f'''const fs = await import("node:fs/promises");
const statePath = {json.dumps(self.state_path.as_posix())};
const readState = async () => JSON.parse(await fs.readFile(statePath, "utf8"));
const saveState = async value => {{
  const tmp = statePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(value), {{mode:0o600}});
  await fs.rename(tmp, statePath);
}};
'''
        script.write_text(prefix + code, encoding='utf-8')
        expression = 'await import(' + repr(script.as_uri()) + ')'
        try:
            result = subprocess.run([self.cli, 'nodejs', '-e', expression],
                                    capture_output=True, text=True, encoding='utf-8',
                                    timeout=self.timeout)
        except (subprocess.TimeoutExpired, OSError) as error:
            self.report['status'] = 'interrupted'
            self.report['reason'] = type(error).__name__
            self.save_report()
            raise RuntimeError('Round interrupted; inspect the recorded space before any retry') from error
        (self.output / f'round-{self.round:02d}.log').write_text(
            result.stdout + result.stderr, encoding='utf-8')
        self.report['rounds'].append({'round': self.round, 'exitCode': result.returncode})
        # Only this known deliberate local exception may advance to recovery.
        expected = (expected_failure and result.returncode != 0 and
                    'PASEOBILITY_INJECTED_INTERRUPTION' in result.stderr + result.stdout)
        if (result.returncode != 0 and not expected) or (expected_failure and not expected):
            self.report['status'] = 'failed'
            self.save_report()
            raise RuntimeError(f'Round {self.round} failed; preserve its space and inspect the log')
        self.save_report()

    def exercise(self, url):
        name = 'paseobility-smoke-' + uuid.uuid4().hex
        # Save intended name before creating the space, even if its reply is lost.
        self.state_path.write_text(json.dumps({'name': name}), encoding='utf-8')
        self.run(f'''
const state = await readState();
const before = (await listTaskSpaces()).map(s => s.id);
await saveState({{...state, before}});
const task = await taskSpace(state.name);
await saveState({{...state, before, spaceId:task.spaceId}});
await task.page("p1").goto({json.dumps(url)});
console.log(await task.page("p1").snapshot({{scope:"full_page"}}));
''')
        self.run('''
const state = await readState();
const task = await taskSpace(state.spaceId);
const page = task.page("p1");
if ((await task.pages()).length !== 1) throw Error("Duplicate initial page");
await page.fill("loc=css:#name", "Ego 입력 확인");
await page.click("loc=css:#apply", {label:"Apply fixture input"});
await page.waitForFunction(() => document.querySelector('#result').textContent === 'Ego 입력 확인');
await page.fill("loc=css:#frame-input", "iframe-ok");
await page.waitForFunction(() => document.querySelector('iframe').contentDocument.querySelector('#frame-input').value === 'iframe-ok');
console.log(await page.snapshot({scope:"full_page"}));
''')
        self.run('''
const state = await readState();
const task = await taskSpace(state.spaceId);
const page = task.page("p1");
const popupPromise = page.waitForEvent("popup", {timeout:10000});
await page.click("loc=css:#popup", {label:"Open owned test popup"});
const popup = await popupPromise;
await popup.waitForLoadState();
if (popup.openedBy !== "agent") throw Error("Unknown popup ownership; leave it untouched");
await popup.waitForFunction(() => document.querySelector('h1').textContent === 'Owned fixture popup');
await popup.close();
if ((await task.pages()).length !== 1) throw Error("Popup cleanup failed");
console.log({spaceId:task.spaceId, popupClosed:true});
''')
        download = self.output / 'download.txt'
        upload = self.output / 'upload.txt'
        upload.write_text('upload-한글-ok', encoding='utf-8')
        self.run(f'''
const state = await readState();
const task = await taskSpace(state.spaceId);
const page = task.page("p1");
const pending = page.waitForEvent("download", {{timeout:10000}});
await page.click("loc=css:#download", {{label:"Download fixture artifact"}});
const download = await pending;
await download.saveAs({json.dumps(download.as_posix())});
await page.setInputFiles("loc=css:#upload", [{json.dumps(upload.as_posix())}]);
await page.waitForFunction(() => document.querySelector('#uploaded').textContent === 'upload-한글-ok');
console.log(await page.snapshot());
''')
        if download.read_bytes() != b'paseobility-download-ok\n':
            raise RuntimeError('Downloaded artifact bytes differ')
        self.run('''
const state = await readState();
const task = await taskSpace(state.name);
if (task.spaceId !== state.spaceId) throw Error("Stable name created a duplicate space");
throw Error("PASEOBILITY_INJECTED_INTERRUPTION");
''', expected_failure=True)
        self.run(f'''
const state = await readState();
const task = await taskSpace(state.spaceId);
const page = task.page("p1");
for (let i=0; i<3; i++) {{
  await page.goto({json.dumps(url)} + "?cycle=" + i);
  await page.waitForFunction(() => document.querySelector('h1').textContent === 'Ego fixture');
  if ((await task.pages()).length !== 1) throw Error("Repeated navigation leaked a page");
}}
console.log(await page.snapshot());
const receipt = await task.finish({{keep:[]}});
await saveState({{...state, receipt}});
console.log(receipt);
''')
        # Observe independently; never call a finished TaskSpace or Page again.
        self.run('''
const state = await readState();
const after = (await listTaskSpaces()).map(s => s.id);
if (state.before.some(id => !after.includes(id))) throw Error("Pre-existing space changed");
if (!state.receipt.closedSpace || after.includes(state.spaceId)) throw Error("Space not closed; inspect protected/user tabs");
if (!state.receipt.closedManagedLabels.includes("p1")) throw Error("Missing p1 cleanup receipt");
console.log({verified:true, unrelatedSpacesPreserved:true});
''')
        self.report['status'] = 'passed'
        self.save_report()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Authorize transient tabs in the installed Ego browser')
    parser.add_argument('--out', type=Path, required=True, help='New artifact directory, never an existing directory')
    args = parser.parse_args(argv)
    if not args.live:
        parser.error('--live is required; this operates the real Ego browser')
    cli = shutil.which('ego-browser')
    if not cli:
        parser.error('ego-browser is unavailable; no installation or fallback attempted')
    runner = EgoSmoke(args.out, cli)
    try:
        guide = subprocess.run([cli, 'skill'], capture_output=True, text=True,
                               encoding='utf-8', timeout=30)
    except (subprocess.TimeoutExpired, OSError) as error:
        runner.report.update(status='failed', reason=type(error).__name__)
        runner.save_report()
        print('FAILED: runtime guide unavailable; no browser task created')
        return 1
    (runner.output / 'runtime-guide.md').write_text(guide.stdout, encoding='utf-8')
    if guide.returncode or '[ego-browser:skill] end of guide' not in guide.stdout:
        runner.report.update(status='failed', reason='incomplete-runtime-guide')
        runner.save_report()
        print('FAILED: runtime guide unavailable or truncated; no browser task created')
        return 1
    site = runner.output / 'fixture'
    fixture(site)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(FixtureHandler, directory=str(site)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        runner.exercise(f'http://127.0.0.1:{server.server_port}/index.html')
    except Exception as error:
        runner.report['status'] = 'failed'
        runner.report['reason'] = type(error).__name__
        runner.save_report()
        print(f'FAILED: {error}. Recovery state: {runner.state_path}')
        return 1
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    print(f'PASSED: {runner.output / "report.json"}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
