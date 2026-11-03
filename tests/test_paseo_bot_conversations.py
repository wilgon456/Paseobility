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
import gui_state
from gui_state import Conversations
from gui_api import handle
from paseo_bot import write_json


class FakeManager:
    def __init__(self):
        self.sent = []
        self.reply = ''
        self.lose_ack = False
        self.found = True
        self.created = []
        self.archived = []
        self.permits = []
        self.permit_calls = []

    def __call__(self, config, action, **kw):
        if action == 'create':
            self.created.append(kw)
            return {'id': 'new-gui-manager', 'workspaceId': 'manager-ws'}
        if action == 'archive':
            self.archived.append(kw['agentId'])
            return {'archived': True}
        if action == 'recover': return {'agents': [{'id': 'new-gui-manager'}]}
        if action == 'observe': return {'status': 'idle', 'message': self.reply}
        if action == 'send':
            self.sent.append(kw)
            if self.lose_ack: raise ValueError('lost acknowledgement')
            return {'accepted': True}
        if action == 'find': return {'found': self.found}
        if action == 'permits': return list(self.permits)
        if action == 'permit':
            self.permit_calls.append(kw)
            self.permits = [item for item in self.permits if item.get('id') != kw['requestId']]
            return {'result': kw['decision']}
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
        self.c.bot.submit(dict(self.step, id='discord-one'), {'requester': 'discord'})
        for i in range(102): self.c.bot.submit(dict(self.step, id='cli-' + str(i)))
        path = self.home / 'queue.sqlite3'; before = path.read_bytes()
        out = handle(self.home, dict(action='sync', requester='discord', query='Fixture', sort='oldest'), True)
        self.assertEqual(out['filtered'], 1); self.assertEqual(out['tasks'][0]['id'], 'discord-one')
        self.assertEqual(out['tasks'][0]['requester'], 'discord'); self.assertEqual(out['total'], 103)
        self.assertEqual(path.read_bytes(), before)
        for request in [dict(action='sync', sort='DROP TABLE tasks'), dict(action='sync', group='shell')]:
            with self.assertRaises(ValueError): handle(self.home, request)

    def test_control_and_blocked_kind_notices_are_announced_once(self):
        task = self.c.bot.submit(dict(self.step, id='notice-task'), {'conversationId': 'session-1'})

        def count(needle):
            return self.c.db.execute(
                "SELECT count(*) FROM gui_messages WHERE conversation='session-1' AND role='system' AND instr(text,?)>0",
                (needle,)).fetchone()[0]

        def announce(record, needle):
            self.c.bot.save(dict(self.c.bot.result('notice-task'), **record))
            self.c.tick_notices()
            self.c.tick_notices()
            self.assertEqual(count(needle), 1, needle)

        announce(dict(state='paused', pausedFrom='running', pausedAt=time.time(), pausedStage='work', stage='work'),
                 '작업을 잠시 멈췄어요.')
        announce(dict(state='running', resumedAt=time.time(), stage='work'), '작업을 다시 시작했어요.')
        announce(dict(state='held', stage='work'), '작업을 대기열에서 보류했어요.')
        labels = {'needs_input': '입력이나 승인이 필요해 멈췄어요.', 'capability': '실행 환경을 준비하지 못했어요.',
                  'dependency': '선행 작업이 끝나지 않아 멈췄어요.', 'timeout': '시간 제한을 넘겨 멈췄어요.',
                  'evidence': '결과를 확인하지 못해 멈췄어요.', 'verdict': '작업자가 진행할 수 없다고 판단했어요.',
                  'transient': '연결 문제로 멈췄어요.', 'cancelled': '요청대로 작업을 취소했어요.'}
        for kind, label in labels.items():
            announce(dict(state='blocked', blockedKind=kind, stage='work', reason='fixture ' + kind), label)
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM tasks WHERE id='notice-task'").fetchone()[0], 1)
        self.assertEqual(task['id'], 'notice-task')

    def test_results_are_delivered_to_origin_conversation_once(self):
        plan, digest = self.plan(); task = self.c.approve('session-1', plan, digest)['taskIds'][0]
        self.c.bot.save(dict(self.c.bot.result(task), state='passed', summary='Gate passed'))
        self.c.tick(); self.c.tick()
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM gui_jobs WHERE kind='result'").fetchone()[0], 0)
        notices = [json.loads(row[0]) for row in self.c.db.execute("SELECT payload FROM gui_messages WHERE role='system'")]
        self.assertEqual(sum(payload.get('taskIds') == [task] for payload in notices), 2)  # Admission plus one result.

    def test_daily_default_is_enforced_over_model_plan_and_survives_approval(self):
        plan, digest = self.plan([dict(self.step, workflow='verified')])
        task = self.c.approve('session-1', plan, digest)['taskIds'][0]
        body = json.loads(self.c.db.execute('SELECT body FROM tasks WHERE id=?', (task,)).fetchone()[0])
        self.assertEqual(body['workflow'], 'daily')
        projected = handle(self.home, dict(action='sync'), True)['tasks'][0]
        self.assertEqual(projected['workflow'], 'daily')

    def test_daily_plan_budget_rejects_excess_tasks_without_admission(self):
        with self.assertRaises(ValueError):
            self.plan([self.step] * 4)
        self.assertEqual(self.c.db.execute('SELECT count(*) FROM gui_plans').fetchone()[0], 0)
        self.assertEqual(self.c.db.execute('SELECT count(*) FROM tasks').fetchone()[0], 0)

    def test_verified_selection_allows_larger_plan(self):
        self.c.send('session-1', 'verified', 'Implement', selection={'workflow': 'verified'})
        job = self.c.db.execute("SELECT * FROM gui_jobs WHERE id='verified'").fetchone()
        self.c.collect_reply(job, 'PASEO_GUI_RESPONSE=' + json.dumps(dict(requestId='verified', reply='Ready', tasks=[self.step] * 4)))
        body = json.loads(self.c.db.execute('SELECT body FROM gui_plans').fetchone()[0])
        self.assertEqual([task['workflow'] for task in body['tasks']], ['verified'] * 4)

    def test_writing_deliverable_creates_no_worker_plan(self):
        self.c.send('session-1', 'writing', 'Write a short announcement')
        job = self.c.db.execute("SELECT * FROM gui_jobs WHERE id='writing'").fetchone()
        article = 'A complete fixture announcement.'
        self.c.collect_reply(job, 'PASEO_GUI_RESPONSE=' + json.dumps(dict(requestId='writing', reply=article, tasks=[])))
        reply = self.c.db.execute("SELECT text FROM gui_messages WHERE id='reply-writing'").fetchone()[0]
        self.assertEqual(reply, article)
        self.assertEqual(self.c.db.execute('SELECT count(*) FROM gui_plans').fetchone()[0], 0)

    def test_workflow_changes_cannot_reuse_a_message_id(self):
        self.c.send('session-1', 'same', 'Task', selection={'workflow': 'daily'})
        with self.assertRaises(ValueError):
            self.c.send('session-1', 'same', 'Task', selection={'workflow': 'verified'})

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

    def test_real_cli_discord_attribution_without_gui_schema_fields(self):
        script = Path(__file__).resolve().parents[1] / 'tools/paseo-bot/paseo_bot.py'
        task = dict(self.step, id='discord-cli')
        r = subprocess.run([sys.executable, str(script), '--state', str(self.home), 'submit', '--producer', 'discord'],
                           input=json.dumps(task).encode('utf-8'), capture_output=True, timeout=20)
        self.assertEqual(r.returncode, 0, r.stdout)
        out = handle(self.home, dict(action='sync', requester='discord'))
        self.assertEqual(out['filtered'], 1); self.assertEqual(out['tasks'][0]['requester'], 'discord')

    def age(self, conversation, days):
        old = time.time() - days * 86400
        self.c.db.execute('UPDATE gui_messages SET time=? WHERE conversation=?', (old, conversation))
        self.c.db.execute('UPDATE gui_conversations SET created=? WHERE id=?', (old, conversation))
        self.c.db.commit()

    def reply_with(self, message, tasks, selection=None):
        self.c.send('session-1', message, 'Question about fixture', selection=selection)
        job = self.c.db.execute('SELECT * FROM gui_jobs WHERE id=?', (message,)).fetchone()
        self.c.collect_reply(job, 'PASEO_GUI_RESPONSE=' + json.dumps(dict(requestId=message, reply='OK', tasks=tasks)))
        return self.c.db.execute('SELECT id,state FROM gui_plans ORDER BY created DESC LIMIT 1').fetchone()

    def test_inspect_only_plan_starts_without_a_click(self):
        plan_id, state = self.reply_with('ask-1', [dict(self.step, workflow='inspect')])
        self.assertEqual(state, 'approved')
        task = self.c.bot.result(plan_id + '-1')
        self.assertEqual(task['workflow'], 'inspect')
        texts = [r[0] for r in self.c.db.execute("SELECT text FROM gui_messages WHERE conversation='session-1' AND role='system'")]
        self.assertIn('읽기 전용 확인이라 바로 시작할게요.', texts)

    def test_owner_selected_workflow_overrides_the_manager(self):
        plan_id, state = self.reply_with('ask-2', [dict(self.step, workflow='inspect')], selection={'workflow': 'daily'})
        self.assertEqual(state, 'pending')
        body = json.loads(self.c.db.execute('SELECT body FROM gui_plans WHERE id=?', (plan_id,)).fetchone()[0])
        self.assertEqual(body['tasks'][0]['workflow'], 'daily')

    def test_mixed_inspect_and_change_plan_still_needs_a_click(self):
        _, state = self.reply_with('ask-3', [dict(self.step, workflow='inspect'), dict(self.step, workflow='daily', title='Change it')])
        self.assertEqual(state, 'pending')

    def test_auto_admit_can_be_turned_off(self):
        config = json.loads((self.home / 'gui-runtime.json').read_text(encoding='utf-8'))
        write_json(self.home / 'gui-runtime.json', dict(config, autoAdmitInspect=False))
        _, state = self.reply_with('ask-4', [dict(self.step, workflow='inspect')])
        self.assertEqual(state, 'pending')

    def test_first_question_rides_with_manager_creation(self):
        # A conversation whose first message is already queued: one model turn, no greeting turn.
        self.c.create('session-fast')
        self.c.send('session-fast', 'fast-1', 'How many projects?')
        sent_before = len(self.fake.sent)
        self.c.tick()
        created = self.fake.created[-1]['prompt']
        self.assertIn('GUI_REQUEST_ID=fast-1', created)
        self.assertIn('How many projects?', created)
        self.assertEqual(len(self.fake.sent), sent_before)  # nothing sent separately
        state = self.c.db.execute("SELECT state FROM gui_jobs WHERE id='fast-1'").fetchone()[0]
        self.assertEqual(state, 'waiting')
        self.fake.reply = 'PASEO_GUI_RESPONSE=' + json.dumps(dict(requestId='fast-1', reply='Twenty', tasks=[]))
        self.c.tick()
        self.assertEqual(self.c.db.execute("SELECT state FROM gui_jobs WHERE id='fast-1'").fetchone()[0], 'done')
        self.assertEqual(len(self.fake.sent), sent_before)

    def test_manager_permits_rpc_is_skipped_when_observe_reports_none(self):
        calls = []
        original = self.fake.__call__
        def rpc(config, action, **kw):
            calls.append(action)
            if action == 'observe':
                return {'status': 'idle', 'message': self.fake.reply, 'pendingPermissions': 0}
            return original(config, action, **kw)
        self.c.rpc = rpc
        self.converse('quiet', 'Hello', 'Hi')
        self.assertNotIn('permits', calls)

    def converse(self, message, text, reply):
        self.c.send('session-1', message, text)
        self.c.tick()
        self.fake.reply = 'PASEO_GUI_RESPONSE=' + json.dumps(dict(requestId=message, reply=reply, tasks=[]))
        self.c.tick()

    def test_manager_permissions_are_denied_without_asking_the_human(self):
        self.c.send('session-1', 'perm', 'Please change the fixture')
        self.fake.permits = [{'id': 'manager-req-1', 'name': 'Edit file', 'description': 'touch fixture.py'}]
        with patch.object(gui_state, 'log_event') as logged:
            self.c.tick()
        self.assertEqual(self.fake.permit_calls[-1]['decision'], 'deny')
        self.assertEqual(self.fake.permit_calls[-1]['requestId'], 'manager-req-1')
        denied = [call for call in logged.call_args_list if call.kwargs.get('status') == 'manager-permission-denied']
        self.assertEqual(len(denied), 1)
        self.assertEqual(denied[0].kwargs.get('name'), 'Edit file')
        self.assertNotIn('description', denied[0].kwargs)
        self.assertEqual(self.c.db.execute(
            "SELECT count(*) FROM gui_messages WHERE instr(text,'권한 요청이 왔어요')>0").fetchone()[0], 0)

    def test_unsafe_manager_mode_warns_once_per_process(self):
        config = json.loads((self.home / 'gui-runtime.json').read_text(encoding='utf-8'))
        write_json(self.home / 'gui-runtime.json', dict(config, mode='full-access'))
        gui_state._UNSAFE_MANAGER_MODES.clear()
        try:
            with patch.object(gui_state, 'log_event') as logged:
                self.assertEqual(self.c.runtime_config()['mode'], 'full-access')
                self.c.runtime_config()
            warnings = [call for call in logged.call_args_list if call.kwargs.get('status') == 'manager-mode-unsafe']
            self.assertEqual(len(warnings), 1)
            self.assertEqual(warnings[0].kwargs.get('mode'), 'full-access')
        finally:
            gui_state._UNSAFE_MANAGER_MODES.clear()

    def test_manager_role_prompt_is_read_only(self):
        prompt = self.c.role_prompt()
        for phrase in ['read-only', 'do not edit files', 'state-changing commands', 'access the network',
                       'must become a plan task']:
            self.assertIn(phrase, prompt)

    def test_managers_share_one_workspace_per_daemon(self):
        self.assertIsNone(self.fake.created[0]['workspaceId'])
        self.c.create('session-2'); self.c.tick()
        self.assertEqual(self.fake.created[1]['workspaceId'], 'manager-ws')
        config = json.loads((self.home / 'gui-runtime.json').read_text(encoding='utf-8'))
        write_json(self.home / 'gui-runtime.json', dict(config, serverId='other-server'))
        self.c.create('session-3'); self.c.tick()
        self.assertIsNone(self.fake.created[2]['workspaceId'])

    def test_idle_manager_is_archived_then_revived_with_history(self):
        self.converse('one', 'Remember the fixture deadline', 'Noted the deadline')
        self.c.tick()
        self.assertEqual(self.fake.archived, [])
        self.age('session-1', 8)
        self.c.tick()
        self.assertEqual(self.fake.archived, ['new-gui-manager'])
        self.assertEqual(self.c.conversation('session-1')['status'], 'dormant')
        self.c.tick()  # dormant without a new message: no remote call, no new manager
        self.assertEqual((len(self.fake.created), self.fake.archived), (1, ['new-gui-manager']))
        self.c.send('session-1', 'two', 'What was the deadline?')
        self.c.tick(); self.c.tick()
        self.assertEqual(len(self.fake.created), 2)
        # The revived manager receives history and the question with its creation: one model turn.
        prompt = self.fake.created[-1]['prompt']
        self.assertIn('Earlier messages in THIS conversation', prompt)
        self.assertIn('Remember the fixture deadline', prompt); self.assertIn('Noted the deadline', prompt)
        self.assertIsNone(self.c.db.execute("SELECT 1 FROM gui_meta WHERE key='revive:session-1'").fetchone())
        self.fake.reply = 'PASEO_GUI_RESPONSE=' + json.dumps(dict(requestId='two', reply='It was noted', tasks=[]))
        self.c.tick()
        self.c.send('session-1', 'three', 'Thanks'); self.c.tick()
        self.assertNotIn('Earlier messages', self.fake.sent[-1]['prompt'])

    def test_idle_archive_respects_pending_work_and_opt_out(self):
        self.c.send('session-1', 'one', 'A request')
        self.c.db.execute("UPDATE gui_jobs SET state='unknown'"); self.c.db.commit()
        self.age('session-1', 30)
        self.c.tick()
        self.assertEqual(self.fake.archived, [])
        self.c.resolve('session-1')
        self.age('session-1', 30)
        config =json.loads((self.home / 'gui-runtime.json').read_text(encoding='utf-8'))
        write_json(self.home / 'gui-runtime.json', dict(config, managerIdleDays=0))
        self.c.tick()
        self.assertEqual(self.fake.archived, [])
        write_json(self.home / 'gui-runtime.json', dict(config, managerIdleDays=-1))
        with self.assertRaises(ValueError): self.c.runtime_config()

    @unittest.skipUnless(sys.platform == 'win32', 'Windows producer byte-stream contract')
    def test_windows_discord_producer_wrapper(self):
        script = Path(__file__).resolve().parents[1] / 'tools/paseo-bot/paseo-bot.ps1'
        r = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script),
                            'submit', '-State', str(self.home), '-Producer', 'discord'],
                           input=json.dumps(dict(self.step, id='discord-powershell')).encode('utf-8'), capture_output=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertEqual(handle(self.home, dict(action='sync', requester='discord'))['filtered'], 1)


