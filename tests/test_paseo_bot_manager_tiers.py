"""Manager profiles: chat/plan tiers, escalation, owner switch and the spare manager. No live model."""
import json
from pathlib import Path
import socket
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/paseo-bot'))
from gui_state import Conversations
from gui_api import handle
from paseo_bot import write_json

MANAGERS = {
    'codex': {'provider': 'codex', 'mode': 'auto',
              'chat': {'model': 'gpt-6.1-terra', 'thinking': 'max'},
              'plan': {'model': 'gpt-6.1-sol', 'thinking': 'high'}},
    'claude': {'provider': 'claude', 'mode': 'default',
               'chat': {'model': 'claude-sonnet-5-5', 'thinking': 'medium'},
               'plan': {'model': 'claude-opus-5-5', 'thinking': 'high'}},
}


class FakeDaemon:
    """Agents keyed by id with a label; every call is recorded with the tier fields it carried."""

    def __init__(self):
        self.calls = []
        self.agents = {}
        self.replies = []
        self.count = 0

    def __call__(self, config, action, **kw):
        self.calls.append(dict(action=action, provider=config.get('provider'), model=config.get('model'),
                               thinking=config.get('thinking'), mode=config.get('mode'), **kw))
        if action == 'create':
            self.count += 1
            agent = 'agent-%d' % self.count
            self.agents[agent] = {'label': kw['session'], 'model': config['model'], 'archived': False}
            return {'id': agent, 'workspaceId': 'ws'}
        if action == 'recover':
            return {'agents': [{'id': a} for a, v in self.agents.items() if v['label'] == kw['session'] and not v['archived']]}
        owned = self.agents.get(kw.get('agentId'))
        if not owned or owned['label'] != kw['session'] or owned['archived']:
            raise ValueError('ownership')
        if action == 'claim':
            owned['label'] = kw['to']
            return {'claimed': True}
        if action == 'tune':
            owned['model'] = config['model']
            return {'tuned': True}
        if action == 'archive':
            owned['archived'] = True
            return {'archived': True}
        if action == 'send':
            return {'accepted': True}
        if action == 'observe':
            message = self.replies.pop(0) if self.replies else ''
            return {'status': 'idle', 'message': message, 'pendingPermissions': 0}
        if action == 'find':
            return {'found': True}
        raise AssertionError(action)

    def actions(self, name):
        return [c for c in self.calls if c['action'] == name]


def reply(request_id, text, tasks=(), **extra):
    return 'PASEO_GUI_RESPONSE=' + json.dumps(dict(requestId=request_id, reply=text, tasks=list(tasks), **extra))


class ManagerTierTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name) / 'state'
        self.fake = FakeDaemon()
        self.c = Conversations(self.home, self.fake)
        self.c.migrate()
        write_json(self.home / 'owner.json', {'version': 1, 'host': socket.gethostname().casefold(), 'mode': 'active'})
        write_json(self.home / 'projects.json', {'version': 1, 'projects': [{'id': 'fixture', 'targets': [{'machine': 'TEST', 'repo': '/fixture', 'defaultBranch': 'main', 'enabled': True, 'gates': ['echo test'], 'deployCommands': [], 'skills': []}]}]})
        self.runtime(spare=False)
        self.step = dict(project='fixture', title='Fixture task', prompt='Make the bounded change', kind='gpt')

    def tearDown(self):
        self.c.close()
        self.tmp.cleanup()

    def runtime(self, spare):
        write_json(self.home / 'gui-runtime.json', dict(serverId='fixture-server', cwd='/fixture', provider='codex',
                                                        model='legacy', thinking='low', managers=MANAGERS,
                                                        defaultManager='codex', spareManager=spare))

    def job_state(self, job_id):
        row = self.c.db.execute('SELECT state FROM gui_jobs WHERE id=?', (job_id,)).fetchone()
        return row[0] if row else None

    def start(self, conversation='session-1', message='m1', text='안녕'):
        self.c.create(conversation)
        self.c.send(conversation, message, text)
        self.c.tick()  # creation rides along with the first request

    def test_first_turn_creates_the_manager_on_the_chat_tier(self):
        self.start()
        created = self.fake.actions('create')
        self.assertEqual([(c['provider'], c['model'], c['thinking'], c['mode']) for c in created],
                         [('codex', 'gpt-6.1-terra', 'max', 'auto')])
        self.assertIn('Manager tier: chat', created[0]['prompt'])
        self.fake.replies.append(reply('m1', '안녕하세요'))
        self.c.tick()
        self.assertEqual(self.job_state('m1'), 'done')
        self.assertEqual(self.fake.actions('tune'), [])  # already on the chat tier

    def test_chat_tier_escalates_and_planner_tier_writes_the_plan(self):
        self.start(text='fixture에 기능 추가해줘')
        self.fake.replies.append(reply('m1', '계획을 세울게요.', escalate='plan'))
        self.c.tick()
        self.assertEqual(self.job_state('m1'), 'done')
        self.assertEqual(self.job_state('m1.plan'), 'queued')
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM gui_plans").fetchone()[0], 0)
        self.c.tick()  # tune to the planner tier and send the same request
        tune = self.fake.actions('tune')[-1]
        self.assertEqual((tune['model'], tune['thinking']), ('gpt-6.1-sol', 'high'))
        sent = self.fake.actions('send')[-1]['prompt']
        self.assertIn('GUI_REQUEST_ID=m1.plan', sent)
        self.assertIn('Manager tier: plan', sent)
        self.fake.replies.append(reply('m1.plan', '이렇게 진행할게요.', [self.step]))
        self.c.tick()
        body = json.loads(self.c.db.execute("SELECT body FROM gui_plans").fetchone()[0])
        self.assertEqual(body['messageId'], 'm1')  # the owner's message, not the internal job
        # The next chat turn goes back to the fast tier.
        self.c.send('session-1', 'm2', '고마워')
        self.c.tick()
        tune = self.fake.actions('tune')[-1]
        self.assertEqual((tune['model'], tune['thinking']), ('gpt-6.1-terra', 'max'))

    def test_chat_tier_change_plan_is_escalated_but_inspect_runs(self):
        self.start(text='바꿔줘')
        self.fake.replies.append(reply('m1', '바로 할게요', [dict(self.step, workflow='daily')]))
        self.c.tick()
        self.assertEqual(self.job_state('m1.plan'), 'queued')
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM gui_plans").fetchone()[0], 0)
        self.c.tick()  # m1.plan sent on the planner tier
        self.fake.replies.append(reply('m1.plan', '계획', [self.step]))
        self.c.tick()  # m1.plan collected
        self.c.send('session-1', 'm2', '상태 확인해줘')
        self.c.tick()  # m2 sent
        self.fake.replies.append(reply('m2', '확인할게요', [dict(self.step, workflow='inspect')]))
        self.c.tick()
        self.assertIsNone(self.job_state('m2.plan'))
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM tasks").fetchone()[0], 1)  # inspect auto-admitted

    def test_planner_tier_never_escalates_again(self):
        self.c.create('session-1')
        self.c.send('session-1', 'm1', '바꿔줘', selection=dict(workflow='daily'))
        self.c.tick()
        created = self.fake.actions('create')[0]
        self.assertEqual(created['model'], 'gpt-6.1-sol')  # owner chose a change workflow: plan tier
        self.fake.replies.append(reply('m1', '계획', [self.step], escalate='plan'))
        self.c.tick()
        self.assertIsNone(self.job_state('m1.plan'))
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM gui_plans").fetchone()[0], 1)

    def test_owner_switch_retires_old_manager_and_replays_chat(self):
        self.start()
        self.fake.replies.append(reply('m1', '안녕하세요'))
        self.c.tick()
        info = handle(self.home, dict(action='manager', profile='claude'), True)
        self.assertEqual((info['profile'], info['changed']), ('claude', True))
        self.assertEqual(handle(self.home, dict(action='manager'), True)['chat']['model'], 'claude-sonnet-5-5')
        with self.assertRaises(ValueError):
            handle(self.home, dict(action='manager', profile='claude'))  # read-only bridge
        with self.assertRaises(ValueError):
            handle(self.home, dict(action='manager', profile='gemini'), True)
        self.c.send('session-1', 'm2', '이어서')
        self.c.tick()  # archive the codex manager
        self.assertTrue(self.fake.agents['agent-1']['archived'])
        self.c.tick()  # new claude manager rides along with the queued request
        created = self.fake.actions('create')[-1]
        self.assertEqual((created['provider'], created['model'], created['mode']), ('claude', 'claude-sonnet-5-5', 'default'))
        self.assertIn('Earlier messages in THIS conversation', created['prompt'])
        self.assertIn('안녕하세요', created['prompt'])

    def test_spare_is_created_when_idle_and_claimed_by_a_new_thread(self):
        self.runtime(spare=True)
        self.c.tick()
        spare = self.fake.actions('create')
        self.assertEqual(len(spare), 1)
        self.assertTrue(spare[0]['session'].startswith('spare-'))
        self.assertEqual(spare[0]['model'], 'gpt-6.1-terra')
        self.c.tick()
        self.assertEqual(len(self.fake.actions('create')), 1)  # one spare at a time
        self.c.create('session-1')
        self.c.send('session-1', 'm1', '안녕')
        self.c.tick()  # claim, no creation for the conversation
        self.assertEqual(self.fake.agents['agent-1']['label'], 'session-1')
        self.assertEqual(len(self.fake.actions('create')), 1)  # busy: no new spare while a reply is pending
        self.c.tick()  # send on the claimed manager
        self.assertEqual(self.fake.actions('send')[-1]['agentId'], 'agent-1')
        self.assertEqual(self.fake.actions('tune'), [])
        self.fake.replies.append(reply('m1', '안녕하세요'))
        self.c.tick()
        self.assertEqual(self.job_state('m1'), 'done')
        self.assertEqual(len(self.fake.actions('create')), 2)  # the next spare is ready again

    def test_spare_of_an_old_profile_is_archived(self):
        self.runtime(spare=True)
        self.c.tick()
        self.c.set_manager('claude')
        self.c.tick()
        self.assertTrue(self.fake.agents['agent-1']['archived'])
        self.c.tick()
        self.assertEqual(self.fake.actions('create')[-1]['provider'], 'claude')

    def test_legacy_runtime_without_profiles_is_unchanged(self):
        write_json(self.home / 'gui-runtime.json', dict(serverId='fixture-server', cwd='/fixture', provider='codex', model='legacy', thinking='low'))
        self.start(text='바꿔줘')
        created = self.fake.actions('create')[0]
        self.assertEqual(created['model'], 'legacy')
        self.assertNotIn('Manager tier', created['prompt'])
        self.fake.replies.append(reply('m1', '계획', [self.step], escalate='plan'))
        self.c.tick()
        self.assertIsNone(self.job_state('m1.plan'))
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM gui_plans").fetchone()[0], 1)
        with self.assertRaises(ValueError):
            self.c.set_manager('codex')

    def test_invalid_profiles_are_rejected(self):
        for managers in [{'codex': dict(MANAGERS['codex'], extra=1)}, {'Bad Name': MANAGERS['codex']},
                         {'codex': dict(MANAGERS['codex'], chat={'model': 'x'})}, {}]:
            write_json(self.home / 'gui-runtime.json', dict(serverId='s', cwd='/f', provider='codex', model='m', thinking='low', managers=managers))
            with self.assertRaises(ValueError):
                self.c.runtime_config()
        write_json(self.home / 'gui-runtime.json', dict(serverId='s', cwd='/f', provider='codex', model='m', thinking='low', managers=MANAGERS, defaultManager='gemini'))
        with self.assertRaises(ValueError):
            self.c.runtime_config()


if __name__ == '__main__':
    unittest.main()
