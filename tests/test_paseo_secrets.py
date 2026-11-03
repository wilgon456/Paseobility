"""Offline secret-adapter contracts. No live credentials or SDK import required."""
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from types import SimpleNamespace as NS
from unittest.mock import patch

TOOLS = Path(__file__).resolve().parents[1] / 'tools/paseo-bot'
sys.path.insert(0, str(TOOLS))
import sdk_secrets as s
import secret_store as store

NAME = 'paseo-bot-discord-token'


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


def vault(client, **kwargs):
    with patch.object(s, 'settings', return_value=('project', 'fake-machine-token')):
        return s.Vault(client=client, **kwargs)


class VaultTests(unittest.TestCase):
    def test_store_and_verify_round_trip_with_read_back_and_no_sdk_state_file(self):
        client = SDK()
        v = vault(client)
        self.assertEqual((v.kind, v.name), ('discord-bot', NAME))
        v.store({'token': 'private-test-token'})
        self.assertEqual(v.read(), {'token': 'private-test-token'})
        v.store({'token': 'rotated-test-token'})
        self.assertEqual(v.read(), {'token': 'rotated-test-token'})
        self.assertEqual((client.creates, client.updates), (1, 1))
        self.assertEqual(client.logins, [('fake-machine-token', None)])

    def test_secret_name_and_kind_are_parameters(self):
        client = SDK()
        v = vault(client, name='custom-item')
        self.assertEqual(v.name, 'custom-item')
        v.store({'token': 'value-1'})
        self.assertEqual(client.saved.key, 'custom-item')
        for name in ['', 7, 'x' * 201]:
            with self.assertRaises(ValueError):
                vault(SDK(), name=name)
        with self.assertRaises(ValueError):
            vault(SDK(), kind='webhook')
        with self.assertRaises(ValueError):
            s.validate('webhook', {'token': 'value'})

    def test_read_back_mismatch_fails_closed(self):
        client = SDK()
        v = vault(client)
        client.get = lambda identity: NS(data=NS(key=NAME, value='{"token":"other"}', project_id='project'))
        with self.assertRaises(ValueError):
            v.store({'token': 'private-test-token'})

    def test_ambiguous_or_other_project_secret_is_never_overwritten(self):
        client = SDK()
        v = vault(client)
        client.saved = NS(id='secret', key=NAME, project_id='other')
        with self.assertRaises(ValueError): v.store({'token': 'private-test-token'})
        self.assertEqual((client.creates, client.updates), (0, 0))
        client.list = lambda _: NS(data=NS(data=[client.saved, client.saved]))
        with self.assertRaises(ValueError): v.find()
        client.list = lambda _: NS(data=NS(data=[]))
        with self.assertRaises(ValueError): v.read()

    def test_validation_rejects_missing_extra_empty_whitespace_control_and_long_values(self):
        for value in [{}, {'token': ''}, {'token': ' '}, {'token': 'a b'}, {'token': 'a\tb'}, {'token': 'a\x00b'},
                      {'token': 'a\x7fb'}, {'token': 'x' * 513}, {'token': 1}, {'token': 'ok', 'extra': 'x'},
                      {'secret': 'ok'}, 'token', None]:
            with self.assertRaises(ValueError): s.validate('discord-bot', value)
        self.assertEqual(s.validate('discord-bot', {'token': 'x' * 512}), {'token': 'x' * 512})
        with self.assertRaises(ValueError) as caught:
            s.validate('discord-bot', {'token': 'sentinel value'})
        self.assertNotIn('sentinel', str(caught.exception))

    def test_sdk_diagnostics_are_suppressed_before_receipt_including_buffered_prints(self):
        # Exercise real OS pipes: SDK/native stderr bypasses redirect_stdout.
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
        result = subprocess.run([sys.executable, '-c', script, str(TOOLS)], capture_output=True, text=True, encoding='utf-8', errors='replace')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), 'safe-receipt')
        self.assertEqual(result.stderr, '')


class StoreCliTests(unittest.TestCase):
    class InMemory:
        def __init__(self, config=None, name=None, kind='discord-bot'):
            self.config, self.name, self.kind = config, name, kind
            self.value = None
        def store(self, value): self.value = value
        def read(self): return {'token': 'stored-value'}

    def test_store_and_verify_print_only_ok_json_and_never_the_value(self):
        value = {'token': 'sentinel-token-value'}
        out = io.StringIO()
        with redirect_stdout(out):
            rc = store.main(['store'], io.BytesIO(json.dumps(value).encode()), self.InMemory)
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out.getvalue()), {'ok': True, 'operation': 'store'})
        self.assertNotIn('sentinel-token-value', out.getvalue())
        out = io.StringIO()
        with redirect_stdout(out):
            rc = store.main(['verify'], None, self.InMemory)
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out.getvalue()), {'ok': True, 'operation': 'verify'})
        self.assertNotIn('stored-value', out.getvalue())

    def test_kind_and_name_reach_the_vault(self):
        seen = {}
        class Recording:
            def __init__(self, config=None, name=None, kind='discord-bot'):
                seen.update(config=config, name=name, kind=kind)
        out = io.StringIO()
        with redirect_stdout(out):
            rc = store.main(['check', '--name', 'custom-item'], None, Recording)
        self.assertEqual(rc, 0)
        self.assertEqual(seen, {'config': None, 'name': 'custom-item', 'kind': 'discord-bot'})

    def test_cli_never_echoes_exception_argv_or_bad_values(self):
        marker = 'sentinel-secret-value'
        class Broken:
            def __init__(self, *_, **__): raise RuntimeError(marker)
        for argv, raw in [(['store'], json.dumps({'token': marker}).encode()),
                          (['store', marker], b''),
                          (['store', '--name', marker], b''),
                          (['store', '--kind', 'webhook'], b''),
                          (['store'], marker.encode()),
                          (['store'], json.dumps({'token': 'has whitespace'}).encode())]:
            out = io.StringIO()
            with redirect_stdout(out):
                rc = store.main(argv, io.BytesIO(raw), Broken)
            self.assertEqual(rc, 1)
            self.assertNotIn(marker, out.getvalue())
            self.assertEqual(json.loads(out.getvalue())['error'], 'secret-store-failed')


if __name__ == '__main__': unittest.main()
