"""Supervisor backoff and Task Scheduler contracts; no task is registered and no process is started."""
from pathlib import Path
import sys
import json
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/paseo-bot'))
import supervisor

NS = {'t': 'http://schemas.microsoft.com/windows/2004/02/mit/task'}


class BackoffTests(unittest.TestCase):
    def test_delay_doubles_and_caps(self):
        self.assertEqual([supervisor.next_delay(n) for n in range(1, 12)],
                         [1, 2, 4, 8, 16, 32, 64, 128, 256, 300, 300])

    def test_quick_exits_accumulate_and_a_healthy_run_resets(self):
        b = supervisor.Backoff()
        delays = []
        for now in (0, 2, 5, 10):
            b.start(now)
            delays.append(b.exited(now + 1))
        self.assertEqual(delays, [1, 2, 4, 8])
        b.start(100)
        self.assertEqual(b.exited(100 + supervisor.HEALTHY_SECONDS), 1)

    def test_requested_restart_is_not_a_failure(self):
        b = supervisor.Backoff()
        for now in (0, 2, 4):
            b.start(now); b.exited(now + 1)
        b.start(10)
        self.assertEqual((b.exited(11, counts=False), b.failures), (1, 0))

    def test_failed_launch_counts_as_failure(self):
        b = supervisor.Backoff()
        self.assertEqual((b.exited(0), b.exited(1)), (1, 2))


class LivenessTests(unittest.TestCase):
    def test_hung_only_after_a_heartbeat_since_start(self):
        limit = supervisor.STALE_SECONDS
        self.assertFalse(supervisor.hung(10_000, 100, None))            # never ticked: unknown, not hung
        self.assertFalse(supervisor.hung(10_000, 100, 50))              # heartbeat from a previous process
        self.assertFalse(supervisor.hung(200 + limit, 100, 200))        # exactly at the limit
        self.assertTrue(supervisor.hung(201 + limit, 100, 200))
        self.assertTrue(supervisor.hung(130, 100, 105, limit=20))

    def test_heartbeat_reads_the_dispatcher_pid_and_gui_meta(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / 'health.json').write_text(json.dumps({'pid': 42, 'lastTickAt': 123.0}))
            self.assertEqual(supervisor.heartbeat(state, 'paseo_bot', 42), 123.0)
            self.assertIsNone(supervisor.heartbeat(state, 'paseo_bot', 43))
            self.assertIsNone(supervisor.heartbeat(state, 'gui_serve', 1))  # no database yet
            db = sqlite3.connect(state / 'queue.sqlite3')
            db.execute('CREATE TABLE gui_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)')
            db.execute("INSERT INTO gui_meta VALUES ('heartbeat', ?)", (json.dumps({'lastTickAt': 77.5}),))
            db.commit(); db.close()
            self.assertEqual(supervisor.heartbeat(state, 'gui_serve', 1), 77.5)

    def test_services_obey_their_own_stop_request_only(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/paseo-bot'))
        from paseo_bot import stop_requested
        with tempfile.TemporaryDirectory() as tmp:
            stop = Path(tmp) / 'paseo_bot.stop'
            self.assertFalse(stop_requested(tmp, 'paseo_bot'))
            stop.write_text('1')  # another process
            self.assertFalse(stop_requested(tmp, 'paseo_bot')); self.assertTrue(stop.exists())
            stop.write_text(str(supervisor.os.getpid()))
            self.assertTrue(stop_requested(tmp, 'paseo_bot')); self.assertFalse(stop.exists())


class TaskTests(unittest.TestCase):
    def xml(self, **kw):
        args = dict(user='HOST\\me', pythonw=r'C:\Py\pythonw.exe', script=r'C:\R&D\tools\paseo-bot\supervisor.py',
                    state=r'C:\Users\me\.config\paseo-bot', tool=r'C:\R&D\tools\paseo-bot', start_boundary='2026-01-01T00:00:00')
        args.update(kw)
        return ET.fromstring(supervisor.task_xml(**args).split('\n', 1)[1])

    def test_logon_task_never_overlaps_or_times_out(self):
        root = self.xml()
        self.assertEqual(root.find('.//t:MultipleInstancesPolicy', NS).text, 'IgnoreNew')
        self.assertEqual(root.find('.//t:ExecutionTimeLimit', NS).text, 'PT0S')
        self.assertEqual(root.find('.//t:LogonTrigger/t:UserId', NS).text, 'HOST\\me')
        self.assertEqual(root.find('.//t:Repetition/t:Interval', NS).text, 'PT1M')
        self.assertEqual(root.find('.//t:LogonType', NS).text, 'InteractiveToken')

    def test_action_is_windowless_and_paths_are_escaped(self):
        root = self.xml()
        self.assertTrue(root.find('.//t:Exec/t:Command', NS).text.lower().endswith('pythonw.exe'))
        args = root.find('.//t:Exec/t:Arguments', NS).text
        self.assertIn(r'"C:\R&D\tools\paseo-bot\supervisor.py" run --state', args)
        self.assertEqual(root.find('.//t:Exec/t:WorkingDirectory', NS).text, r'C:\R&D\tools\paseo-bot')

    def test_install_without_apply_only_describes(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(supervisor.subprocess, 'run') as run, \
                patch.dict(supervisor.os.environ, {'USERDOMAIN': 'HOST', 'USERNAME': 'me'}):
            args = type('A', (), dict(state=Path(tmp), tool=Path(tmp), pythonw=Path(tmp) / 'pythonw.exe',
                                      task_name='T', apply=False))()
            out = supervisor.install(args)
            self.assertFalse(out['applied']); self.assertIn('<LogonTrigger>', out['taskXml'])
            self.assertFalse(supervisor.uninstall(args)['applied'])
            run.assert_not_called()
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_mutex_is_scoped_to_the_state_directory(self):
        a, b = supervisor.mutex_name('/s/one'), supervisor.mutex_name('/s/two')
        self.assertNotEqual(a, b); self.assertTrue(a.startswith('Local\\PaseoBotSupervisor-'))


if __name__ == '__main__':
    unittest.main()
