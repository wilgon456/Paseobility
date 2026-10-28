"""Supervisor backoff and Task Scheduler contracts; no task is registered and no process is started."""
from pathlib import Path
import sys
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

    def test_failed_launch_counts_as_failure(self):
        b = supervisor.Backoff()
        self.assertEqual((b.exited(0), b.exited(1)), (1, 2))


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
        self.assertEqual(root.find('.//t:Repetition/t:Interval', NS).text, 'PT5M')
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
