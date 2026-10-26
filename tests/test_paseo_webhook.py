"""Offline delivery/secret-boundary contracts. No live credentials or SDK required."""
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

TOOLS = Path(__file__).resolve().parents[1] / 'tools/paseo-bot'
sys.path.insert(0, str(TOOLS))
import sdk_secrets as s
import secret_store as store
import webhook_delivery as delivery
import webhook_queue as q


class SDK:
    def __init__(self):
        self.saved = None
        self.logins = []
        self.creates = 0
        self.updates = 0
    def auth(self): return self
    def projects(self): return self
    def secrets(self): return self
    def login_access_token(self, token, state): self.logins.append((token, state))
    def get(self, identity):
        return NS(data=NS(organization_id='org')) if identity == 'project' else NS(data=self.saved)
    def list(self, org): return NS(data=NS(data=[self.saved] if self.saved else []))
    def create(self, org, key, value, note, projects):
        self.creates += 1
        self.saved = NS(id='secret', key=key, value=value, note=note, project_id=projects[0])
        return NS(data=self.saved)
    def update(self, org, identity, key, value, note, projects):
        self.updates += 1
        self.saved = NS(id=identity, key=key, value=value, note=note, project_id=projects[0])
        return NS(data=self.saved)


class SecretsTests(unittest.TestCase):
    def test_sdk_diagnostics_are_suppressed_before_receipt_including_buffered_prints(self):
        # Exercise real OS pipes: SDK/native stderr bypasses redirect_stdout.
        import subprocess
        script = """import sys,os
sys.path.insert(0,sys.argv[1])
import sdk_secrets as s
with s.silent_sdk():
 print('private-buffered-value')
 os.write(2,b'private-native-value\\n')
 if os.name == 'nt':
  import ctypes
  from ctypes import wintypes
  kernel=ctypes.windll.kernel32
  kernel.GetStdHandle.argtypes=[wintypes.DWORD]
  kernel.GetStdHandle.restype=wintypes.HANDLE
  kernel.WriteFile.argtypes=[wintypes.HANDLE,wintypes.LPCVOID,wintypes.DWORD,wintypes.LPDWORD,wintypes.LPVOID]
  size=wintypes.DWORD()
  kernel.WriteFile(kernel.GetStdHandle((-12)&0xffffffff),b'private-win32-value',19,ctypes.byref(size),None)
print('safe-receipt')
"""
        result = subprocess.run([sys.executable, '-c', script, str(TOOLS)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), 'safe-receipt')
        self.assertEqual(result.stderr, '')

    def test_create_update_readback_in_memory_without_sdk_state_file(self):
        client = SDK()
        with patch.object(s, 'settings', return_value=('project', 'fake-machine-token')):
            vault = s.Vault(client=client)
        value = {'url': 'https://example.invalid/webhook/private-path', 'key': 'private-test-key'}
        vault.store(value)
        self.assertEqual(vault.read(), value)
        vault.store(dict(value, key='rotated-test-key'))
        self.assertEqual((client.creates, client.updates), (1, 1))
        self.assertEqual(client.logins, [('fake-machine-token', None)])

    def test_ambiguous_or_other_project_secret_is_never_overwritten(self):
        client = SDK()
        with patch.object(s, 'settings', return_value=('project', 'token')):
            vault = s.Vault(client=client)
        client.saved = NS(id='secret', key=s.SECRET_NAME, project_id='other')
        with self.assertRaises(ValueError): vault.store({'url': 'https://example.invalid', 'key': 'key'})
        self.assertEqual(client.updates, 0)
        client.list = lambda _: NS(data=NS(data=[client.saved, client.saved]))
        with self.assertRaises(ValueError): vault.find()

    def test_cli_accepts_only_stdin_and_never_echoes_exception_or_bad_argv(self):
        marker = 'sentinel-secret-value'
        class Broken:
            def __init__(self, _): raise RuntimeError(marker)
        for argv, raw in [(['store'], b'{"url":"https://example.invalid","key":"sentinel-secret-value"}'),
                          (['store', marker], b''), (['store'], marker.encode())]:
            out = io.StringIO()
            with redirect_stdout(out):
                rc = store.main(argv, io.BytesIO(raw), Broken)
            self.assertEqual(rc, 1)
            self.assertNotIn(marker, out.getvalue())
            self.assertEqual(json.loads(out.getvalue())['error'], 'secret-store-failed')

    def test_cli_store_receipt_contains_no_values(self):
        class InMemory:
            def __init__(self, _): pass
            def store(self, value): self.value = value
        value = {'url': 'https://example.invalid/secret-path', 'key': 'sentinel-key'}
        out = io.StringIO()
        with redirect_stdout(out):
            rc = store.main(['store'], io.BytesIO(json.dumps(value).encode()), InMemory)
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out.getvalue()), {'ok': True, 'operation': 'store'})

    def test_reject_credentials_http_fragments_header_injection_and_extra_fields(self):
        valid = {'url': 'https://example.invalid', 'key': 'key'}
        for value in [dict(valid, url='http://example.invalid'), dict(valid, url='https://u:p@example.invalid'),
                      dict(valid, url='https://example.invalid/#secret'), dict(valid, key='a\r\nb'),
                      dict(valid, extra='x')]:
            with self.assertRaises(ValueError): s.validate_secret(value)


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.db = sqlite3.connect(self.home / 'queue.sqlite3')
        q.initialize(self.db)
        (self.home / 'webhook.json').write_text(json.dumps({'enabled': True, 'python': sys.executable}))
        self.record = {'id': 'task-1', 'project': 'project', 'state': 'passed', 'summary': 'done', 'machine': 'VAXPORT'}
    def tearDown(self):
        self.db.close(); self.tmp.cleanup()
    def enqueue(self):
        with self.db: q.enqueue(self.db, self.record, {'requester': 'test', 'pr_url': 'https://github.com/a/b/pull/1'})
    def test_terminal_payload_dedupes_across_state_changes_and_reopen(self):
        self.enqueue()
        self.record['state'] = 'blocked'; self.enqueue()
        seen = []
        def send(config, payload, identity):
            seen.append((payload, identity)); return {'outcome': 'delivered', 'http_status': 204}
        q.drain(self.db, self.home, send, now=100)
        self.db.close(); self.db = sqlite3.connect(self.home / 'queue.sqlite3')
        q.drain(self.db, self.home, send, now=1000)
        self.assertEqual(len(seen), 1)
        self.assertEqual(set(seen[0][0]), {'task_id','project','machine','state','summary','pr_url','requester'})
        self.assertEqual(seen[0][0]['state'], 'passed')
    def test_initial_plus_three_retries_same_identity_and_durable_budget(self):
        self.enqueue(); identities = []
        def fail(config, payload, identity):
            identities.append(identity); return {'outcome': 'retry', 'http_status': 503, 'unsafe': 'discarded'}
        for n in range(10):
            q.drain(self.db, self.home, fail, now=1000*n)
        self.assertEqual(len(identities), 4)
        self.assertEqual(len(set(identities)), 1)
        self.assertEqual(self.db.execute('SELECT status,attempts FROM webhook_jobs').fetchone(), ('exhausted', 4))
        self.assertNotIn('discarded', (self.home/'queue.sqlite3').read_bytes().decode(errors='ignore'))
    def test_crash_after_claim_is_not_replayed(self):
        self.enqueue()
        with self.db: self.db.execute("UPDATE webhook_jobs SET status='sending',attempts=1")
        send = lambda *_: self.fail('ambiguous delivery must not replay')
        q.drain(self.db, self.home, send)
        self.assertEqual(self.db.execute('SELECT status FROM webhook_jobs').fetchone()[0], 'uncertain')
    def test_unknown_transport_failure_does_not_retry(self):
        self.enqueue()
        q.drain(self.db, self.home, lambda *_: {'outcome':'uncertain'}, now=1)
        q.drain(self.db, self.home, lambda *_: self.fail('must not replay'), now=100)
    def test_disabled_is_no_network_and_legacy_tasks_are_not_backfilled(self):
        self.assertEqual(self.db.execute('SELECT count(*) FROM webhook_jobs').fetchone()[0], 0)
        self.enqueue(); (self.home/'webhook.json').unlink()
        q.drain(self.db, self.home, lambda *_: self.fail('disabled'))
        self.assertEqual(self.db.execute('SELECT attempts FROM webhook_jobs').fetchone()[0], 0)
    def test_unrouted_blocked_task_identifies_the_resident_machine(self):
        del self.record['machine']
        with patch.object(q.socket, 'gethostname', return_value='VAXPORT'):
            self.enqueue()
        payload = json.loads(self.db.execute('SELECT payload FROM webhook_jobs').fetchone()[0])
        self.assertEqual(payload['machine'], 'VAXPORT')


