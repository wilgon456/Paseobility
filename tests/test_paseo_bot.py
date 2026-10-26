"""Offline bot contracts; no daemon, inference, private registry or network."""
import importlib.util
import json
from pathlib import Path
import tempfile
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
        self.busy = {'MacBook': 3, 'MAC_MINI': 0, 'MAC_COM': 1, 'VAXPORT': 2}

    def __call__(self, host, action, **kw):
        if action == 'discover':
            return {'profiles': [{'name': n, 'provider': 'codex', 'model': 'fixture'} for n in m.PROFILES.values()], 'busy': self.busy[host['label']], 'version': '0.13.1', 'projects': []}
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
            return {'agentId': 'agent' + str(i), 'workspaceId': kw.get('workspaceId', 'workspace' + str(i)), 'cwd': '/repo' if i == 1 else '/worktree', 'profile': kw['profile']}
        if action == 'observe':
            stage = self.launches[-1]['title'].split()[-1]
            e = {'verdict': 'pass', 'summary': 'Verified fixture', 'branch': 'main' if stage == 'preflight' else 'paseo-bot/task-1', 'head': 'a' * 40, 'cwd': '/repo' if stage == 'preflight' else '/worktree', 'gates': [{'command': 'python -m unittest', 'exitCode': 1 if self.bad_gate else 0}], 'files': ['file.py'], 'snapshot': 'b' * 64}
            if stage == 'postflight' and self.changed_snapshot:
                e['snapshot'] = 'c' * 64
            if stage == 'work' and self.changed_head:
                e['head'] = 'd' * 40
            if stage == 'review' and self.omit_snapshot and not self.repairs:
                del e['snapshot']
            return {'workspaceId': 'workspace1' if stage == 'preflight' else 'workspace2', 'cwd': '/repo' if stage == 'preflight' else '/worktree', 'status': self.status, 'message': '' if self.empty else 'PASEO_BOT_RESULT=' + json.dumps(e)}
        raise AssertionError(action)


class BotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name) / 'state'
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
        self.assertEqual([x['profile'] for x in self.fake.launches], ['git-sync', 'coding-hard', 'gpt-task', 'git-sync'])
        self.assertEqual(r['machine'], 'MAC_MINI')
        self.assertEqual(self.fake.launches[1]['base'], 'a' * 40)
        self.assertNotIn('workspaceId', self.fake.launches[1])
        self.assertEqual(self.fake.launches[2]['workspaceId'], r['workspaceId'])
        self.assertEqual(r['deployment'], 'not-run')
        self.assertEqual(json.loads((self.home/'results/task-1.json').read_text())['state'], 'passed')

    def test_idempotent_submission_and_conflict(self):
        self.bot.submit(self.body)
        self.bot.submit(self.body)
        with self.assertRaises(ValueError):
            self.bot.submit(dict(self.body, prompt='Different request'))
        self.assertEqual(self.bot.db.execute('SELECT count(*) FROM tasks').fetchone()[0], 1)

    def test_routes_each_machine_explicitly(self):
        for machine in self.fake.busy:
            t, h = self.bot.route(dict(self.body, machine=machine))
            self.assertEqual(t['machine'], machine)
            self.assertEqual(h['label'], machine)
        with self.assertRaises(ValueError):
            self.bot.route(dict(self.body, machine='nonexistent'))

    def test_no_profile_or_disabled_target_blocks(self):
        self.config['projects'][0]['targets'][1]['enabled'] = False
        m.write_json(self.bot.registry_path, self.config)
        t, _ = self.bot.route(self.body)
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

    def test_unauthorized_commit_blocks(self):
        self.fake.changed_head = True
        self.bot.submit(self.body)
        self.assertEqual(self.drive()['state'], 'blocked')
        self.assertEqual(len(self.fake.launches), 2)

    def test_classification_prefers_explicit_kind(self):
        for text, expected in [('bulk refactor files', 'refactor'), ('architecture design', 'hard'), ('git-sync state', 'sync'), ('fix typo', 'gpt')]:
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

    def test_two_queued_tasks_do_not_launch_concurrently(self):
        self.bot.submit(self.body)
        self.bot.submit(dict(self.body, id='task-2'))
        self.fake.status = 'timeout'
        for _ in range(5):
            self.bot.tick()
        self.assertEqual(self.bot.result('task-1')['state'], 'running')
        self.assertEqual(self.bot.result('task-2')['state'], 'queued')
        self.assertEqual(len(self.fake.launches), 1)

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
