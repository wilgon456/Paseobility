"""Supervisor backoff and Task Scheduler contracts; no task is registered and no process is started."""
from pathlib import Path
import sys
import json
import os
import plistlib
import sqlite3
import subprocess
import time
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
                patch.dict(supervisor.os.environ, {'USERDOMAIN': 'HOST', 'USERNAME': 'me'}), \
                patch.object(supervisor, 'service_file', return_value=Path(tmp) / 'unit'):
            args = type('A', (), dict(state=Path(tmp), tool=Path(tmp), python=Path(tmp) / 'python3',
                                      pythonw=Path(tmp) / 'pythonw.exe', task_name='T', apply=False))()
            out = supervisor.install(args)
            self.assertFalse(out['applied'])
            expected = {'win32': '<LogonTrigger>', 'darwin': '<key>KeepAlive</key>'}.get(sys.platform, 'Restart=always')
            self.assertIn(expected, out.get('taskXml') or out.get('content'))
            self.assertFalse(supervisor.uninstall(args)['applied'])
            run.assert_not_called()
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_mutex_is_scoped_to_the_state_directory(self):
        a, b = supervisor.mutex_name('/s/one'), supervisor.mutex_name('/s/two')
        self.assertNotEqual(a, b); self.assertTrue(a.startswith('Local\\PaseoBotSupervisor-'))