if __name__ == '__main__': unittest.main()


class KoreanReasonTests(unittest.TestCase):
    def test_known_reasons_and_validation_causes_become_korean(self):
        from gui_state import korean_reason
        text = korean_reason({'reason': 'Result receipt validation failed; the bot captures evidence, then archives the workspace. Nothing is relaunched.',
                              'validationError': 'Independent gate evidence incomplete.'})
        self.assertIn('검증 기준', text)
        self.assertIn('검사 명령이 모두 실행되지', text)
        self.assertNotIn('Nothing is relaunched', text)

    def test_unknown_english_reason_points_to_peek_and_korean_passes_through(self):
        from gui_state import korean_reason
        self.assertEqual(korean_reason({'reason': 'Some new internal failure text'}), '자세한 내용은 /peek 으로 볼 수 있어요.')
        self.assertEqual(korean_reason({'reason': '테스트 명령을 찾지 못했어요.'}), '테스트 명령을 찾지 못했어요.')
        self.assertEqual(korean_reason({}), '')


class HousekeepingNoticeTests(unittest.TestCase):
    def test_auto_closed_task_posts_no_notice_and_memory_review_sync_is_empty(self):
        import tempfile as _t
        from gui_api import handle as _handle
        tmp = _t.TemporaryDirectory()
        try:
            home = Path(tmp.name) / 'state'
            c = Conversations(home, FakeManager())
            c.migrate()
            write_json(home / 'owner.json', {'version': 1, 'host': socket.gethostname().casefold(), 'mode': 'active'})
            out = _handle(home, dict(action='sync', conversationId='memory-review'), True)
            self.assertEqual(out['messages'], [])
            with self.assertRaises(ValueError):
                _handle(home, dict(action='sync', conversationId='no-such-conversation'), True)
            c.db.close()
        finally:
            tmp.cleanup()


