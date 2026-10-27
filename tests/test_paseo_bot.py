"""Offline bot contracts; no daemon, inference, private registry or network."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('paseo_bot', ROOT / 'tools/paseo-bot/paseo_bot.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Fake:
    def __init__(self):
        self.launches = []
        self.recovered = []
        self.status = 'idle'
        self.bad_gate = False
        self.empty = False
        self.fail_launch = False
        self.changed_snapshot = False
        self.changed_head = False
        self.repairs = 0
        self.omit_snapshot = False
        self.fail_repair = False
        self.postflight_suffix = ''
        self.postflight_override = None
        self.work_verdict = 'pass'
        self.busy = {'MacBook': 3, 'MAC_MINI': 0, 'MAC_COM': 1, 'VAXPORT': 2}
        self.workspaces = []
        self.cleaned = []
        self.cleanup_failure = None
        self.branch_status = 'deleted'
        self.verified_work = True

    def __call__(self, host, action, **kw):
        if action == 'discover':
            return {'profiles': [{'name': n, 'provider': 'codex', 'model': 'fixture'} for n in m.PROFILES.values()], 'busy': self.busy[host['label']], 'version': '0.13.1', 'projects': []}
        if action == 'open-project':
            return {'projectId': 'project1', 'workspaceId': 'workspace1', 'cwd': kw['repo']}
        if action == 'create-workspace':
            self.workspaces.append(kw)
            return {'workspaceId': 'workspace2', 'cwd': '/worktree'}
        if action in ('snapshot-workspace', 'archive-workspace', 'finish-workspace'):
            self.cleaned.append(action)
            if self.cleanup_failure == action:
                raise ValueError('cleanup failed')
            if action == 'snapshot-workspace':
                patch = b'fixture binary patch\x00'
                if 'expectedWork' in kw:
                    assert kw['expectedWork'] == {'head': 'a' * 40, 'branch': 'paseo-bot/task-1', 'snapshot': 'b' * 64}
                return {'patch': m.base64.b64encode(patch).decode(), 'size': len(patch), 'sha256': m.hashlib.sha256(patch).hexdigest(), 'remoteFile': '.paseo-bot-evidence-12345678-1234-1234-1234-123456789abc.patch', 'verifiedWork': self.verified_work}
            if action == 'archive-workspace':
                return {'archivedAt': '2026-01-01T00:00:00Z'}
            return {'worktreeRemoved': True, 'branch': self.branch_status}
        if action == 'recover':
            return {'agents': self.recovered}
        if action == 'repair':
            self.repairs += 1
            if self.fail_repair:
                raise ValueError('acknowledgement unknown')
            return {'accepted': True}
        if action == 'launch':
            self.launches.append(kw)
            if self.fail_launch:
                raise ValueError('unknown receipt')
            i = len(self.launches)
            return {'agentId': 'agent' + str(i), 'workspaceId': kw['workspaceId'], 'cwd': '/repo' if kw['workspaceId'] == 'workspace1' else '/worktree', 'profile': kw['profile']}
        if action == 'observe':
            stage = self.launches[-1]['title'].split()[-1]
            e = {'verdict': 'pass', 'summary': 'Verified fixture', 'branch': 'main' if stage == 'preflight' else 'paseo-bot/task-1', 'head': 'a' * 40, 'cwd': '/repo' if stage == 'preflight' else '/worktree', 'gates': [{'command': 'python -m unittest', 'exitCode': 1 if self.bad_gate else 0}], 'files': ['file.py'], 'snapshot': 'b' * 64}
            if stage == 'preflight':
                e['files'] = []; e['gates'] = []
            if stage == 'work':
                e['verdict'] = self.work_verdict
            if stage == 'postflight' and self.changed_snapshot:
                e['snapshot'] = 'c' * 64
            if stage == 'work' and self.changed_head:
                e['head'] = 'd' * 40
            if stage == 'review' and self.omit_snapshot and not self.repairs:
                del e['snapshot']
            receipt = json.dumps(e)
            if stage == 'postflight':
                receipt = self.postflight_override if self.postflight_override is not None else '  ' + receipt + self.postflight_suffix
            return {'workspaceId': 'workspace1' if stage == 'preflight' else 'workspace2', 'cwd': '/repo' if stage == 'preflight' else '/worktree', 'status': self.status, 'message': '' if self.empty else 'PASEO_BOT_RESULT=' + receipt}
        raise AssertionError(action)


class BotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name) / 'state with spaces'
        self.fake = Fake()
        self.bot = m.Bot(self.home, self.fake)
        self.bot.host = lambda name: {'label': name, 'serverId': 'srv-' + name}
        self.config = {'version': 1, 'projects': [{'id': 'any-project', 'targets': [self.target(n) for n in ['MacBook', 'MAC_MINI', 'MAC_COM', 'VAXPORT']]}]}
        m.write_json(self.bot.registry_path, self.config)
        self.body = {'id': 'task-1', 'project': 'any-project', 'title': 'Scoped fix', 'prompt': 'Fix file.py', 'kind': 'hard'}

    def target(self, name):
        return {'machine': name, 'repo': '/repo' if name != 'VAXPORT' else 'C:\\repo', 'defaultBranch': 'main', 'enabled': True, 'gates': ['python -m unittest'], 'deployCommands': ['deploy-this-is-never-run'], 'skills': []}

    def tearDown(self):
        self.bot.db.close()
        self.temp.cleanup()

    def drive(self, ticks=20):
        for _ in range(ticks):
            self.bot.tick()
        return self.bot.result('task-1')

    def test_complete_independent_review_and_git_check(self):
        self.bot.submit(self.body)
        r = self.drive()
        self.assertEqual(r['state'], 'passed')
        self.assertEqual([x['profile'] for x in self.fake.launches], ['gpt-task', 'coding-hard', 'gpt-task', 'gpt-task'])
        self.assertEqual(r['machine'], 'MAC_MINI')
        self.assertEqual(self.fake.workspaces[0]['base'], 'a' * 40)
        self.assertEqual(self.fake.workspaces[0]['projectId'], 'project1')
        self.assertEqual(self.fake.launches[0]['workspaceId'], 'workspace1')
        self.assertEqual(self.fake.launches[1]['workspaceId'], r['workspaceId'])
        self.assertEqual(self.fake.launches[2]['workspaceId'], r['workspaceId'])
        self.assertEqual(r['deployment'], 'not-run')
        self.assertEqual(self.fake.cleaned, ['snapshot-workspace', 'archive-workspace', 'finish-workspace'])
        self.assertEqual(Path(r['cleanup']['patchPath']).read_bytes(), b'fixture binary patch\x00')
        self.assertEqual(r['cleanup']['status'], 'complete')
        self.assertEqual(json.loads((self.home/'results/task-1.json').read_text())['state'], 'passed')

    def test_daily_uses_two_agents_with_worker_checks_and_verified_capture(self):
        self.bot.submit(dict(self.body, workflow='daily'))
        result = self.drive()
        self.assertEqual(result['state'], 'passed')
        self.assertEqual([call['title'].split()[-1] for call in self.fake.launches], ['preflight', 'work'])
        self.assertEqual([(call['modelAlias'], call['effort']) for call in self.fake.launches], [('sol', 'medium')] * 2)
        self.assertEqual(result['verification'], 'self-checked')
        self.assertEqual(set(result['evidence']), {'preflight', 'work'})
        self.assertEqual(result['cleanup']['status'], 'complete')

    def test_daily_bad_worker_gate_cannot_pass(self):
        self.fake.bad_gate = True
        self.bot.submit(dict(self.body, workflow='daily'))
        self.assertEqual(self.drive()['state'], 'blocked')

    def test_daily_missing_capture_verification_preserves_workspace(self):
        self.fake.verified_work = False
        self.bot.submit(dict(self.body, workflow='daily'))
        result = self.drive()
        self.assertEqual(result['state'], 'blocked')
        self.assertEqual(self.fake.cleaned, ['snapshot-workspace'])

    def test_daily_honors_explicit_model_and_effort(self):
        self.bot.submit(dict(self.body, workflow='daily', model='go', effort='low'))
        self.drive()
        self.assertEqual([(call['modelAlias'], call['effort']) for call in self.fake.launches], [('go', 'low')] * 2)

    def test_daily_invalid_receipt_does_not_spend_a_repair_turn(self):
        self.fake.empty = True
        self.bot.submit(dict(self.body, workflow='daily'))
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(self.fake.repairs, 0)
        self.assertEqual(len(self.fake.launches), 1)

    def test_daily_quota_failure_does_not_rotate_models(self):
        original = self.fake
        def limited(host, action, **kw):
            result = original(host, action, **kw)
            if action == 'observe':
                result.update(status='error', errorKind='quota')
            return result
        self.bot.rpc = limited
        self.bot.submit(dict(self.body, workflow='daily'))
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(len(self.fake.launches), 1)

    def test_failed_and_blocked_work_preserves_evidence_before_cleanup(self):
        self.fake.bad_gate = True
        self.fake.branch_status = 'retained-open-pr'
        self.bot.submit(self.body)
        result = self.drive()
        self.assertEqual(result['state'], 'blocked')
        self.assertEqual(self.fake.cleaned, ['snapshot-workspace', 'archive-workspace', 'finish-workspace'])
        self.assertEqual(result['cleanup']['branch'], 'retained-open-pr')
        self.assertEqual(Path(result['cleanup']['patchPath']).read_bytes(), b'fixture binary patch\x00')

    def test_snapshot_failure_never_archives(self):
        self.fake.cleanup_failure = 'snapshot-workspace'
        self.bot.submit(self.body)
        result = self.drive()
        self.assertEqual(result['state'], 'passed')
        self.assertEqual(result['cleanup']['status'], 'failed')
        self.assertEqual(self.fake.cleaned, ['snapshot-workspace'])

    def test_failed_work_also_archives_after_snapshot(self):
        self.fake.work_verdict = 'fail'
        self.bot.submit(self.body)
        result = self.drive()
        self.assertEqual(result['state'], 'failed')
        self.assertEqual(result['cleanup']['status'], 'complete')
        self.assertEqual(self.fake.cleaned, ['snapshot-workspace', 'archive-workspace', 'finish-workspace'])

    def test_quota_retry_reuses_worktree_and_is_bounded(self):
        self.bot.submit(dict(self.body, kind='gpt'))
        for _ in range(4): self.bot.tick()
        original = self.bot.result('task-1')
        self.assertEqual(original['stage'], 'work')
        self.assertEqual(original['state'], 'running')
        observe = self.fake.__call__
        def quota(host, action, **kw):
            if action == 'observe':
                return dict(status='error', errorKind='quota', workspaceId=original['workspaceId'], cwd=original['worktree'])
            return observe(host, action, **kw)
        self.bot.rpc = quota
        self.bot.tick()
        self.assertEqual(self.bot.result('task-1')['state'], 'ready')
        self.bot.tick()
        self.assertEqual(self.fake.launches[-2]['modelAlias'], 'sol')
        self.assertEqual(self.fake.launches[-1]['modelAlias'], 'claude')
        self.assertEqual(self.fake.launches[-1]['workspaceId'], original['workspaceId'])
        self.bot.tick(); self.bot.tick()
        self.assertEqual(self.fake.launches[-1]['modelAlias'], 'go')
        self.bot.tick()
        for _ in range(3): self.bot.tick()
        self.assertEqual(self.bot.result('task-1')['state'], 'blocked')
        self.assertEqual(len(self.fake.launches), 4)

    def test_invalid_model_selection_and_policy(self):
        for model in ('commandcode', '../x'):
            with self.assertRaises(ValueError): self.bot.submit(dict(self.body, model=model))
        self.assertEqual(m.route_model(dict(kind='gpt'), 'work'), 'sol')
        self.assertEqual(m.route_model(dict(kind='refactor'), 'work'), 'sol')
        self.assertEqual(m.route_model(dict(kind='hard'), 'work'), 'claude')
        self.assertEqual(m.route_model(dict(kind='hard'), 'review'), 'sol')
        self.assertEqual(m.route_model(dict(kind='sync'), 'work'), 'go')
        self.assertEqual(m.route_model(dict(kind='hard', model='terra'), 'work'), 'sol')
        self.assertEqual([m.MODELS[k][1:] for k in ('sol', 'claude', 'go')],
                         [('codex', 'gpt-6.1-sol'), ('claude', 'claude-opus-5-5'), ('opencode', 'opencode-go/deepseek-v4.1-flash')])
        self.assertNotIn('terra', m.MODELS)
        self.assertEqual(m.fallback_model('sol', 'quota'), 'claude')
        self.assertEqual(m.fallback_model('terra', 'quota'), 'claude')
        self.assertEqual(m.fallback_model('claude', 'quota'), 'go')
        self.assertEqual(m.fallback_model('go', 'quota'), 'sol')
        self.assertEqual(m.fallback_model('sol', 'model-unavailable'), 'claude')
        self.assertIsNone(m.fallback_model('sol', 'other'))
        self.assertEqual(m.model_alias(['terra']), ['terra'])

    def test_legacy_terra_task_dispatches_on_sol(self):
        self.bot.submit(dict(self.body, model='terra'))
        for _ in range(4): self.bot.tick()
        self.assertEqual(self.bot.result('task-1')['stage'], 'work')
        self.assertEqual({launch['modelAlias'] for launch in self.fake.launches}, {'sol'})

    def test_preparation_cannot_accept_an_implementation_receipt(self):
        record = dict(target=self.target('MAC_MINI'), branch='paseo-bot/task-1')
        evidence = dict(verdict='pass', head='a'*40, cwd='/repo', branch='main', files=['file.py'], gates=[])
        with self.assertRaises(ValueError): self.bot.validate_evidence(evidence, record, 'preflight')
        evidence.update(files=[], gates=[dict(command='python -m unittest',exitCode=0)])
        with self.assertRaises(ValueError): self.bot.validate_evidence(evidence, record, 'preflight')
        evidence.update(gates=[],cwd='/wrong-source')
        with self.assertRaises(ValueError): self.bot.validate_evidence(evidence, record, 'preflight')
        evidence.update(cwd='/repo')
        self.assertTrue(self.bot.validate_evidence(evidence,record,'preflight'))

    def test_preparation_never_receives_task_or_previous_implementation_requests(self):
        record = dict(id='task-1',target=self.target('MAC_MINI'),branch='paseo-bot/task-1',evidence={})
        prompt = self.bot.prompt(self.body,record,'preflight')
        self.assertNotIn(self.body['prompt'],prompt)
        self.assertNotIn(self.body['title'],prompt)
        self.assertNotIn('projectHistory',prompt)
        self.assertIn('preserve them',prompt)
        self.assertIn(self.body['prompt'],self.bot.prompt(self.body,record,'work'))

    def test_completion_webhooks_capture_each_terminal_state_once(self):
        for state in ['passed', 'failed', 'blocked']:
            body = dict(self.body, id='notify-' + state, requester='operator', pr_url='https://github.com/a/b/pull/1')
            record = self.bot.submit(body)
            record.update(state=state, machine='VAXPORT', summary='bounded result')
            self.bot.save(record)
            self.bot.save(record)
        rows = self.bot.db.execute('SELECT payload FROM webhook_jobs').fetchall()
        self.assertEqual(len(rows), 3)
        payloads = [json.loads(row[0]) for row in rows]
        self.assertEqual({p['state'] for p in payloads}, {'passed', 'failed', 'blocked'})
        self.assertTrue(all(p['requester'] == 'operator' and p['pr_url'].endswith('/1') for p in payloads))
        unknown = self.bot.submit(dict(self.body, id='unknown-task'))
        unknown.update(state='unknown')
        self.bot.save(unknown)
        self.assertEqual(self.bot.db.execute('SELECT count(*) FROM webhook_jobs').fetchone()[0], 3)

    def test_webhook_failure_does_not_change_task_outbox_or_health(self):
        self.bot.submit(self.body)
        with patch.object(m.webhook_queue, 'drain', side_effect=RuntimeError('notification failure')):
            result = self.drive()
        self.assertEqual(result['state'], 'passed')
        self.assertEqual(json.loads((self.home/'results/task-1.json').read_text())['state'], 'passed')
        self.assertTrue(self.bot.health()['healthy'])
        self.assertEqual(self.bot.db.execute('SELECT count(*) FROM webhook_jobs').fetchone()[0], 1)

    def test_standby_is_healthy_but_cannot_admit_or_dispatch(self):
        self.bot.submit(self.body)
        self.bot.set_owner('standby', 'VAX_COM')
        with self.assertRaises(ValueError):
            self.bot.submit(dict(self.body, id='task-2'))
        self.bot.tick()
        self.assertTrue(self.bot.health()['healthy'])
        self.assertFalse(self.bot.health()['ownership']['dispatchEnabled'])
        self.assertEqual(len(self.fake.launches), 0)
        self.assertEqual(self.bot.status('task-1')['state'], 'queued')

    def test_copied_owner_fence_requires_explicit_standby_rebind(self):
        self.bot.set_owner('active', 'MAC_HOME')
        with patch.object(m.socket, 'gethostname', return_value='another-machine'):
            self.assertFalse(self.bot.ownership()['dispatchEnabled'])
            with self.assertRaises(ValueError):
                self.bot.set_owner('active', 'VAX_COM')
            with self.assertRaises(ValueError):
                self.bot.set_owner('active', 'VAX_COM', rebind=True)
            self.bot.set_owner('standby', 'VAX_COM', rebind=True)
            self.bot.set_owner('active', 'VAX_COM')
            self.assertTrue(self.bot.ownership()['acceptsTasks'])

    def test_retired_queue_does_not_reactivate_accidentally(self):
        self.bot.set_owner('retired', 'MAC_HOME')
        with self.assertRaises(ValueError):
            self.bot.set_owner('active')
        self.bot.tick()
        self.assertFalse(self.bot.ownership()['dispatchEnabled'])

    def test_sqlite_handoff_preserves_queued_task_with_one_owner(self):
        self.bot.set_owner('active', 'MAC_HOME')
        self.bot.submit(self.body)
        self.bot.set_owner('retired', 'MAC_HOME')
        destination = self.home.parent / 'destination'
        destination.mkdir(mode=0o700)
        db = m.sqlite3.connect(destination/'queue.sqlite3')
        self.bot.db.backup(db)
        db.close()
        (destination/'queue.sqlite3').chmod(0o600)
        for name in ['projects.json', 'owner.json']:
            shutil.copy2(self.home/name, destination/name)
        target = m.Bot(destination, self.fake)
        target.host = self.bot.host
        try:
            with patch.object(m.socket, 'gethostname', return_value='vaxport'):
                self.assertFalse(target.ownership()['dispatchEnabled'])
                target.set_owner('standby', 'VAX_COM', rebind=True)
                target.tick()
                self.assertEqual(len(self.fake.launches), 0)
                target.set_owner('active', 'VAX_COM')
                for _ in range(20):
                    target.tick()
                self.assertEqual(target.result('task-1')['state'], 'passed')
            self.bot.tick()
            self.assertEqual(self.bot.result('task-1')['state'], 'queued')
            self.assertFalse(self.bot.ownership()['acceptsTasks'])
        finally:
            target.db.close()

    def test_windows_remote_paths_compare_without_local_resolution(self):
        self.assertTrue(m.same_remote_path('C:\\Users\\maste\\repo', 'c:/users/maste/repo/'))
        self.assertFalse(m.same_remote_path('/Users/A/repo', '/users/a/repo'))
        self.assertFalse(m.same_remote_path('C:\\repo', 'D:\\repo'))

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell fingerprint interoperability')
    def test_powershell_snapshot_matches_python_for_binary_untracked_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            repo = root/'repo'
            repo.mkdir()
            def git(*args):
                subprocess.run(['git',*args],cwd=repo,check=True,capture_output=True)
            git('init','-b','main')
            git('config','user.name','Fixture')
            git('config','user.email','fixture@example.invalid')
            git('config','core.autocrlf','false')
            (repo/'file.txt').write_bytes(b'before\n')
            git('add','.')
            git('commit','-m','fixture')
            (repo/'file.txt').write_bytes(b'after\r\n')
            (repo/'한글.bin').write_bytes(b'\x00\xffbinary')
            (repo/'a.bin').write_bytes(b'first')
            script = root/'snapshot.ps1'
            script.write_text(m.SNAPSHOT_POWERSHELL,encoding='utf-8-sig')
            expected = subprocess.run([sys.executable,'-c',m.SNAPSHOT_SCRIPT],cwd=repo,capture_output=True,encoding='utf-8')
            actual = subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(script)],cwd=repo,capture_output=True,encoding='utf-8',errors='replace')
            self.assertEqual(actual.returncode,0,actual.stderr)
            self.assertEqual(actual.stdout.strip(),expected.stdout.strip())

    def test_bom_json_file_and_json_status_cli(self):
        task = self.home/'task.json'
        body = dict(self.body, title='작업 Unicode')
        task.write_text(json.dumps(body, ensure_ascii=False), encoding='utf-8-sig')
        command = [sys.executable, str(ROOT/'tools/paseo-bot/paseo_bot.py'), '--state', str(self.home)]
        r = subprocess.run(command+['submit','--file',str(task)], capture_output=True, encoding='utf-8')
        self.assertEqual(r.returncode, 0, r.stdout)
        r = subprocess.run(command+['status','task-1'], capture_output=True, encoding='utf-8')
        self.assertEqual(json.loads(r.stdout)['state'], 'queued')
        r = subprocess.run(command+['result','task-1'], capture_output=True, encoding='utf-8')
        self.assertEqual(json.loads(r.stdout)['id'], 'task-1')

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell integration')
    def test_powershell_file_and_pipeline_unicode_intake(self):
        wrapper = ROOT/'tools/paseo-bot/paseo-bot.ps1'
        task = self.home/'task.json'
        task.write_text(json.dumps(self.body), encoding='utf-8-sig')
        base = ['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File']
        r = subprocess.run(base+[str(wrapper),'submit','-File',str(task),'-State',str(self.home),'-Python',sys.executable],capture_output=True,encoding='utf-8')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(json.loads(r.stdout)['id'], 'task-1')
        driver = self.home/'pipeline.ps1'
        def quote(s):
            return "'"+str(s).replace("'", "''")+"'"
        task2 = dict(self.body, id='unicode-pipeline', title='한글 작업', prompt='경로와 인코딩 검증')
        text = json.dumps(task2, ensure_ascii=False)
        driver.write_text("$json="+quote(text)+"\n$json | & "+quote(wrapper)+" submit -State "+quote(self.home)+" -Python "+quote(sys.executable)+"\nexit $LASTEXITCODE\n", encoding='utf-8-sig')
        r = subprocess.run(base+[str(driver)],capture_output=True,encoding='utf-8')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(json.loads(r.stdout)['id'], 'unicode-pipeline')
        saved = json.loads(self.bot.db.execute('SELECT body FROM tasks WHERE id=?',('unicode-pipeline',)).fetchone()[0])
        self.assertEqual(saved['title'], '한글 작업')
        r = subprocess.run(base+[str(wrapper),'status','-State',str(self.home)],capture_output=True,encoding='utf-8')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('queue', json.loads(r.stdout))
        stdin_task = dict(self.body, id='unicode-native-stdin', title='표준입력 한글')
        r = subprocess.run(base+[str(wrapper),'submit','-State',str(self.home)],input=json.dumps(stdin_task,ensure_ascii=False),capture_output=True,encoding='utf-8')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        saved = json.loads(self.bot.db.execute('SELECT body FROM tasks WHERE id=?',('unicode-native-stdin',)).fetchone()[0])
        self.assertEqual(saved['title'], '표준입력 한글')

    def test_idempotent_submission_and_conflict(self):
        self.bot.submit(self.body)
        self.bot.submit(self.body)
        with self.assertRaises(ValueError):
            self.bot.submit(dict(self.body, prompt='Different request'))
        self.assertEqual(self.bot.db.execute('SELECT count(*) FROM tasks').fetchone()[0], 1)

    def test_routes_each_machine_explicitly(self):
        for machine in self.fake.busy:
            t, h, _ = self.bot.route(dict(self.body, machine=machine))
            self.assertEqual(t['machine'], machine)
            self.assertEqual(h['label'], machine)
        with self.assertRaises(ValueError):
            self.bot.route(dict(self.body, machine='nonexistent'))

    def test_no_profile_or_disabled_target_blocks(self):
        self.config['projects'][0]['targets'][1]['enabled'] = False
        m.write_json(self.bot.registry_path, self.config)
        t, _, _ = self.bot.route(self.body)
        self.assertEqual(t['machine'], 'MAC_COM')
        for t in self.config['projects'][0]['targets']:
            t['enabled'] = False
        m.write_json(self.bot.registry_path, self.config)
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(len(self.fake.launches), 0)

    def test_lost_dispatch_never_replayed(self):
        self.fake.fail_launch = True
        self.bot.submit(self.body)
        r = self.drive()
        self.assertEqual(r['state'], 'unknown')
        self.assertEqual(len(self.fake.launches), 1)

    def test_known_prelaunch_failure_is_blocked_without_recovery(self):
        original = self.bot.rpc
        def rpc(host, action, **kwargs):
            if action == 'launch':
                raise m.BridgeFailure('profile', 'provider-unavailable')
            if action == 'recover':
                self.fail('A known pre-launch failure must not need recovery')
            return original(host, action, **kwargs)
        self.bot.rpc = rpc
        self.bot.submit(self.body)
        result = self.drive()
        self.assertEqual(result['state'], 'blocked')
        self.assertEqual(result['launchDiagnostic']['reason'], 'provider-unavailable')
        self.assertEqual(len(self.fake.launches), 0)

    def test_lost_ack_adopts_unique_label(self):
        self.fake.fail_launch = True
        self.bot.submit(self.body)
        self.bot.tick()
        self.bot.tick()
        self.fake.recovered = [{'agentId': 'agent1', 'workspaceId': 'workspace1', 'cwd': '/repo'}]
        self.fake.fail_launch = False
        self.bot.tick()
        self.assertEqual(self.bot.result('task-1')['state'], 'running')
        self.assertEqual(len(self.fake.launches), 1)

    def test_restart_resumes_agent_not_redispatch(self):
        self.bot.submit(self.body)
        self.bot.tick()
        self.bot.tick()
        self.bot.db.close()
        self.bot = m.Bot(self.home, self.fake)
        self.bot.host = lambda name: {'label': name, 'serverId': 'srv-' + name}
        r = self.drive()
        self.assertEqual(r['state'], 'passed')
        self.assertEqual(len(self.fake.launches), 4)

    def test_idle_without_evidence_is_blocked(self):
        self.fake.empty = True
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(len(self.fake.launches), 1)
        self.assertEqual(self.fake.repairs, 1)

    def test_independent_gate_failure_blocks(self):
        self.fake.bad_gate = True
        self.bot.submit(self.body)
        r = self.drive()
        self.assertEqual(r['state'], 'blocked')
        self.assertEqual(len(self.fake.launches), 3)
        self.assertEqual(self.fake.repairs, 0)

    def test_one_format_correction_reuses_agent(self):
        self.fake.omit_snapshot = True
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'passed')
        self.assertEqual(self.fake.repairs, 1)
        self.assertEqual(len(self.fake.launches), 4)

    def test_lost_format_correction_ack_is_not_replayed(self):
        self.fake.empty = True
        self.fake.fail_repair = True
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'unknown')
        self.assertEqual(self.fake.repairs, 1)
        self.assertEqual(len(self.fake.launches), 1)

    def test_changed_content_after_review_blocks(self):
        self.fake.changed_snapshot = True
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(len(self.fake.launches), 4)

    def test_postflight_accepts_first_complete_object_with_trailing_characters(self):
        self.fake.postflight_suffix = ' \t** stray } {"verdict":"fail"}'
        self.bot.submit(self.body)
        r = self.drive()
        self.assertEqual(r['state'], 'passed')
        self.assertEqual(r['evidence']['postflight']['verdict'], 'pass')
        self.assertEqual(self.fake.repairs, 0)
        self.assertEqual(len(self.fake.launches), 4)

    def test_trailing_characters_do_not_bypass_snapshot_validation(self):
        self.fake.postflight_suffix = '**'
        self.fake.changed_snapshot = True
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(self.fake.repairs, 0)

    def test_incomplete_postflight_object_still_blocks_after_one_correction(self):
        self.fake.postflight_override = '{"verdict":"pass"'
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(self.fake.repairs, 1)
        self.assertEqual(len(self.fake.launches), 4)

    def test_multiple_receipt_markers_still_block(self):
        self.fake.postflight_suffix = '\nPASEO_BOT_RESULT={"verdict":"pass"}'
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(self.fake.repairs, 1)

    def test_non_object_postflight_value_still_blocks(self):
        self.fake.postflight_override = '[] trailing'
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(self.fake.repairs, 1)

    def test_review_head_mismatch_blocks(self):
        self.fake.changed_head = True
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(len(self.fake.launches), 3)

    def test_prompt_allows_full_flow_with_three_hard_limits(self):
        text = self.bot.prompt(self.body, {'target': {'repo': '/r', 'defaultBranch': 'main', 'gates': []}, 'branch': 'b', 'evidence': {}}, 'work')
        for phrase in ['commit, push, open a PR, wait for CI, merge, deploy', 'never print secrets', 'never post to Slack', 'protected runtimes']:
            self.assertIn(phrase, text)
        self.assertNotIn('Do not deploy, merge, push, commit', text)
        self.assertNotIn('ERP', text)

    def test_close_and_auto_close_reported_attention_tasks(self):
        self.bot.submit(self.body)
        r = self.bot.result(self.body['id'])
        self.bot.save(dict(r, state='unknown', reason='x'))
        with self.assertRaises(ValueError):
            self.bot.close('missing-task')
        self.assertEqual(self.bot.auto_close(now=time.time()), [])
        closed = self.bot.auto_close(now=time.time() + 90000)
        self.assertEqual(closed, [self.body['id']])
        r = self.bot.result(self.body['id'])
        self.assertEqual((r['state'], r['closedFrom']), ('closed', 'unknown'))
        raw = (self.home / 'results' / (self.body['id'] + '.json')).read_bytes()
        self.assertTrue(all(b < 128 for b in raw))

    def test_classification_prefers_explicit_kind(self):
        for text, expected in [('bulk refactor files', 'refactor'), ('architecture design', 'gpt'), ('complex architecture', 'hard'), ('git-sync state', 'sync'), ('fix typo', 'gpt')]:
            self.assertEqual(m.classify({'title': text}), expected)
        self.assertEqual(m.classify({'title': 'architecture', 'kind': 'refactor'}), 'refactor')

    def test_memory_is_limited_to_same_project(self):
        self.bot.submit(self.body)
        self.drive()
        other = dict(self.bot.result('task-1'), id='other', project='private-other-project', summary='DO_NOT_CROSS_PROJECTS')
        self.bot.db.execute('INSERT INTO tasks VALUES (?,?,?,?,?)', ('other', 'hash', '{}', 'passed', json.dumps(other)))
        self.bot.db.commit()
        record = self.bot.result('task-1')
        prompt = self.bot.prompt(dict(self.body, id='next-task'), record, 'review')
        self.assertIn('Verified fixture', prompt)
        self.assertNotIn('DO_NOT_CROSS_PROJECTS', prompt)

    def test_two_queued_tasks_never_share_a_machine(self):
        self.config['projects'][0]['targets'] = [self.target('MAC_MINI')]
        m.write_json(self.bot.registry_path, self.config)
        self.bot.submit(self.body)
        self.bot.submit(dict(self.body, id='task-2'))
        self.fake.status = 'timeout'
        for _ in range(5):
            self.bot.tick()
        self.assertEqual(self.bot.result('task-1')['state'], 'running')
        self.assertEqual(self.bot.result('task-2')['state'], 'queued')
        self.assertEqual(len(self.fake.launches), 1)

    def test_different_machines_progress_in_parallel(self):
        self.bot.submit(self.body)
        self.bot.submit(dict(self.body, id='task-2'))
        self.fake.status = 'timeout'
        for _ in range(3):
            self.bot.tick()
        first, second = self.bot.result('task-1'), self.bot.result('task-2')
        self.assertEqual((first['state'], second['state']), ('running', 'running'))
        self.assertNotEqual(first['machine'], second['machine'])
        self.assertEqual(json.loads((self.home/'health.json').read_text())['activeTasks'], ['task-1', 'task-2'])

    def test_transient_observation_failure_keeps_running_until_grace(self):
        self.config['transientGraceSeconds'] = 60
        m.write_json(self.bot.registry_path, self.config)
        self.bot.submit(self.body)
        for _ in range(4): self.bot.tick()
        self.assertEqual(self.bot.result('task-1')['state'], 'running')
        self.fake.status = 'timeout'  # The work agent is still busy.
        observe = self.fake.__call__
        def offline(host, action, **kw):
            if action == 'observe':
                raise m.TransientBridgeError('lost')
            return observe(host, action, **kw)
        self.bot.rpc = offline
        for _ in range(3): self.bot.tick()
        r = self.bot.result('task-1')
        self.assertEqual(r['state'], 'running')
        self.assertEqual(r['transientFailures'], 3)
        self.bot.rpc = observe  # Connection returns: the same agent continues and the marker clears.
        self.bot.tick()
        self.assertNotIn('transientSince', self.bot.result('task-1'))
        self.bot.rpc = offline
        self.bot.tick()
        with patch.object(m.time, 'time', return_value=m.time.time() + 120):
            self.bot.tick()
        r = self.bot.result('task-1')
        self.assertEqual(r['cleanup']['resultState'], 'blocked')  # Evidence capture precedes the verdict.
        self.assertIn('retry window', r['reason'])
        self.assertEqual(len(self.fake.launches), 2)

    def test_permanent_bridge_failure_still_blocks(self):
        self.bot.submit(self.body)
        for _ in range(4): self.bot.tick()
        observe = self.fake.__call__
        def foreign(host, action, **kw):
            if action == 'observe':
                raise m.BridgeFailure('identity', 'ownership')
            return observe(host, action, **kw)
        self.bot.rpc = foreign
        self.bot.tick()
        r = self.bot.result('task-1')
        self.assertEqual(r['cleanup']['resultState'], 'blocked')
        self.assertNotIn('transientSince', r)

    def test_draft_pr_publish_runs_before_archive_and_reaches_webhook(self):
        for t in self.config['projects'][0]['targets']:
            t['publish'] = 'draft-pr'
        m.write_json(self.bot.registry_path, self.config)
        calls = []
        original = self.fake.__call__
        def rpc(host, action, **kw):
            if action == 'publish-workspace':
                calls.append(kw)
                return {'prUrl': 'https://github.com/o/r/pull/7', 'commit': 'e' * 40, 'stateSha': 'f' * 64}
            if action == 'archive-workspace':
                calls.append(kw)
            return original(host, action, **kw)
        self.bot.rpc = rpc
        self.bot.submit(self.body)
        r = self.drive()
        self.assertEqual(r['state'], 'passed')
        self.assertEqual(r['prUrl'], 'https://github.com/o/r/pull/7')
        self.assertEqual(calls[0]['defaultBranch'], 'main')
        self.assertEqual(calls[0]['branch'], 'paseo-bot/task-1')
        self.assertIn('task-1', calls[0]['body'])
        self.assertEqual(calls[1]['stateSha'], 'f' * 64)
        payload = json.loads(self.bot.db.execute('SELECT payload FROM webhook_jobs').fetchone()[0])
        self.assertEqual(payload['pr_url'], 'https://github.com/o/r/pull/7')

    def test_failed_work_is_never_published(self):
        for t in self.config['projects'][0]['targets']:
            t['publish'] = 'draft-pr'
        m.write_json(self.bot.registry_path, self.config)
        self.fake.work_verdict = 'fail'
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'failed')
        self.assertEqual(self.fake.cleaned, ['snapshot-workspace', 'archive-workspace', 'finish-workspace'])

    def test_invalid_publish_receipt_preserves_workspace(self):
        for t in self.config['projects'][0]['targets']:
            t['publish'] = 'draft-pr'
        m.write_json(self.bot.registry_path, self.config)
        original = self.fake.__call__
        self.bot.rpc = lambda host, action, **kw: {'prUrl': 'https://evil.example/pull/1', 'commit': 'e' * 40, 'stateSha': 'f' * 64} if action == 'publish-workspace' else original(host, action, **kw)
        self.bot.submit(self.body)
        r = self.drive()
        self.assertEqual((r['state'], r['cleanup']['status']), ('passed', 'failed'))
        self.assertNotIn('archive-workspace', self.fake.cleaned)
        with self.assertRaises(ValueError):
            m.validate_config(dict(self.config, projects=[dict(self.config['projects'][0], targets=[dict(self.target('X'), publish='push')])]))

    def test_webhook_failure_is_visible_in_health(self):
        self.bot.submit(self.body)
        with patch.object(m.webhook_queue, 'drain', side_effect=RuntimeError('boom')):
            self.bot.tick()
        self.assertEqual(json.loads((self.home/'health.json').read_text())['webhook'], 'error')

    def test_permission_wait_never_approved(self):
        self.fake.status = 'permission'
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(len(self.fake.launches), 1)

    def test_server_identity_change_blocks(self):
        self.bot.submit(self.body)
        self.bot.tick()
        self.bot.host = lambda name: {'label': name, 'serverId': 'changed'}
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(len(self.fake.launches), 0)

    @unittest.skipIf(m.os.name == 'nt', 'POSIX flock refuses overlapping locks')
    def test_exclusive_consumer_lock(self):
        with m.lock(self.home):
            with self.assertRaises(OSError):
                with m.lock(self.home):
                    self.fail('second lock acquired')

    def test_registry_requires_branch_and_gates(self):
        for key, value in [('defaultBranch', ''), ('defaultBranch', '--bad'), ('gates', [])]:
            c = json.loads(json.dumps(self.config))
            c['projects'][0]['targets'][0][key] = value
            with self.assertRaises(ValueError):
                m.validate_config(c)

    def test_inbox_rejects_command_and_path_overrides(self):
        for extra in [{'repo': '/outside'}, {'gates': ['rm -rf /']}, {'id': '../escape'}, {'kind': 'guess-model'}]:
            with self.assertRaises(ValueError):
                self.bot.submit(dict(self.body, **extra))

    def test_secrets_not_persisted_in_inbox_or_outbox(self):
        secret = 'ghp_' + 'A' * 30
        self.bot.submit(dict(self.body, prompt='token=' + secret))
        stored = self.bot.db.execute('SELECT body FROM tasks').fetchone()[0]
        self.assertNotIn(secret, stored)
        self.assertNotIn(secret, json.dumps(m.scrub({'secret': secret, 'text': secret})))

    def test_outbox_recovers_after_publication_loss(self):
        self.bot.submit(self.body)
        self.drive()
        f = self.home/'results/task-1.json'
        f.unlink()
        self.bot.tick()
        self.assertTrue(f.exists())
        self.assertEqual(len(self.fake.launches), 4)

    def test_discovery_keeps_existing_policy(self):
        with patch.object(m.fleet, 'load_hosts', return_value=[{'label': 'MAC_MINI'}]):
            self.bot.discover()
        self.assertEqual(self.bot.config()['projects'], self.config['projects'])

    @unittest.skipIf(m.os.name == 'nt', 'POSIX file permission check')
    def test_symlink_and_public_state_refused(self):
        f = self.home/'alias.json'
        f.symlink_to(self.bot.registry_path)
        with self.assertRaises(ValueError):
            m.write_json(f, {})
        self.bot.registry_path.chmod(0o644)
        with self.assertRaises(ValueError):
            self.bot.config()


if __name__ == '__main__':
    unittest.main()
