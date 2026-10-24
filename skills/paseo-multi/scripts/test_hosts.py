"""Offline invariants: target identity, lifecycle protection, ownership and redaction."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import uuid

SCRIPT = Path(__file__).with_name('hosts.py')
FAKE_CLIENT = '''
import fs from 'node:fs';
const mode=process.env.MULTI_HOST_TEST_MODE;
const mark=name=>fs.appendFileSync(process.env.MULTI_HOST_TEST_CALLS,name+'\\n');
export const connectToDaemon = mode==='missing-connect' ? undefined : async (options) => {
 if(mode==='redact') throw Error('failed '+options.target.host+' secret-key-123');
 const oldClient=mode.startsWith('old-client');
 return {
  getDaemonStatus:async()=>({serverId:mode==='mismatch'?'other':'expected',
   version:mode==='old-client-011'?'0.11.4':mode==='old-client-012'?'0.12.0':'test'}),
  // 0.12+ clients expose the host feature and throw if the flag reaches a host without it.
  ...(oldClient?{}:{supportsBackgroundWorkspaces:()=>mode!=='old-host'}),
  fetchAgents:async options=>{
   if(mode==='old-host'&&'includeBackground' in options) throw Error('Update the host to use background workspaces.');
   if(mode==='background-busy') return {entries:[{agent:{id:'a',status:'idle'}},
    ...(options.includeBackground?[{agent:{id:'bg',status:'running',workspaceId:'wks_bg'}}]:[])],
    pageInfo:{hasMore:false}};
   const later=!!options.page?.cursor;
   const multi=['pages-idle','pages-busy','loop','duplicate'].includes(mode);
   return {
    entries:[{agent:{id:later&&mode!=='duplicate'?'b':'a',
     status:mode==='busy'||(mode==='pages-busy'&&later)?'running':mode==='unknown'?'surprise':mode==='exited'?'exited':'idle',
     requiresAttention:mode==='finished'||mode==='attention',
     attentionReason:mode==='finished'?'finished':['permission','attention','reason-only'].includes(mode)?'permission':undefined,
     pendingPermissionCount:mode==='bad-count'?'unknown':mode==='permission'?1:0}}],
    pageInfo:mode==='schema'?undefined:{hasMore:mode==='paginated'||mode==='loop'||(multi&&!later),
     nextCursor:multi&&(!later||mode==='loop')?'next':undefined}
   }
  },
  restartServer:async()=>{mark('restart');return {ack:true}},
  createTerminal:async(cwd,name,requestId,opts)=>{
   if(mode==='ws-required'&&!opts?.workspaceId) return {error:{message:'workspaceId is required'}};
   mark(opts?.workspaceId?'exec:'+opts.workspaceId:'exec');throw Error('mutation reached')},
  listTerminals:async()=>({terminals:[{id:'terminal',name:'somebody-elses-terminal'}]}),
  killTerminal:async()=>{mark('kill');return {}},
  close:async()=>{}
 }
};
'''


@unittest.skipUnless(shutil.which('node'), 'Node required for offline adapter tests')
class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.config = self.root / 'hosts.json'
        self.module = self.root / 'client.mjs'
        self.module.write_text(FAKE_CLIENT)
        self.calls = self.root / 'calls'
        self.script = self.root / 'read.sh'
        self.script.write_text('printf READ_ONLY')
        self.host = {'label': 'PC', 'aliases': ['my pc'], 'platform': 'macos',
                     'serverId': 'expected', 'endpoint': 'tcp://example:6767?password=secret-key-123'}
        self.config.write_text(json.dumps({'hosts': [self.host]}))
        self.config.chmod(0o600)

    def tearDown(self):
        self.temp.cleanup()

    def invoke(self, mode, *args):
        env = dict(os.environ, PASEO_MULTI_HOST_CLIENT_MODULE=str(self.module),
                   PASEO_MULTI_HOST_NODE=shutil.which('node'),
                   MULTI_HOST_TEST_MODE=mode, MULTI_HOST_TEST_CALLS=str(self.calls))
        p = subprocess.run([sys.executable, str(SCRIPT), '--config', str(self.config), *args],
                           env=env, capture_output=True, text=True, encoding='utf-8', timeout=15)
        return p, json.loads(p.stdout)

    def assert_no_mutation(self):
        self.assertFalse(self.calls.exists(), 'remote mutation was called')

    def test_identity_mismatch_blocks_exec(self):
        p, d = self.invoke('mismatch', 'exec', 'PC', '--file', str(self.script))
        self.assertNotEqual(p.returncode, 0)
        self.assertIn('identity', d['error'])
        self.assert_no_mutation()

    def test_state_collision_blocks_remote_execution(self):
        (self.root / 'runs').write_text('existing file')
        p, d = self.invoke('idle', 'exec', 'PC', '--file', str(self.script))
        self.assertFalse(d['ok'])
        self.assert_no_mutation()

    def test_lost_create_response_keeps_recovery_record(self):
        p, d = self.invoke('idle', 'exec', 'PC', '--file', str(self.script))
        self.assertFalse(d['ok'])
        records = list((self.root / 'runs').glob('*.json'))
        self.assertEqual(len(records), 1)
        record = json.loads(records[0].read_text())
        self.assertIn(record['runId'], d['error'])
        self.assertIsNone(record['terminalId'])
        self.assertEqual(record['host'], 'PC')
        p, d = self.invoke('idle', 'runs')
        self.assertEqual(d['result'][0]['runId'], record['runId'])

    def test_workspace_required_reason_and_option(self):
        p, d = self.invoke('ws-required', 'exec', 'PC', '--file', str(self.script))
        self.assertFalse(d['ok'])
        self.assertIn('workspaceId is required', d['error'])
        self.assertIn('--workspace', d['error'])
        self.assert_no_mutation()
        p, d = self.invoke('ws-required', 'exec', 'PC', '--workspace', 'wks_1', '--file', str(self.script))
        self.assertFalse(d['ok'])
        self.assertEqual(self.calls.read_text(), 'exec:wks_1\n')

    def test_large_windows_script_rejected_before_dispatch(self):
        self.script.write_text('Write-Output "large"\n' * 3000)
        p, d = self.invoke('idle', 'exec', 'PC', '--file', str(self.script), '--shell', 'powershell')
        self.assertFalse(d['ok'])
        self.assertIn('command-line limit', d['error'])
        self.assert_no_mutation()

    def test_busy_unknown_permission_and_pagination_block_restart(self):
        for mode in ['busy', 'unknown', 'exited', 'permission', 'attention', 'reason-only',
                     'bad-count', 'paginated', 'pages-busy', 'loop', 'duplicate', 'schema']:
            with self.subTest(mode=mode):
                p, d = self.invoke(mode, 'restart', 'PC')
                self.assertFalse(d['ok'])
                self.assertNotEqual(p.returncode, 0)
                self.assert_no_mutation()

    def test_restart_and_listing_read_all_pages(self):
        p, d = self.invoke('pages-idle', 'agents', 'PC')
        self.assertEqual(p.returncode, 0)
        self.assertEqual([a['id'] for a in d['result']['agents']], ['a', 'b'])
        self.assert_no_mutation()
        p, d = self.invoke('pages-idle', 'restart', 'PC')
        self.assertEqual(p.returncode, 0)
        self.assertTrue(d['result']['acknowledged']['ack'])
        self.assertEqual(self.calls.read_text(), 'restart\n')

    def test_background_workspace_agents_are_listed_and_block_restart(self):
        p, d = self.invoke('background-busy', 'agents', 'PC')
        self.assertEqual(p.returncode, 0)
        self.assertEqual([a['id'] for a in d['result']['agents']], ['a', 'bg'])
        self.assertNotIn('warning', d['result'])
        p, d = self.invoke('background-busy', 'restart', 'PC')
        self.assertFalse(d['ok'])
        self.assert_no_mutation()

    def test_old_client_cannot_see_background_agents_on_012_host(self):
        p, d = self.invoke('old-client-012', 'agents', 'PC')
        self.assertEqual(p.returncode, 0)
        self.assertIn('Background-workspace agents', d['result']['warning'])
        p, d = self.invoke('old-client-012', 'restart', 'PC')
        self.assertFalse(d['ok'])
        self.assert_no_mutation()
        p, d = self.invoke('old-client-012', 'restart', 'PC', '--force')
        self.assertEqual(p.returncode, 0)
        self.assertIn('unknown', [a['id'] for a in d['result']['interruptedAgents']])

    def test_pre_012_hosts_and_clients_still_restart_when_idle(self):
        for mode in ['old-client-011', 'old-host']:
            with self.subTest(mode=mode):
                if self.calls.exists():
                    self.calls.unlink()
                p, d = self.invoke(mode, 'restart', 'PC')
                self.assertEqual(p.returncode, 0, d)
                self.assertEqual(self.calls.read_text(), 'restart\n')

    def test_finished_attention_does_not_block_restart(self):
        p, d = self.invoke('finished', 'restart', 'PC')
        self.assertEqual(p.returncode, 0)
        self.assertTrue(d['result']['acknowledged']['ack'])
        self.assertEqual(self.calls.read_text(), 'restart\n')

    def test_exact_alias_and_unknown_name(self):
        p, d = self.invoke('idle', 'status', 'MY PC')
        self.assertEqual(p.returncode, 0)
        self.assertEqual(d['result']['host'], 'PC')
        p, d = self.invoke('idle', 'status', 'my')
        self.assertFalse(d['ok'])
        self.assert_no_mutation()

    def test_utf8_registry_and_json_output(self):
        self.host['label'] = '테스트 컴퓨터'
        self.config.write_text(json.dumps({'hosts': [self.host]}, ensure_ascii=False), encoding='utf-8')
        p, d = self.invoke('idle', 'status', '테스트 컴퓨터')
        self.assertEqual(p.returncode, 0)
        self.assertEqual(d['result']['host'], '테스트 컴퓨터')

    def test_changed_client_interface_is_named(self):
        p, d = self.invoke('missing-connect', 'status', 'PC')
        self.assertFalse(d['ok'])
        self.assertEqual(d['error'],
                         'Installed Paseo client interface changed: missing connectToDaemon')
        self.assert_no_mutation()

    def test_private_connection_redacted(self):
        p, d = self.invoke('redact', 'status', 'PC')
        self.assertFalse(d['ok'])
        self.assertNotIn('secret-key-123', p.stdout + p.stderr)
        self.assertNotIn('tcp://example', p.stdout + p.stderr)

    def test_cli_target_override_rejected(self):
        p, d = self.invoke('idle', 'cli', 'PC', '--', 'ls', '--host=somewhere-else')
        self.assertFalse(d['ok'])
        self.assert_no_mutation()

    def test_close_refuses_other_terminal(self):
        run_id = str(uuid.uuid4())
        runs = self.root / 'runs'
        runs.mkdir()
        (runs / (run_id + '.json')).write_text(json.dumps({'runId': run_id, 'host': 'PC',
            'serverId': 'expected', 'terminalId': 'terminal', 'name': 'paseo-multi-' + run_id}))
        p, d = self.invoke('idle', 'close', run_id, '--interrupt')
        self.assertFalse(d['ok'])
        self.assertIn('ownership', d['error'])
        self.assert_no_mutation()

    def test_inline_command_dispatches_without_file(self):
        p, d = self.invoke('idle', 'exec', 'PC', '--command', 'uname -a')
        self.assertEqual(self.calls.read_text(), 'exec\n')
        p = subprocess.run([sys.executable, str(SCRIPT), '--config', str(self.config), 'exec', 'PC',
                            '--command', 'x', '--file', str(self.script)], capture_output=True, text=True)
        self.assertNotEqual(p.returncode, 0)

    def test_force_restart_reports_interrupted_agents(self):
        p, d = self.invoke('busy', 'restart', 'PC', '--force')
        self.assertEqual(p.returncode, 0)
        self.assertEqual([a['id'] for a in d['result']['interruptedAgents']], ['a'])
        self.assertEqual(self.calls.read_text(), 'restart\n')
        self.calls.unlink()
        p, d = self.invoke('schema', 'restart', 'PC', '--force')
        self.assertEqual(p.returncode, 0)
        self.assertEqual(d['result']['interruptedAgents'][0]['id'], 'unknown')

    def test_cli_allows_daemon_status_but_not_lifecycle(self):
        echo = shutil.which('echo')
        os.environ['PASEO_MULTI_HOST_CLI'] = echo
        try:
            p, d = self.invoke('idle', 'cli', 'PC', '--', 'daemon', 'status', '--json')
            self.assertEqual(p.returncode, 0)
            self.assertIn('daemon status', d['result']['stdout'])
            for cmd in (['daemon', 'stop'], ['daemon', 'restart'], ['daemon', 'pair'], ['pair']):
                p, d = self.invoke('idle', 'cli', 'PC', '--', *cmd)
                self.assertFalse(d['ok'])
        finally:
            del os.environ['PASEO_MULTI_HOST_CLI']
        self.assert_no_mutation()

    def test_import_merges_into_existing_registry(self):
        source = self.root / 'export.json'
        other = {**self.host, 'label': 'PC2', 'aliases': [], 'serverId': 'other'}
        renamed = {**self.host, 'label': 'PC-RENAMED'}
        source.write_text(json.dumps([other, renamed]))
        p, d = self.invoke('idle', 'import-saved', str(source))
        self.assertEqual(p.returncode, 0)
        labels = [h['label'] for h in json.loads(self.config.read_text())['hosts']]
        self.assertEqual(sorted(labels), ['PC-RENAMED', 'PC2'])

    def test_import_duplicate_alias_keeps_existing_registry(self):
        source = self.root / 'export.json'
        source.write_text(json.dumps([self.host, {**self.host, 'label': 'PC2'}]))
        before = self.config.read_bytes()
        p, d = self.invoke('idle', 'import-saved', str(source), '--replace')
        self.assertFalse(d['ok'])
        self.assertEqual(before, self.config.read_bytes())


if __name__ == '__main__':
    unittest.main()