class CuratorNotifyCommitTests(unittest.TestCase):
    def test_curator_notice_is_committed_and_releases_the_write_lock(self):
        import tempfile as _t, sqlite3 as _sq
        tmp = _t.TemporaryDirectory()
        try:
            home = Path(tmp.name) / 'state'
            c = Conversations(home, FakeManager())
            c.migrate()
            c.create('notice-conv')
            # Exercise the same wrapper the curator receives.
            def notify(conversation, role, text, payload=None):
                with c.db:
                    c.message(conversation, role, text, payload)
            notify('notice-conv', 'system', '기억 변경 승인 요청', {'memoryApproval': {'key': 'abcdefabcdef'}})
            self.assertFalse(c.db.in_transaction)
            other = _sq.connect(home / 'queue.sqlite3', timeout=1)
            try:
                other.execute('BEGIN IMMEDIATE'); other.rollback()  # would raise "database is locked" if uncommitted
                self.assertEqual(other.execute("SELECT count(*) FROM gui_messages WHERE conversation='notice-conv' AND role='system'").fetchone()[0], 1)
            finally:
                other.close()
            c.db.close()
        finally:
            tmp.cleanup()


class ResidentManagerRPCTests(unittest.TestCase):
    """The resident client keeps one child, answers in order and recovers from a dead child."""

    def make(self, script):
        import gui_state, queue, threading, subprocess as sp, sys as _sys

        class Echo(gui_state.ResidentManagerRPC):
            TIMEOUT = 3
            starts = 0

            def _start(self):
                Echo.starts += 1
                self.proc = sp.Popen([_sys.executable, '-c', script], stdin=sp.PIPE, stdout=sp.PIPE, text=True)
                self.lines = queue.Queue()
                self.started = time.time()
                proc, lines = self.proc, self.lines

                def pump():
                    for line in proc.stdout:
                        lines.put(line)
                    lines.put(None)
                threading.Thread(target=pump, daemon=True).start()
        return Echo()

    def test_reuses_one_child_for_many_calls(self):
        rpc = self.make('import sys,json\nfor l in sys.stdin:\n r=json.loads(l)\n print(json.dumps({"ok":True,"result":{"echo":r["action"]}}),flush=True)')
        try:
            self.assertEqual(rpc({'serverId': 's'}, 'observe')['echo'], 'observe')
            self.assertEqual(rpc({'serverId': 's'}, 'send')['echo'], 'send')
            self.assertEqual(type(rpc).starts, 1)
        finally:
            rpc.close()

    def test_refusal_and_dead_child_raise_and_restart(self):
        rpc = self.make('import sys\nl=sys.stdin.readline()\nprint(\'{"ok":false}\',flush=True)')
        try:
            with self.assertRaises(ValueError):
                rpc({'serverId': 's'}, 'observe')
            time.sleep(0.3)  # child exited after one line
            with self.assertRaises(ValueError):
                rpc({'serverId': 's'}, 'observe')
            self.assertGreaterEqual(type(rpc).starts, 2)
        finally:
            rpc.close()