class StatusTests(unittest.TestCase):
    def test_status_survives_localized_tool_output(self):
        # sc.exe/schtasks print in the console code page; bytes that are not UTF-8 must not break status.
        fake = subprocess.CompletedProcess([], 0, stdout=supervisor.subprocess.run(
            [sys.executable, '-c', 'import sys; sys.stdout.buffer.write(bytes([0xc1, 0xa4]) + b"  : 4  RUNNING")'],
            capture_output=True, text=True, errors='replace').stdout, stderr='')
        self.assertIn('RUNNING', fake.stdout)
        with tempfile.TemporaryDirectory() as tmp, patch.object(supervisor, 'quiet_run', return_value=fake):
            args = type('A', (), dict(state=Path(tmp), task_name='T'))()
            out = supervisor.status(args)
        if os.name == 'nt':
            self.assertEqual(out['guardian'], 'running')

    @unittest.skipUnless(os.name == 'nt', 'Windows service tools')
    def test_status_runs_against_the_real_service_tools(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = subprocess.run([sys.executable, '-X', 'utf8', str(Path(supervisor.__file__)), 'status', '--state', tmp],
                               capture_output=True, text=True, encoding='utf-8', errors='replace')
        out = json.loads(r.stdout)
        self.assertTrue(out['ok'], r.stdout + r.stderr); self.assertIn(out['result']['guardian'], ('running', 'installed', 'absent'))


class ServiceManagerTests(unittest.TestCase):
    def test_launchd_agent_keeps_the_supervisor_alive_and_lets_services_survive(self):
        plist = plistlib.loads(supervisor.launchd_plist('/usr/bin/python3', '/opt/P B/supervisor.py', '/Users/me/.config/paseo-bot',
                                                         '/opt/P B', '/opt/homebrew/bin:/usr/bin'))
        self.assertEqual(plist['Label'], supervisor.LAUNCHD_LABEL)
        self.assertEqual(plist['ProgramArguments'], ['/usr/bin/python3', '-X', 'utf8', '/opt/P B/supervisor.py', 'run', '--state', '/Users/me/.config/paseo-bot'])
        self.assertTrue(plist['KeepAlive'] and plist['RunAtLoad'] and plist['AbandonProcessGroup'])
        self.assertEqual(plist['EnvironmentVariables']['PATH'], '/opt/homebrew/bin:/usr/bin')

    def test_systemd_unit_restarts_always_and_escapes_specifiers(self):
        unit = supervisor.systemd_unit('/usr/bin/python3', '/srv/100%/supervisor.py', '/home/me/.config/paseo-bot', '/srv/100%', '/usr/bin')
        self.assertIn('Restart=always', unit); self.assertIn('KillMode=process', unit)
        self.assertIn('ExecStart="/usr/bin/python3" "-X" "utf8" "/srv/100%%/supervisor.py" "run"', unit)
        self.assertIn('WorkingDirectory=/srv/100%%', unit)

    def test_posix_adoption_matches_only_the_service_command(self):
        listing = ' 12 /usr/bin/python3 -X utf8 /x/paseo_bot.py --state /s serve\n 13 vim /x/paseo_bot.py\n 14 python3 /x/paseo_bot.py --state /s tick\n'
        self.assertEqual(supervisor.matching_pids(listing, '/x/paseo_bot.py', exclude=99), [12])
        self.assertEqual(supervisor.matching_pids(listing, '/x/paseo_bot.py', exclude=12), [])

    def test_notification_text_is_data_not_script(self):
        text = '"; do shell script "touch /tmp/x"'
        command, _ = supervisor.notify_command('Paseo', text, 'darwin')
        self.assertEqual(command[-2:], ['Paseo', text])
        command, env = supervisor.notify_command('Paseo', text, 'win32')
        self.assertNotIn(text, ' '.join(command)); self.assertEqual(env['PASEO_BOT_TOAST_BODY'], text)


FAKE = """import json, os, sys, time
from pathlib import Path
state = Path(sys.argv[sys.argv.index('--state') + 1])
name = Path(sys.argv[0]).stem
hang = (state / ('hang-' + name)).exists()
while True:
    if name == 'paseo_bot':
        (state / 'health.json').write_text(json.dumps({'pid': os.getpid(), 'lastTickAt': time.time(), 'activeTasks': []}))
    if hang:
        time.sleep(3600)  # ticked once, then stopped responding
    stop = state / (name + '.stop')
    if stop.exists() and stop.read_text().strip() == str(os.getpid()):
        stop.unlink(); sys.exit(0)
    time.sleep(0.2)
"""


class SupervisorRunTests(unittest.TestCase):
    """Runs the real supervisor loop against fake services on this platform (Windows, macOS, Linux)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.tool, self.state = root / 'tool', root / 'state'
        self.tool.mkdir(); self.state.mkdir()
        for name in supervisor.SERVICES:
            (self.tool / (name + '.py')).write_text(FAKE, encoding='utf-8')
        command = [sys.executable, str(Path(supervisor.__file__)), 'run', '--tool', str(self.tool), '--state', str(self.state),
                   '--python', sys.executable, '--stale-seconds', '2', '--check-seconds', '1']
        self.proc = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **supervisor.QUIET)

    def tearDown(self):
        self.proc.kill(); self.proc.wait()
        for service in self.status().get('services', {}).values():
            if service.get('pid'):
                try:
                    os.kill(service['pid'], 9) if os.name != 'nt' else subprocess.run(['taskkill', '/F', '/PID', str(service['pid'])], capture_output=True)
                except OSError:
                    pass
        time.sleep(0.5)
        self.tmp.cleanup()

    def status(self):
        return supervisor.read_json(self.state / 'supervisor.json', {})

    def wait(self, predicate, seconds=40):
        deadline = time.time() + seconds
        while time.time() < deadline:
            value = predicate()
            if value:
                return value
            time.sleep(0.2)
        self.fail('condition not reached; log: ' + (self.state / 'supervisor.log').read_text(encoding='utf-8', errors='replace'))

    def pids(self):
        services = self.status().get('services', {})
        return {n: s.get('pid') for n, s in services.items()} if services and all(s.get('pid') for s in services.values()) else None

    def test_restart_after_exit_graceful_restart_request_and_hang(self):
        first = self.wait(self.pids)
        # A crash: the dispatcher disappears and comes back within seconds.
        os.kill(first['paseo_bot'], 9) if os.name != 'nt' else subprocess.run(['taskkill', '/F', '/PID', str(first['paseo_bot'])], capture_output=True)
        second = self.wait(lambda: (p := self.pids()) and p['paseo_bot'] != first['paseo_bot'] and p)
        self.assertEqual(second['gui_serve'], first['gui_serve'])
        # A requested restart: both stop on their own and it is not counted as a failure.
        (self.state / supervisor.RESTART_REQUEST).write_text('1')
        third = self.wait(lambda: (p := self.pids()) and all(p[n] != second[n] for n in p) and p)
        log = (self.state / 'supervisor.log').read_text(encoding='utf-8')
        self.assertNotIn('ignored the stop request', log)
        self.assertEqual(self.status()['services']['gui_serve']['failures'], 0)
        # A second supervisor for the same state directory exits at once.
        duplicate = subprocess.run([sys.executable, str(Path(supervisor.__file__)), 'run', '--tool', str(self.tool), '--state', str(self.state)],
                                   capture_output=True, timeout=30, **supervisor.QUIET)
        self.assertEqual(duplicate.returncode, 0)
        # A hang: the next dispatcher heartbeats once, then stops; the supervisor alerts and replaces it.
        (self.state / 'hang-paseo_bot').write_text('1')
        os.kill(third['paseo_bot'], 9) if os.name != 'nt' else subprocess.run(['taskkill', '/F', '/PID', str(third['paseo_bot'])], capture_output=True)
        self.wait(lambda: 'paseo_bot' in (self.status().get('alert') or {}) or None, seconds=60)


if __name__ == '__main__':
    unittest.main()
