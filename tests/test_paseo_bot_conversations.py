"""Conversation admission/recovery contracts; no live model, network or user state."""
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/paseo-bot'))
from gui_state import Conversations
from gui_api import handle
from paseo_bot import write_json


class FakeManager:
    def __init__(self):
        self.sent = []
        self.reply = ''
        self.lose_ack = False
        self.found = True

    def __call__(self, config, action, **kw):
        if action == 'create': return {'id': 'new-gui-manager'}
        if action == 'recover': return {'agents': [{'id': 'new-gui-manager'}]}
        if action == 'observe': return {'status': 'idle', 'message': self.reply}
        if action == 'send':
            self.sent.append(kw)
            if self.lose_ack: raise ValueError('lost acknowledgement')
            return {'accepted': True}
        if action == 'find': return {'found': self.found}
        raise AssertionError(action)


class ConversationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name) / 'state'
        self.fake = FakeManager()
        self.c = Conversations(self.home, self.fake)
        self.c.migrate()
        write_json(self.home / 'owner.json', {'version': 1, 'host': socket.gethostname().casefold(), 'mode': 'active'})
        write_json(self.home / 'projects.json', {'version': 1, 'projects': [{'id': 'fixture', 'targets': [{'machine': 'TEST', 'repo': '/fixture', 'defaultBranch': 'main', 'enabled': True, 'gates': ['echo test'], 'deployCommands': [], 'skills': []}]}]})
        write_json(self.home / 'gui-runtime.json', dict(serverId='fixture-server', cwd='/fixture', provider='codex', model='fixture', thinking='high'))
        self.c.create('session-1')
        self.c.tick()
        self.step = dict(project='fixture', title='Fixture task', prompt='Make the bounded change', kind='gpt')

    def tearDown(self):
        self.c.db.close()
        self.tmp.cleanup()

    def plan(self, steps=None, message='message-1'):
        self.c.send('session-1', message, 'Please work on fixture')
        job = self.c.db.execute('SELECT * FROM gui_jobs WHERE id=?', (message,)).fetchone()
        self.c.collect_reply(job, 'PASEO_GUI_RESPONSE=' + json.dumps(dict(requestId=message, reply='Plan ready', tasks=steps or [self.step])))
        return self.c.db.execute('SELECT id,digest FROM gui_plans ORDER BY created DESC LIMIT 1').fetchone()

    def test_plan_never_submits_without_confirmation(self):
        plan, digest = self.plan()
        self.assertEqual(self.c.db.execute('SELECT count(*) FROM tasks').fetchone()[0], 0)
        first = self.c.approve('session-1', plan, digest)
        self.assertEqual(first, self.c.approve('session-1', plan, digest))
        self.assertEqual(self.c.db.execute('SELECT count(*) FROM tasks').fetchone()[0], 1)
        origin = json.loads(self.c.db.execute('SELECT context FROM task_origins').fetchone()[0])
        self.assertEqual(origin['requester'], 'gui'); self.assertEqual(origin['conversationId'], 'session-1')

    def test_selected_model_is_validated_and_attached_to_approved_plan(self):
        for selection in [dict(project='/tmp', model='auto', effort='auto'), dict(project='auto', model='commandcode', effort='auto'), dict(project='auto', model='terra', effort='shell')]:
            with self.assertRaises(ValueError): self.c.send('session-1', 'bad', 'task', selection=selection)
        self.c.send('session-1', 'selected', 'task', selection=dict(project='fixture', model='sol', effort='high'))
        job = self.c.db.execute("SELECT * FROM gui_jobs WHERE id='selected'").fetchone()
        self.c.collect_reply(job, 'PASEO_GUI_RESPONSE=' + json.dumps(dict(requestId='selected', reply='Ready', tasks=[self.step])))
        plan, digest = self.c.db.execute('SELECT id,digest FROM gui_plans').fetchone()
        body = json.loads(self.c.db.execute('SELECT body FROM gui_plans').fetchone()[0])['tasks'][0]
        self.assertEqual((body['resolvedModel'], body['modelReason']), ('sol', '직접 선택'))
        task = self.c.approve('session-1', plan, digest)['taskIds'][0]
        admitted = json.loads(self.c.db.execute('SELECT body FROM tasks WHERE id=?', (task,)).fetchone()[0])
        self.assertEqual((admitted['model'], admitted['effort']), ('sol', 'high'))

    def test_stale_digest_cross_session_and_cancel_rejected(self):
        plan, digest = self.plan()
        self.c.create('session-2')
        with self.assertRaises(ValueError): self.c.approve('session-2', plan, digest)
        with self.assertRaises(ValueError): self.c.approve('session-1', plan, '0' * 64)
        self.c.reject('session-1', plan)
        with self.assertRaises(ValueError): self.c.approve('session-1', plan, digest)

    def test_rechecks_registry_at_confirmation(self):
        plan, digest = self.plan()
        config = self.c.bot.config(); config['projects'][0]['targets'][0]['enabled'] = False
        write_json(self.home / 'projects.json', config)
        with self.assertRaises(ValueError): self.c.approve('session-1', plan, digest)
        self.assertEqual(self.c.db.execute('SELECT count(*) FROM tasks').fetchone()[0], 0)

    def test_atomic_batch_rollback_and_dependencies(self):
        plan, digest = self.plan([self.step, dict(self.step, dependsOn=[0])])
        self.c.bot.submit(dict(self.step, id=plan + '-2', title='Collision'))
        with self.assertRaises(ValueError): self.c.approve('session-1', plan, digest)
        self.assertIsNone(self.c.db.execute('SELECT id FROM tasks WHERE id=?', (plan + '-1',)).fetchone())
        plan, digest = self.plan([self.step, dict(self.step, dependsOn=[0])], 'message-2')
        ids = self.c.approve('session-1', plan, digest)['taskIds']
        context = json.loads(self.c.db.execute('SELECT context FROM task_origins WHERE task_id=?', (ids[1],)).fetchone()[0])
        self.assertEqual(context['dependsOn'], [ids[0]])

    def test_rejects_cycles_bad_fields_and_inactive_machine(self):
        for step in [dict(self.step, dependsOn=[0]), dict(self.step, machine='OTHER'), dict(self.step, command='whoami'), dict(self.step, kind='shell')]:
            with self.assertRaises(ValueError): self.c.validate_steps([step])

    def test_message_idempotency_and_readonly_writes(self):
        for _ in range(2): self.c.send('session-1', 'one', 'A request')
        self.assertEqual(self.c.db.execute('SELECT count(*) FROM gui_jobs').fetchone()[0], 1)
        with self.assertRaises(ValueError): self.c.send('session-1', 'one', 'A different request')
        with self.assertRaises(ValueError): handle(self.home, dict(action='send', conversationId='session-1', messageId='two', text='Hi'))
        with self.assertRaises(ValueError): handle(self.home, dict(action='submit', task=dict(self.step, id='bypass')), True)

    def test_lost_send_receipt_is_adopted_not_resent(self):
        self.c.send('session-1', 'one', 'A request')
        self.fake.lose_ack = True
        self.c.tick()  # The lost acknowledgement is contained to this conversation.
        self.assertEqual(self.c.db.execute('SELECT state FROM gui_jobs').fetchone()[0], 'prepared')
        self.fake.lose_ack = False
        self.c.tick()
        self.assertEqual(len(self.fake.sent), 1)
        self.assertEqual(self.c.db.execute('SELECT state FROM gui_jobs').fetchone()[0], 'waiting')

    def test_missing_delivery_proof_becomes_unknown(self):
        self.c.send('session-1', 'one', 'A request')
        self.c.db.execute("UPDATE gui_jobs SET state='prepared'"); self.c.db.commit()
        self.fake.found = False
        self.c.tick(); self.c.tick()
        self.assertEqual(len(self.fake.sent), 0)
        self.assertEqual(self.c.db.execute('SELECT state FROM gui_jobs').fetchone()[0], 'unknown')

    def test_unknown_delivery_is_visible_and_only_operator_resolves_it(self):
        self.c.send('session-1', 'one', 'A request')
        self.c.db.execute("UPDATE gui_jobs SET state='prepared'"); self.c.db.commit()
        self.fake.found = False
        self.c.tick()
        self.c.send('session-1', 'two', 'Next request')
        self.c.tick(); self.c.tick()
        self.assertEqual(len(self.fake.sent), 0)  # Never resent or skipped automatically.
        self.assertEqual(handle(self.home, dict(action='sync'), True)['stuck'], 'job-unknown')
        handle(self.home, dict(action='resolve', conversationId='session-1'), True)
        self.assertEqual(handle(self.home, dict(action='sync'), True)['stuck'], '')
        self.c.tick()
        self.assertEqual([s['prompt'].split('\n')[0] for s in self.fake.sent], ['GUI_REQUEST_ID=two'])
        with self.assertRaises(ValueError):
            handle(self.home, dict(action='resolve', conversationId='session-1'))  # Read-only bridge.

    def test_missing_manager_waits_for_explicit_restart(self):
        self.c.create('session-2')
        self.c.db.execute("UPDATE gui_conversations SET status='creating' WHERE id='session-2'"); self.c.db.commit()
        calls = []
        original = self.fake.__call__
        def rpc(config, action, **kw):
            calls.append(action)
            if action == 'recover':
                return {'agents': []}
            return original(config, action, **kw)
        self.c.rpc = rpc
        self.c.tick(); self.c.tick()
        self.assertNotIn('create', calls)
        self.assertEqual(handle(self.home, dict(action='sync', conversationId='session-2'), True)['stuck'], 'manager-missing')
        self.c.resolve('session-2')
        self.c.tick()
        self.assertIn('create', calls)
        self.assertEqual(self.c.conversation('session-2')['status'], 'idle')

    def test_idle_conversations_skip_remote_calls_and_failures_are_isolated(self):
        calls = []
        original = self.fake.__call__
        def rpc(config, action, **kw):
            calls.append((kw.get('session'), action))
            if kw.get('session') == 'session-1':
                raise ValueError('foreign or unreachable manager')
            return original(config, action, **kw)
        self.c.rpc = rpc
        self.c.tick()
        self.assertEqual(calls, [])  # Idle without pending work: no remote round trip.
        self.c.create('session-2'); self.c.tick()
        self.c.send('session-1', 'a', 'First'); self.c.send('session-2', 'b', 'Second')
        self.c.tick()
        self.assertIn(('session-2', 'send'), calls)

    def test_runtime_mode_is_optional_and_validated(self):
        write_json(self.home / 'gui-runtime.json', dict(serverId='s', cwd='/f', provider='codex', model='m', thinking='high', mode='auto'))
        self.assertEqual(self.c.runtime_config()['mode'], 'auto')
        write_json(self.home / 'gui-runtime.json', dict(serverId='s', cwd='/f', provider='codex', model='m', thinking='high', shell='x'))
        with self.assertRaises(ValueError): self.c.runtime_config()

    def test_wrong_request_response_cannot_create_plan(self):
        self.c.send('session-1', 'one', 'A request')
        job = self.c.db.execute('SELECT * FROM gui_jobs').fetchone()
        with self.assertRaises(ValueError): self.c.collect_reply(job, 'PASEO_GUI_RESPONSE=' + json.dumps(dict(requestId='another', reply='Hi', tasks=[self.step])))
        self.assertEqual(self.c.db.execute('SELECT count(*) FROM gui_plans').fetchone()[0], 0)

    def test_new_manager_binding_preserves_old_agent(self):
        conv = self.c.conversation('session-1')
        self.assertEqual(conv['agentId'], 'new-gui-manager')
        self.assertNotIn('89bc13c', json.dumps(conv))

    def test_failed_retry_requires_new_manager_plan(self):
        record = self.c.bot.submit(dict(self.step, id='failed-task'))
        with self.assertRaises(ValueError): self.c.send('session-1', 'retry', 'Retry', 'failed-task')
        self.c.bot.save(dict(record, state='failed', reason='Fixture failure'))
        self.c.send('session-1', 'retry', 'Review retry', 'failed-task')
        self.assertEqual(self.c.db.execute('SELECT count(*) FROM tasks').fetchone()[0], 1)
        job = self.c.db.execute("SELECT * FROM gui_jobs WHERE id='retry'").fetchone()
        self.c.collect_reply(job, 'PASEO_GUI_RESPONSE=' + json.dumps(dict(requestId='retry', reply='New plan', tasks=[self.step])))
        plan, digest = self.c.db.execute('SELECT id,digest FROM gui_plans').fetchone()
        new_id = self.c.approve('session-1', plan, digest)['taskIds'][0]
        self.assertNotEqual(new_id, 'failed-task')
        self.assertEqual(self.c.bot.result('failed-task')['state'], 'failed')

    def test_readonly_sync_full_queue_filters_and_provenance(self):
        self.c.bot.submit(dict(self.step, id='grok-one'), {'requester': 'grok'})
        for i in range(102): self.c.bot.submit(dict(self.step, id='cli-' + str(i)))
        path = self.home / 'queue.sqlite3'; before = path.read_bytes()
        out = handle(self.home, dict(action='sync', requester='grok', query='Fixture', sort='oldest'), True)
        self.assertEqual(out['filtered'], 1); self.assertEqual(out['tasks'][0]['id'], 'grok-one')
        self.assertEqual(out['tasks'][0]['requester'], 'grok'); self.assertEqual(out['total'], 103)
        self.assertEqual(path.read_bytes(), before)
        for request in [dict(action='sync', sort='DROP TABLE tasks'), dict(action='sync', group='shell')]:
            with self.assertRaises(ValueError): handle(self.home, request)

    def test_results_are_delivered_to_origin_conversation_once(self):
        plan, digest = self.plan(); task = self.c.approve('session-1', plan, digest)['taskIds'][0]
        self.c.bot.save(dict(self.c.bot.result(task), state='passed', summary='Gate passed'))
        self.c.tick(); self.c.tick()
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM gui_jobs WHERE kind='result'").fetchone()[0], 1)
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM gui_messages WHERE role='system' AND text='작업과 확인을 마쳤어요.'").fetchone()[0], 1)

    def test_short_status_request_receives_actual_conversation_task_context(self):
        plan, digest = self.plan(); task = self.c.approve('session-1', plan, digest)['taskIds'][0]
        self.c.send('session-1','status-question','Status?')
        self.c.tick()
        self.assertIn(task,self.fake.sent[-1]['prompt'])
        self.assertIn('queued',self.fake.sent[-1]['prompt'])

    def test_model_retry_reference_requires_failed_task_in_same_conversation(self):
        record=self.c.bot.submit(dict(self.step,id='failed-in-chat'),{'requester':'gui','conversationId':'session-1'})
        self.c.bot.save(dict(record,state='failed'))
        self.c.send('session-1','repeat','Do it again')
        job=self.c.db.execute("SELECT * FROM gui_jobs WHERE id='repeat'").fetchone()
        response=dict(requestId='repeat',reply='A retry plan',tasks=[self.step],retryOf='failed-in-chat')
        self.c.collect_reply(job,'PASEO_GUI_RESPONSE='+json.dumps(response))
        body=json.loads(self.c.db.execute('SELECT body FROM gui_plans').fetchone()[0]);self.assertEqual(body['retryOf'],'failed-in-chat')
        self.c.bot.save(dict(record,state='unknown'))
        with self.assertRaises(ValueError):self.c.collect_reply(job,'PASEO_GUI_RESPONSE='+json.dumps(response))

    def test_first_sentence_creates_session_without_form_or_duplicate_message(self):
        req=dict(action='start',requestId='first-chat',messageId='first-message',text='Please work on fixture')
        for _ in range(2):self.assertEqual(handle(self.home,req,True)['conversationId'],'first-chat')
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM gui_jobs WHERE id='first-message'").fetchone()[0],1)

    def test_absent_optional_agents_file_is_not_a_preflight_blocker(self):
        record=dict(id='test',target=dict(repo='/repo',defaultBranch='main',gates=[],skills=[]),branch='paseo-bot/test',evidence={})
        prompt=self.c.bot.prompt(dict(self.step,id='test'),record,'preflight')
        self.assertIn('AGENTS.md if it exists',prompt);self.assertIn('optional AGENTS.md is not a blocker',prompt)

    def test_dependency_failure_blocks_child_without_launch(self):
        plan, digest = self.plan([self.step, dict(self.step, dependsOn=[0])])
        ids = self.c.approve('session-1', plan, digest)['taskIds']
        self.c.bot.save(dict(self.c.bot.result(ids[0]), state='failed'))
        with patch.object(self.c.bot, 'step', side_effect=AssertionError('Dependent dispatched')):
            self.c.bot.tick()
        self.assertEqual(self.c.bot.result(ids[1])['state'], 'blocked')

    def test_memory_needs_explicit_message_reference(self):
        self.plan()
        with self.assertRaises(ValueError): self.c.remember('session-1', 'message-1', 'fixture')
        self.c.remember('session-1', 'reply-message-1', 'fixture')
        self.assertEqual(self.c.db.execute('SELECT count(*) FROM gui_memory').fetchone()[0], 1)

    def test_real_cli_grok_attribution_without_gui_schema_fields(self):
        script = Path(__file__).resolve().parents[1] / 'tools/paseo-bot/paseo_bot.py'
        task = dict(self.step, id='grok-cli')
        r = subprocess.run([sys.executable, str(script), '--state', str(self.home), 'submit', '--producer', 'grok'],
                           input=json.dumps(task).encode('utf-8'), capture_output=True, timeout=20)
        self.assertEqual(r.returncode, 0, r.stdout)
        out = handle(self.home, dict(action='sync', requester='grok'))
        self.assertEqual(out['filtered'], 1); self.assertEqual(out['tasks'][0]['requester'], 'grok')

    @unittest.skipUnless(sys.platform == 'win32', 'Windows producer byte-stream contract')
    def test_windows_grok_producer_wrapper(self):
        script = Path(__file__).resolve().parents[1] / 'tools/paseo-bot/paseo-bot.ps1'
        r = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script),
                            'submit', '-State', str(self.home), '-Producer', 'grok'],
                           input=json.dumps(dict(self.step, id='grok-powershell')).encode('utf-8'), capture_output=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertEqual(handle(self.home, dict(action='sync', requester='grok'))['filtered'], 1)


if __name__ == '__main__': unittest.main()
