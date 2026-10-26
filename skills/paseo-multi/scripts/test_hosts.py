"""Offline invariants: target identity, lifecycle protection, ownership and redaction."""
import json
import concurrent.futures
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import uuid
from unittest.mock import patch

import health
import remote_health

SCRIPT = Path(__file__).with_name('hosts.py')
FAKE_CLIENT = '''
import fs from 'node:fs';
import path from 'node:path';
const mode=process.env.MULTI_HOST_TEST_MODE;
const mark=name=>fs.appendFileSync(process.env.MULTI_HOST_TEST_CALLS,name+'\\n');
export const connectToDaemon = mode==='missing-connect' ? undefined : async (options) => {
 if(mode==='redact') throw Error('failed '+options.target.host+' secret-key-123');
 const state=process.env.MULTI_HOST_TEST_CALLS+'.terminal';
 if(mode.startsWith('run-')) return {
  getDaemonStatus:async()=>({serverId:'expected',version:'0.13.0',pid:999}),
  supportsBackgroundWorkspaces:()=>true,
  fetchAgents:async()=>({entries:[],pageInfo:{hasMore:false}}),
  createTerminal:async(cwd,name,requestId,opts)=>{
   mark('exec');
   const terminal={id:name,name};
   fs.writeFileSync(state,JSON.stringify(terminal));
   fs.writeFileSync(state+'.options',JSON.stringify(opts));
   if(mode==='run-save-failure') fs.fsyncSync=()=>{throw Error('disk unavailable')};
   if(mode==='run-readback-failure') {
    const read=fs.readFileSync;
    fs.readFileSync=(file,...args)=>{
     if(String(file).includes('results')&&String(file).endsWith('.json')) throw Error('readback failed');
     return read(file,...args);
    };
   }
   return {terminal};
  },
  listTerminals:async()=>({terminals:fs.existsSync(state)?[JSON.parse(fs.readFileSync(state))]:[]}),
  captureTerminal:async()=>{
   const t=JSON.parse(fs.readFileSync(state));
   const id=t.name.slice('paseo-multi-'.length);
   const code=mode==='run-fail'?1:mode==='run-cancel'?130:0;
   const begin='PASEO_RUN_'+id+'_BEGIN';
   const end='PASEO_RUN_'+id+'_EXIT='+code;
   if(mode==='run-invalid') return {error:'capture unavailable'};
   const lines=[...(mode==='run-truncated'?[]:[begin]),'result 한글 secret-key-123',
    ...(mode==='run-pending'||mode==='run-input'?[]:[end]),
    ...(mode==='run-trailing'?['background output']:[]),
    ...(mode==='run-duplicate-marker'?[end]:[])];
   return {lines};
  },
  killTerminal:async()=>{
   mark('kill');
   // Closing is forbidden until the receipt is already durable and readable.
   if(!['run-manual','run-cleanup'].includes(mode)) {
    const t=JSON.parse(fs.readFileSync(state));
    const base=path.dirname(process.env.MULTI_HOST_TEST_CALLS);
    const receipt=JSON.parse(fs.readFileSync(base+'/runs/results/'+t.name.slice(12)+'.json'));
    if(receipt.result.exitCode!==0||!receipt.result.output) throw Error('missing receipt');
   }
   if(mode==='run-kill-error') return {error:'refused'};
   fs.unlinkSync(state);
   if(mode==='run-kill-lost') throw Error('lost response');
   return {};
  },
  close:async()=>{}
 };
 const oldClient=mode.startsWith('old-client');
 return {
  getDaemonStatus:async()=>({serverId:mode==='mismatch'?'other':'expected',
   pid:999,version:mode==='old-client-011'?'0.11.4':mode==='old-client-012'?'0.12.0':'test'}),
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
        self.module.write_text(FAKE_CLIENT, encoding='utf-8')
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

    def run_command(self, mode='run-success', *extra):
        return self.invoke(mode, 'exec', 'PC', '--command', 'printf done', '--wait', '0', *extra)

    def test_success_saved_before_close_and_repeated_capture(self):
        p, d = self.run_command()
        self.assertEqual(p.returncode, 0, d)
        result = d['result']
        self.assertEqual(result['terminalState'], 'closed')
        self.assertTrue(result['resultSaved'])
        receipt = self.root / 'runs/results' / (result['runId'] + '.json')
        saved = json.loads(receipt.read_text(encoding='utf-8'))
        self.assertEqual(saved['result']['output'], result['output'])
        self.assertNotIn('secret-key-123', receipt.read_text(encoding='utf-8'))
        if os.name != 'nt':
            self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
        p, again = self.invoke('run-success', 'capture', result['runId'])
        self.assertEqual(p.returncode, 0, again)
        self.assertEqual(again['result']['output'], result['output'])
        self.assertEqual(again['result']['terminalState'], 'closed')
        self.assertEqual(self.calls.read_text(encoding='utf-8').count('kill'), 1)
        p, closed = self.invoke('run-success', 'close', result['runId'])
        self.assertEqual(closed['result']['status'], 'already absent')

    def test_errors_cancellation_pending_and_incomplete_output_are_retained(self):
        for mode in ['run-fail', 'run-cancel', 'run-pending', 'run-input',
                     'run-truncated', 'run-trailing', 'run-duplicate-marker', 'run-invalid']:
            with self.subTest(mode=mode):
                self.calls.unlink(missing_ok=True)
                p, d = self.run_command(mode)
                self.assertNotIn('kill', self.calls.read_text(encoding='utf-8'))
                self.assertTrue(Path(str(self.calls) + '.terminal').exists())
                self.assertEqual(list((self.root / 'runs').glob('results/*.json')), [])

    def test_persistence_collision_does_not_close(self):
        (self.root / 'runs').mkdir()
        (self.root / 'runs/results').write_text('do not overwrite')
        p, d = self.run_command()
        self.assertNotIn('kill', self.calls.read_text(encoding='utf-8'))
        self.assertEqual((self.root / 'runs/results').read_text(encoding='utf-8'), 'do not overwrite')

    def test_write_sync_and_readback_failures_preserve_terminal(self):
        for mode in ['run-save-failure', 'run-readback-failure']:
            with self.subTest(mode=mode):
                self.calls.unlink(missing_ok=True)
                p, d = self.run_command(mode)
                self.assertEqual(p.returncode, 0, d)
                self.assertEqual(d['result']['terminalState'], 'retained')
                self.assertNotIn('kill', self.calls.read_text(encoding='utf-8'))
                self.assertTrue(Path(str(self.calls) + '.terminal').exists())

    def test_corrupted_receipt_blocks_close(self):
        p, d = self.run_command('run-kill-error')
        run_id = d['result']['runId']
        receipt = self.root / 'runs/results' / (run_id + '.json')
        receipt.write_text('{broken')
        p, d = self.invoke('run-success', 'capture', run_id)
        self.assertFalse(d['ok'])
        self.assertEqual(self.calls.read_text(encoding='utf-8').count('kill'), 1)

    @unittest.skipIf(os.name == 'nt', 'POSIX symlink and mode tests')
    def test_linked_or_public_result_storage_never_closes(self):
        (self.root / 'runs').mkdir()
        outside = self.root / 'outside'
        outside.mkdir(mode=0o700)
        result_dir = self.root / 'runs/results'
        result_dir.symlink_to(outside, target_is_directory=True)
        p, d = self.run_command()
        self.assertNotIn('kill', self.calls.read_text(encoding='utf-8'))
        self.assertEqual(list(outside.iterdir()), [])
        result_dir.unlink()
        result_dir.mkdir(mode=0o755)
        p, d = self.run_command()
        self.assertNotIn('kill', self.calls.read_text(encoding='utf-8'))

    def test_keep_terminal_and_legacy_runs_never_auto_close(self):
        p, d = self.run_command('run-success', '--keep-terminal')
        self.assertEqual(p.returncode, 0, d)
        run_id = d['result']['runId']
        self.assertNotIn('cleanupPolicy', json.loads((self.root / 'runs' / (run_id + '.json')).read_text(encoding='utf-8')))
        p, d = self.invoke('run-success', 'capture', run_id)
        self.assertEqual(p.returncode, 0, d)
        self.assertNotIn('kill', self.calls.read_text(encoding='utf-8'))

    def test_pending_later_succeeds_and_concurrent_captures_close_once(self):
        p, d = self.run_command('run-pending')
        run_id = d['result']['runId']
        self.assertEqual(d['result']['status'], 'running')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            replies = list(pool.map(lambda _: self.invoke('run-success', 'capture', run_id), range(2)))
        self.assertTrue(any(d['ok'] for p, d in replies))
        self.assertEqual(self.calls.read_text(encoding='utf-8').count('kill'), 1)
        p, d = self.invoke('run-success', 'capture', run_id)
        self.assertEqual(d['result']['terminalState'], 'closed')

    def test_lost_close_reply_is_recovered_without_duplicate_kill(self):
        p, d = self.run_command('run-kill-lost')
        self.assertEqual(d['result']['terminalState'], 'close-unconfirmed')
        p, d = self.invoke('run-success', 'capture', d['result']['runId'])
        self.assertEqual(d['result']['terminalState'], 'closed')
        self.assertEqual(self.calls.read_text(encoding='utf-8').count('kill'), 1)

    def test_refused_close_keeps_saved_result_and_never_repeats_kill(self):
        p, d = self.run_command('run-kill-error')
        self.assertEqual(d['result']['terminalState'], 'close-unconfirmed')
        p, d = self.invoke('run-success', 'capture', d['result']['runId'])
        self.assertEqual(d['result']['terminalState'], 'close-unconfirmed')
        self.assertEqual(self.calls.read_text(encoding='utf-8').count('kill'), 1)

    def test_sequential_runs_have_separate_receipts(self):
        ids = []
        for _ in range(2):
            p, d = self.run_command()
            self.assertEqual(d['result']['terminalState'], 'closed')
            ids.append(d['result']['runId'])
        self.assertNotEqual(*ids)
        self.assertEqual(len(list((self.root / 'runs/results').glob('*.json'))), 2)

    @unittest.skipIf(os.name == 'nt', 'Bash wrapper execution on POSIX')
    def test_bash_wrapper_preserves_output_and_exit_marker(self):
        import signal
        for command, expected in [("printf 'ENV=%s\\n' \"$PASEO_MULTI_SESSION\"; printf 'quoted\\noutput'; exit 0", 0), ("printf 'failure'; exit 7", 7)]:
            p, d = self.invoke('run-success', 'exec', 'PC', '--command', command,
                               '--wait', '0', '--keep-terminal')
            self.assertEqual(p.returncode, 0, d)
            options = json.loads(Path(str(self.calls) + '.terminal.options').read_text(encoding='utf-8'))
            proc = subprocess.Popen([options['command'], *options['args']], stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, text=True, start_new_session=True)
            try:
                proc.communicate(timeout=0.3)
                self.fail('result-preserving wrapper exited before capture')
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGTERM)
                output, _ = proc.communicate(timeout=5)
            finally:
                if proc.poll() is None:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.communicate(timeout=5)
            self.assertIn('PASEO_RUN_' + d['result']['runId'] + '_BEGIN', output)
            self.assertIn('PASEO_RUN_' + d['result']['runId'] + '_EXIT=' + str(expected), output)
            self.assertIn('quoted\noutput' if expected == 0 else 'failure', output)
            if expected == 0:
                self.assertIn('ENV='+d['result']['runId'], output)

    def test_powershell_success_uses_same_save_before_close_flow(self):
        p, d = self.run_command('run-success', '--shell', 'powershell')
        self.assertEqual(p.returncode, 0, d)
        self.assertEqual(d['result']['terminalState'], 'closed')
        import base64
        options = json.loads(Path(str(self.calls) + '.terminal.options').read_text(encoding='utf-8'))
        wrapper = base64.b64decode(options['args'][-1]).decode('utf-16le')
        self.assertIn('_BEGIN', wrapper)
        self.assertIn('Start-Sleep', wrapper)


    def test_run_provenance_is_inherited_and_keep_is_durable(self):
        import base64
        for shell in ['bash', 'powershell']:
            p, d = self.run_command('run-success', '--shell', shell, '--keep-terminal')
            run_id = d['result']['runId']
            options = json.loads(Path(str(self.calls)+'.terminal.options').read_text())
            wrapper = options['args'][-1] if shell=='bash' else base64.b64decode(options['args'][-1]).decode('utf-16le')
            self.assertIn('PASEO_MULTI_SESSION', wrapper)
            self.assertIn(run_id, wrapper)
            self.assertTrue(json.loads((self.root/'runs'/(run_id+'.json')).read_text())['keepTerminal'])

    def test_cleanup_terminal_requires_complete_owned_output(self):
        p, d = self.run_command('run-pending')
        run_id = d['result']['runId']
        request = dict(action='cleanup-terminal', host=self.host, stateDir=str(self.root/'runs'), runId=run_id)
        def rpc_call(mode):
            env = dict(os.environ, PASEO_MULTI_HOST_CLIENT_MODULE=str(self.module), MULTI_HOST_TEST_MODE=mode,
                       MULTI_HOST_TEST_CALLS=str(self.calls))
            return subprocess.run([shutil.which('node'), str(SCRIPT.with_name('rpc.mjs'))], input=json.dumps(request),
                                  env=env, capture_output=True, text=True, encoding='utf-8', timeout=10)
        for mode in ['run-pending','run-truncated','run-trailing','run-duplicate-marker']:
            reply = json.loads(rpc_call(mode).stdout)
            self.assertFalse(reply['ok'], (mode, reply))
            self.assertNotIn('kill', self.calls.read_text())
        reply = json.loads(rpc_call('run-cleanup').stdout)
        self.assertTrue(reply['ok'], reply)
        self.assertEqual(reply['result']['status'], 'closed')
        log = (self.root/'runs/cleanup.jsonl').read_text()
        self.assertIn('owned completed run', log)
        self.assertNotIn('secret-key-123', log)

    def test_inventory_never_closes_and_protects_retained_runs(self):
        p, d = self.run_command('run-pending')
        request = dict(action='inventory', host=self.host, stateDir=str(self.root/'runs'))
        env = dict(os.environ, PASEO_MULTI_HOST_CLIENT_MODULE=str(self.module), MULTI_HOST_TEST_MODE='run-cleanup',
                   MULTI_HOST_TEST_CALLS=str(self.calls))
        def inventory():
            p = subprocess.run([shutil.which('node'), str(SCRIPT.with_name('rpc.mjs'))], input=json.dumps(request),
                               env=env, capture_output=True, text=True, encoding='utf-8', timeout=10)
            return json.loads(p.stdout)
        reply = inventory()
        self.assertTrue(reply['ok'], reply)
        self.assertEqual(reply['result']['terminals'][0]['tier'], 'AUTO')
        self.assertNotIn('kill', self.calls.read_text())
        record = self.root/'runs'/(d['result']['runId']+'.json')
        value=json.loads(record.read_text());value['keepTerminal']=True;record.write_text(json.dumps(value))
        reply=inventory()
        self.assertEqual(reply['result']['terminals'], [])

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
        record = json.loads(records[0].read_text(encoding='utf-8'))
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
        self.assertEqual(self.calls.read_text(encoding='utf-8'), 'exec:wks_1\n')

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
        self.assertEqual(self.calls.read_text(encoding='utf-8'), 'restart\n')

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
                self.assertEqual(self.calls.read_text(encoding='utf-8'), 'restart\n')

    def test_finished_attention_does_not_block_restart(self):
        p, d = self.invoke('finished', 'restart', 'PC')
        self.assertEqual(p.returncode, 0)
        self.assertTrue(d['result']['acknowledged']['ack'])
        self.assertEqual(self.calls.read_text(encoding='utf-8'), 'restart\n')

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
        self.assertEqual(self.calls.read_text(encoding='utf-8'), 'exec\n')
        p = subprocess.run([sys.executable, str(SCRIPT), '--config', str(self.config), 'exec', 'PC',
                            '--command', 'x', '--file', str(self.script)], capture_output=True, text=True)
        self.assertNotEqual(p.returncode, 0)

    def test_force_restart_reports_interrupted_agents(self):
        p, d = self.invoke('busy', 'restart', 'PC', '--force')
        self.assertEqual(p.returncode, 0)
        self.assertEqual([a['id'] for a in d['result']['interruptedAgents']], ['a'])
        self.assertEqual(self.calls.read_text(encoding='utf-8'), 'restart\n')
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
        labels = [h['label'] for h in json.loads(self.config.read_text(encoding='utf-8'))['hosts']]
        self.assertEqual(sorted(labels), ['PC-RENAMED', 'PC2'])

    def test_import_duplicate_alias_keeps_existing_registry(self):
        source = self.root / 'export.json'
        source.write_text(json.dumps([self.host, {**self.host, 'label': 'PC2'}]))
        before = self.config.read_bytes()
        p, d = self.invoke('idle', 'import-saved', str(source), '--replace')
        self.assertFalse(d['ok'])
        self.assertEqual(before, self.config.read_bytes())




class HealthPolicyTests(unittest.TestCase):
    def setUp(self):
        self.base=dict(host=dict(label='PC', platform='macos', serverId='expected'), stateDir='/private/runs')
        self.snapshot=dict(daemonPid=999, processCleanupSafe=True, terminals=[], endedRuns=[])
        self.process=dict(id='process:12:start',kind='process',tier='CONFIRM',reason='orphan dev server',ports=[8786])
        self.temp=dict(id='temp:ours',kind='temp',tier='AUTO',reason='managed old file',mtime=1)
        self.metrics=dict(version=1,candidates=[self.process,self.temp])

    def test_dry_run_apply_picks_and_port_filter(self):
        calls=[]
        def rpc(request):
            calls.append(request)
            return dict(self.snapshot)
        def remote(rpc, base, request, workspace):
            if request.get('apply'):
                calls.append(request)
                return [dict(id=p['id'], status='quarantined') for p in request['items']]
            return json.loads(json.dumps(self.metrics))
        with patch.object(health, 'remote', side_effect=remote):
            result=health.cleanup(rpc,self.base)
            self.assertTrue(result['dryRun'])
            self.assertEqual(result['selected'], ['temp:ours'])
            self.assertFalse(any(r.get('apply') for r in calls))
            result=health.cleanup(rpc,self.base,apply=True)
            self.assertEqual([p['id'] for p in calls[-1]['items']], ['temp:ours'])
            result=health.cleanup(rpc,self.base,apply=True,port=8786,picks=[self.process['id']])
            self.assertEqual(result['selected'], [self.process['id']])
            with self.assertRaises(ValueError): health.cleanup(rpc,self.base,apply=True,picks=['other'])
            with self.assertRaises(ValueError): health.cleanup(rpc,self.base,picks=[self.process['id']])

    def test_fresh_busy_snapshot_blocks_processes_even_explicit_picks(self):
        snapshots=iter([dict(self.snapshot),dict(self.snapshot,processCleanupSafe=False)])
        with patch.object(health,'remote',return_value=self.metrics.copy()) as remote:
            result=health.cleanup(lambda request:next(snapshots),self.base,apply=True,port=8786,picks=[self.process['id']])
            self.assertEqual(result['actions'][0]['status'],'skipped')
            self.assertEqual(remote.call_count,1)

    def test_all_keeps_unreachable_hosts_without_substituting_local(self):
        def report(rpc, base, workspace):
            if base['host']['label']=='offline': raise ValueError('unreachable')
            return dict(host=base['host']['label'])
        hosts=[dict(label='online'),dict(label='offline')]
        with patch.object(health,'report',side_effect=report):
            result=health.health_all(hosts,None,Path('/private'))
        self.assertTrue(result[0]['ok']);self.assertFalse(result[1]['ok'])
        self.assertEqual(result[1]['host'],'offline')

    def test_remote_output_is_checked_and_decoded(self):
        import base64,gzip
        def rpc(request):
            return dict(status='completed',exitCode=0,output='PASEO_HEALTH_TOKEN_BEGIN\n'+base64.b64encode(gzip.compress(b'{"version":1}')).decode()+'\nPASEO_HEALTH_TOKEN_END')
        with patch.object(health,'payload',return_value=dict(script='read only',shell='bash',token='TOKEN')):
            self.assertEqual(health.remote(rpc,self.base,{}),dict(version=1))
        with patch.object(health,'payload',return_value=dict(script='read only',shell='bash',token='TOKEN')):
            with self.assertRaises(ValueError): health.remote(lambda _:dict(status='completed',exitCode=0,output='truncated'),self.base,{})

    def row(self, **kw):
        return dict(dict(pid=100,ppid=1,uid=501,pgid=100,name='bun',session=None,ageSeconds=22000,
                         started='start',ports=[8786],parentDead=True,rssBytes=1,cause='parent absent'),**kw)

    def test_posix_tiers_age_listener_protection_and_live_tags(self):
        uid=501
        with patch.object(remote_health.os,'getuid',create=True,return_value=uid):
            self.assertEqual(remote_health.candidates([self.row()],999,[])[0]['tier'],'CONFIRM')
            for row in [self.row(ageSeconds=100),self.row(ports=[]),self.row(parentDead=False),
                        self.row(uid=0),self.row(uid=502),self.row(name='paseo'),self.row(pid=999),
                        self.row(protected=True),self.row(session='running',parentDead=False)]:
                self.assertEqual(remote_health.candidates([row],999,[]),[],row)
            self.assertEqual(remote_health.candidates([self.row(session='ours')],999,[],['ours']),[])
            self.assertEqual(remote_health.candidates([self.row(session='ours')],999,[])[0]['tier'],'AUTO')
            self.assertEqual(remote_health.candidates([self.row(session='ours',parentDead=False)],999,['ours'])[0]['tier'],'AUTO')
            rows=[self.row(pid=10,name='codex'),self.row(pid=11,ppid=10),self.row(pid=12,ppid=11)]
            self.assertEqual(remote_health.candidates(rows,999,[]),[])


    def test_successful_isolated_group_uses_term_then_kill_and_verifies(self):
        import signal
        row=self.row()
        item=dict(row,id='process:100:start',kind='process',tier='CONFIRM',reason='orphan dev server')
        with patch.object(remote_health.os,'getuid',create=True,return_value=501), patch.object(remote_health,'process_snapshot',side_effect=[([row],True),([row],True),([row],True),([],True)]), patch.object(remote_health,'temp_candidates',return_value=[]), patch.object(remote_health,'audit'), patch.object(remote_health.time,'sleep'), patch.object(remote_health.os,'killpg',create=True) as kill, patch.object(remote_health.signal,'SIGKILL',9,create=True):
            result=remote_health.apply(dict(items=[item],daemonPid=999,picks=[item['id']],ended=[]))
            self.assertEqual(result[0]['status'],'terminated')
            self.assertEqual([args.args for args in kill.call_args_list],[(100,signal.SIGTERM),(100,9)])

    @unittest.skipIf(os.name == 'nt', 'POSIX advisory lock')
    def test_locked_managed_file_is_not_moved(self):
        import fcntl,time
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);root.chmod(0o700)
            folder=root/'temp';folder.mkdir()
            file=folder/'locked';file.write_text('keep');os.utime(file,(time.time()-200000,)*2)
            with file.open('rb') as held, patch.object(remote_health,'MANAGED',root), patch.object(remote_health,'process_snapshot',return_value=([],True)):
                fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
                items=remote_health.temp_candidates()
                result=remote_health.apply(dict(items=items,daemonPid=999,picks=[],ended=[]))
                self.assertEqual(result[0]['status'],'skipped')
                self.assertTrue(file.exists())

    def test_pid_reuse_shared_group_and_protected_child_refuse_signals(self):
        row=self.row()
        item=dict(row,id='process:100:start',kind='process',tier='CONFIRM',reason='orphan dev server')
        request=dict(items=[item],daemonPid=999,picks=[item['id']],ended=[])
        for fresh in [[self.row(started='reused')],[self.row(pgid=7)],
                      [row,self.row(pid=101,ppid=100,uid=0)],
                      [row,self.row(pid=101,ppid=100,pgid=101)]]:
            with patch.object(remote_health.os,'getuid',create=True,return_value=501), patch.object(remote_health,'process_snapshot',side_effect=[([row],True),(fresh,True)]), patch.object(remote_health,'temp_candidates',return_value=[]), patch.object(remote_health,'audit'), patch.object(remote_health.os,'killpg',create=True) as kill:
                result=remote_health.apply(request)
                self.assertEqual(result[0]['status'],'skipped')
                kill.assert_not_called()

    @unittest.skipIf(os.name == 'nt', 'POSIX file locks; Windows collector tested separately')
    def test_temp_quarantine_and_retention_never_touch_unmanaged_or_links(self):
        import time
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)/'managed';root.mkdir(mode=0o700)
            temp=root/'temp';temp.mkdir()
            old=temp/'old';old.write_text('ours');os.utime(old,(time.time()-200000,)*2)
            fresh=temp/'fresh';fresh.write_text('keep')
            outside=Path(td)/'outside';outside.write_text('private')
            if os.name!='nt': (temp/'link').symlink_to(outside)
            with patch.object(remote_health,'MANAGED',root),patch.object(remote_health,'process_snapshot',return_value=([],True)):
                items=remote_health.temp_candidates()
                self.assertEqual([p['name'] for p in items],['old'])
                if os.name=='nt': return
                result=remote_health.apply(dict(items=items,daemonPid=999,picks=[],ended=[]))
                self.assertEqual(result[0]['status'],'quarantined')
                self.assertTrue(fresh.exists());self.assertEqual(outside.read_text(),'private')
                q=list((root/'quarantine').iterdir())[0]
                os.utime(q,(time.time()-700000,)*2)
                remote_health.apply(dict(items=[],daemonPid=999,picks=[],ended=[]))
                self.assertFalse(q.exists())
                self.assertIn('purged',(root/'cleanup.jsonl').read_text())


    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell/CIM integration')
    def test_windows_collector_and_quarantine_without_python(self):
        import base64,gzip,time
        with tempfile.TemporaryDirectory() as td:
            env=dict(os.environ,LOCALAPPDATA=td)
            root=Path(td)/'paseo-multi';root.mkdir()
            temp=root/'temp';temp.mkdir()
            old=temp/'ours';old.write_text('owned test fixture')
            os.utime(old,(time.time()-200000,)*2)
            fresh=temp/'fresh';fresh.write_text('preserve')
            def run(request):
                data=health.payload('windows',request)
                # Exercise the same compressed outer/encoded inner path as RPC.
                inner=base64.b64encode(("$ErrorActionPreference='Stop'\n"+data['script']).encode('utf-16le')).decode()
                wrapper='& powershell.exe -NoProfile -EncodedCommand '+inner
                packed=base64.b64encode(gzip.compress(wrapper.encode())).decode()
                loader="$s=New-Object IO.MemoryStream(,[Convert]::FromBase64String('"+packed+"'));$z=New-Object IO.Compression.GZipStream($s,[IO.Compression.CompressionMode]::Decompress);$r=New-Object IO.StreamReader($z); & ([scriptblock]::Create($r.ReadToEnd()))"
                result=subprocess.run(['powershell.exe','-NoProfile','-EncodedCommand',base64.b64encode(loader.encode('utf-16le')).decode()],env=env,capture_output=True,text=True,timeout=180)
                self.assertEqual(result.returncode,0,result.stderr)
                lines=result.stdout.strip().splitlines()
                self.assertIn('_BEGIN',lines[0],result.stdout)
                return json.loads(gzip.decompress(base64.b64decode(''.join(lines[1:-1]))))
            metrics=run(dict(daemonPid=os.getpid(),ended=[]))
            self.assertEqual(metrics['platform'],'Windows')
            self.assertGreater(metrics['ram']['totalBytes'],0)
            items=[p for p in metrics['candidates'] if p['kind']=='temp']
            self.assertEqual([p['name'] for p in items],['ours'])
            actions=run(dict(apply=True,daemonPid=os.getpid(),ended=[],items=items,picks=[]))
            if isinstance(actions,dict): actions=[actions]
            self.assertEqual(actions[0]['status'],'quarantined',actions)
            self.assertFalse(old.exists());self.assertTrue(fresh.exists())
            self.assertEqual(len(list((root/'quarantine').iterdir())),1)

    def test_payload_windows_stays_below_nested_wrapper_limit(self):
        import base64
        data=health.payload('windows',dict(daemonPid=999,ended=[]))
        inner=base64.b64encode(("$ErrorActionPreference='Stop'\n"+data['script']).encode('utf-16le')).decode()
        wrapper="$env:PASEO_MULTI_SESSION='"+str(uuid.uuid4())+"'; "+inner+'X'*300
        packed=base64.b64encode(__import__('gzip').compress(wrapper.encode())).decode()
        self.assertLess(len(inner),28000)
        self.assertLess(len(base64.b64encode((packed+'X'*400).encode('utf-16le'))),28000)


if __name__ == '__main__':
    unittest.main()
