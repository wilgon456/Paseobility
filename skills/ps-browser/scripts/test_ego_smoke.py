"""No GUI: check interruption boundaries and portable script transport."""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('ego_smoke', Path(__file__).with_name('ego-smoke.py'))
SMOKE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SMOKE)


class SmokeSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name) / "한글 path's report"
        self.runner = SMOKE.EgoSmoke(self.output, 'fixture-ego')
        self.runner.state_path.write_text(json.dumps({'spaceId': 17}), encoding='utf-8')

    def test_existing_artifacts_are_never_replayed_or_overwritten(self):
        with self.assertRaises(FileExistsError):
            SMOKE.EgoSmoke(self.output, 'fixture-ego')
        self.assertEqual(json.loads(self.runner.state_path.read_text())['spaceId'], 17)

    def test_unicode_code_stays_in_fresh_utf8_files(self):
        with patch.object(SMOKE.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '', '')) as run:
            self.runner.run('console.log("한글");')
            self.runner.run('console.log("next");')
        commands = [call.args[0] for call in run.call_args_list]
        self.assertNotEqual(commands[0][-1], commands[1][-1])
        for command in commands:
            command[-1].encode('ascii')
            self.assertEqual(command[1:3], ['nodejs', '-e'])
        self.assertIn('한글', (self.output / 'round-01.mjs').read_text(encoding='utf-8'))

    def test_unexpected_failure_stops_without_retry_or_cleanup(self):
        with patch.object(SMOKE.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'control unavailable')) as run:
            with self.assertRaises(RuntimeError):
                self.runner.exercise('http://127.0.0.1:1/index.html')
        self.assertEqual(run.call_count, 1)
        self.assertEqual(self.runner.report['status'], 'failed')
        self.assertTrue(json.loads(self.runner.state_path.read_text())['name'].startswith('paseobility-smoke-'))

    def test_timeout_preserves_known_space_without_retry(self):
        with patch.object(SMOKE.subprocess, 'run', side_effect=subprocess.TimeoutExpired('fixture-ego', 45)) as run:
            with self.assertRaises(RuntimeError):
                self.runner.run('throw Error("unreached");')
        self.assertEqual(run.call_count, 1)
        self.assertEqual(self.runner.report['status'], 'interrupted')
        self.assertEqual(self.runner.report['spaceId'], 17)

    def test_only_the_injected_error_allows_recovery(self):
        with patch.object(SMOKE.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'user control required')):
            with self.assertRaises(RuntimeError):
                self.runner.run('unused', expected_failure=True)
        with patch.object(SMOKE.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'PASEOBILITY_INJECTED_INTERRUPTION')):
            self.runner.run('unused', expected_failure=True)

    def test_incomplete_guide_stops_before_browser_rounds(self):
        out = Path(self.temp.name) / 'guide-test'
        with patch.object(SMOKE.shutil, 'which', return_value='fixture-ego'), patch.object(
                SMOKE.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, 'truncated guide', '')) as run, patch('sys.stdout', new=io.StringIO()):
            self.assertEqual(SMOKE.main(['--live', '--out', str(out)]), 1)
        self.assertEqual(run.call_count, 1)
        self.assertFalse((out / 'state.json').exists())
        self.assertEqual(json.loads((out / 'report.json').read_text())['reason'], 'incomplete-runtime-guide')

    def test_guide_timeout_records_failure_without_browser(self):
        out = Path(self.temp.name) / 'guide-timeout'
        with patch.object(SMOKE.shutil, 'which', return_value='fixture-ego'), patch.object(
                SMOKE.subprocess, 'run', side_effect=subprocess.TimeoutExpired('fixture-ego', 30)) as run, patch('sys.stdout', new=io.StringIO()):
            self.assertEqual(SMOKE.main(['--live', '--out', str(out)]), 1)
        self.assertEqual(run.call_count, 1)
        self.assertFalse((out / 'state.json').exists())

    def test_live_is_explicit(self):
        out = Path(self.temp.name) / 'must-not-exist'
        with patch.object(SMOKE.subprocess, 'run') as run, patch('sys.stderr', new=io.StringIO()), self.assertRaises(SystemExit):
            SMOKE.main(['--out', str(out)])
        run.assert_not_called()
        self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
