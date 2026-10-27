"""GUI bridge isolation/admission contracts; no production queue or network."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/paseo-bot'))
import gui_api as gui
from paseo_bot import Bot, write_json


class GuiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name) / 'state'
        self.bot = Bot(self.home)
        write_json(self.home / 'projects.json', {'version': 1, 'projects': [{'id': 'fixture', 'targets': [{'machine': 'TEST', 'repo': '/fixture', 'defaultBranch': 'main', 'enabled': True, 'gates': ['echo test'], 'deployCommands': [], 'skills': []}]}]})
        write_json(self.home / 'owner.json', {'version': 1, 'host': socket.gethostname().casefold(), 'mode': 'active'})
        write_json(self.home / 'health.json', {'lastTickAt': time.time()})
        self.task = dict(id='gui-test-1', project='fixture', title='한글 작업', prompt='오류 수정', kind='gpt')

    def tearDown(self):
        self.bot.db.close()
        self.tmp.cleanup()

    def test_read_only_default_and_idempotent_submit(self):
        with self.assertRaises(ValueError): gui.handle(self.home, dict(action='submit', task=self.task))
        for _ in range(2): self.assertEqual(gui.handle(self.home, dict(action='submit', task=self.task), True)['id'], self.task['id'])
        self.assertEqual(self.bot.db.execute('SELECT count(*) FROM tasks').fetchone()[0], 1)
        with self.assertRaises(ValueError): gui.handle(self.home, dict(action='submit', task=dict(self.task, title='changed')), True)

    def test_status_does_not_mutate_database_or_expose_policy(self):
        self.bot.submit(self.task)
        db = self.home / 'queue.sqlite3'
        before = (db.stat().st_mtime_ns, hashlib.sha256(db.read_bytes()).digest())
        out = gui.handle(self.home, dict(action='status'), True)
        self.assertEqual(before, (db.stat().st_mtime_ns, hashlib.sha256(db.read_bytes()).digest()))
        self.assertTrue(out['healthy']); self.assertTrue(out['acceptsTasks'])
        self.assertEqual(out['queue'], {'queued': 1})
        self.assertEqual(out['tasks'][0]['title'], '한글 작업')
        self.assertEqual(out['projects'], [{'id': 'fixture', 'enabled': True}])
        self.assertNotIn('repo', json.dumps(out)); self.assertNotIn('prompt', json.dumps(out))
        self.assertFalse(gui.handle(self.home, dict(action='status'))['acceptsTasks'])

    def test_row_model_tracks_routing_and_active_fallback(self):
        self.bot.submit(dict(self.task, id='hard-1', kind='hard'))
        self.bot.submit(dict(self.task, id='legacy-1', model='terra'))
        self.bot.save(dict(self.bot.submit(dict(self.task, id='fallback-1')), model='go'))
        rows = {row['id']: row['model'] for row in gui.handle(self.home, dict(action='sync'))['tasks']}
        self.assertEqual(rows, {'hard-1': 'claude', 'legacy-1': 'sol', 'fallback-1': 'go'})

    def test_missing_db_is_not_created(self):
        absent = self.home / 'missing'
        with self.assertRaises((OSError, ValueError)): gui.handle(absent, dict(action='status'))
        self.assertFalse(absent.exists())

    def test_result_redacts_and_rejects_bad_id(self):
        record = self.bot.submit(self.task)
        self.bot.save(dict(record, summary='token=fixture-secret-value', secret='fixture-private-value'))
        raw = json.dumps(gui.handle(self.home, dict(action='result', id=self.task['id'])))
        self.assertNotIn('fixture-secret-value', raw); self.assertNotIn('fixture-private-value', raw)
        for value in ['../owner', "' OR 1=1 --", '', None]:
            with self.assertRaises(ValueError): gui.handle(self.home, dict(action='result', id=value))

    def test_pagination_counts_and_order(self):
        for i in range(102): self.bot.submit(dict(self.task, id=f'task-{i}'))
        first = gui.handle(self.home, dict(action='status'))
        second = gui.handle(self.home, dict(action='status', offset=100))
        self.assertEqual((first['total'], len(first['tasks']), len(second['tasks'])), (102, 100, 2))
        self.assertEqual(first['tasks'][0]['id'], 'task-101')
        for offset in [-1, True, '100', 1000001]:
            with self.assertRaises(ValueError): gui.handle(self.home, dict(action='status', offset=offset))

    def test_retired_owner_cannot_submit(self):
        write_json(self.home / 'owner.json', {'version': 1, 'host': socket.gethostname().casefold(), 'mode': 'retired'})
        self.assertFalse(gui.handle(self.home, dict(action='status'), True)['acceptsTasks'])
        with self.assertRaises(ValueError): gui.handle(self.home, dict(action='submit', task=self.task), True)

    def test_no_arbitrary_command_or_path(self):
        for request in [dict(action='serve'), dict(action='status', state='/other'), dict(action='result', id='x', command='whoami'), [], None]:
            with self.assertRaises(ValueError): gui.handle(self.home, request)

    def test_errors_are_generic_and_request_is_bounded(self):
        script = str(ROOT / 'tools/paseo-bot/gui_api.py')
        for payload in [b'{"action":"status","password":"test-never-print"}', b'x' * 200001]:
            r = subprocess.run([sys.executable, script, '--state', str(self.home)], input=payload, capture_output=True)
            self.assertEqual(r.returncode, 1); self.assertNotIn(b'test-never-print', r.stdout + r.stderr)
            self.assertFalse(json.loads(r.stdout)['ok']); self.assertEqual(r.stderr, b'')

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell byte-stream integration')
    def test_windows_wrapper_stdio_readonly_submit_and_result(self):
        script = str(ROOT / 'tools/paseo-bot/gui-bridge.ps1')
        def call(request, writable=False):
            args = ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-State', str(self.home)]
            if writable: args.append('-AllowSubmit')
            r = subprocess.run(args, input=json.dumps(request, ensure_ascii=False).encode('utf-8'), capture_output=True, timeout=30)
            return r, json.loads(r.stdout.decode('utf-8-sig'))
        r, denied = call(dict(action='submit', task=self.task))
        self.assertNotEqual(r.returncode, 0); self.assertFalse(denied['ok'])
        for _ in range(2):
            r, out = call(dict(action='submit', task=self.task), True)
            self.assertEqual(r.returncode, 0, r.stdout); self.assertTrue(out['ok'])
        r, status = call(dict(action='status'), True)
        self.assertEqual(status['result']['tasks'][0]['title'], '한글 작업')
        r, result = call(dict(action='result', id=self.task['id']))
        self.assertEqual(result['result']['state'], 'queued')


if __name__ == '__main__': unittest.main()