class HTTPTests(unittest.TestCase):
    def test_authorization_payload_idempotency_and_no_redirects(self):
        class Response:
            status=202
            def __enter__(self): return self
            def __exit__(self,*_): pass
        with patch.object(delivery, 'build_opener') as make:
            make.return_value.open.return_value=Response()
            self.assertEqual(delivery.post({'url':'https://example.invalid','key':'raw-key'}, {'task_id':'one'}, 'stable')['outcome'], 'delivered')
            req=make.return_value.open.call_args.args[0]
            self.assertEqual(req.get_header('Authorization'), 'Bearer raw-key')
            self.assertEqual(req.get_header('Idempotency-key'), 'stable')
            self.assertEqual(json.loads(req.data), {'task_id':'one'})
            self.assertIsInstance(make.call_args.args[0], delivery.NoRedirect)
    def test_transient_rejections_retry_permanent_rejections_stop_transport_is_uncertain(self):
        for code, outcome in [(302,'rejected'),(401,'rejected'),(429,'retry'),(503,'retry')]:
            with patch.object(delivery,'build_opener') as make:
                make.return_value.open.side_effect=HTTPError('https://example.invalid', code, 'unsafe', {}, None)
                receipt=delivery.post({'url':'https://example.invalid','key':'key'}, {}, 'stable')
                self.assertEqual(receipt, {'outcome':outcome,'http_status':code})
        with patch.object(delivery,'build_opener') as make:
            make.return_value.open.side_effect=URLError('unsafe-secret-in-error')
            self.assertEqual(delivery.post({'url':'https://example.invalid','key':'key'}, {}, 'stable'), {'outcome':'uncertain'})


if __name__ == '__main__': unittest.main()
