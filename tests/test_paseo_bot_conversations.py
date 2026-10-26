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
        with self.assertRaises(ValueError): self.c.tick()
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
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM gui_messages WHERE role='system' AND text LIKE '작업 상태%'").fetchone()[0], 1)

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
