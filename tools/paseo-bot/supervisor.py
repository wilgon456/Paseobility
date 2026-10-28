"""Opt-in resident supervisor for the bot runtime (dispatcher + GUI service) on Windows, macOS and Linux.

`run` stays resident and keeps `paseo_bot.py serve` and `gui_serve.py serve` alive:

- Exit: restarted about one second later. Exits shortly after a start count as
  consecutive failures and back off (1, 2, 4 ... 300 s); a long healthy run
  resets the count. A service that is already running is adopted, never duplicated.
- Hang: once a service has proven it ticks, a heartbeat older than
  `--stale-seconds` (default 900; longer than any single bot RPC) restarts it.
- Stop: a restart first asks the service to stop through `<state>/<name>.stop`
  and waits up to 30 s, so a write is never cut in half; only then is it killed.
- Alert: five consecutive fast failures or a hang raise an alert in
  `supervisor.json` (the GUI projection reports the host as unhealthy) and a
  desktop notification.

The operating system's own service manager keeps the supervisor itself alive:

- macOS: a per-user launchd agent with KeepAlive (`install`; no admin rights).
- Linux: a systemd user service with Restart=always (`install`).
- Windows: the PaseoBotGuardian service (`guardian/`, one UAC consent) or, without
  admin rights, a logon task that repeats every minute (`install`).

On Windows run it with pythonw.exe: the services are console python.exe processes
created with CREATE_NO_WINDOW, so they and their children (node, git, the Paseo
CLI) never flash a console window, even with Windows Terminal as the default.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
from xml.sax.saxutils import escape

SERVICES = ('paseo_bot', 'gui_serve')
HEALTHY_SECONDS = 300
MAX_DELAY = 300
POLL_SECONDS = 1.0
STALE_SECONDS = 900
HEARTBEAT_CHECK_SECONDS = 30
STOP_GRACE_SECONDS = 30
ALERT_FAILURES = 5
STATUS_REFRESH_SECONDS = 60
LOG_LIMIT = 1_000_000
TASK_NAME = 'PaseoBotSupervisor'
LAUNCHD_LABEL = 'com.paseobility.paseo-bot-supervisor'
SYSTEMD_UNIT = 'paseo-bot-supervisor.service'
RESTART_REQUEST = 'supervisor.restart'
CREATE_NO_WINDOW = 0x08000000
SYNCHRONIZE, QUERY_LIMITED, TERMINATE = 0x00100000, 0x1000, 0x0001
ERROR_ALREADY_EXISTS = 183
QUIET = dict(creationflags=CREATE_NO_WINDOW) if os.name == 'nt' else {}


def next_delay(failures):
    """Seconds to wait before restart number `failures` (1-based)."""
    return min(MAX_DELAY, 2 ** max(0, failures - 1))


class Backoff:
    def __init__(self):
        self.failures = 0
        self.started = None

    def start(self, now):
        self.started = now

    def exited(self, now, counts=True):
        """Record an exit and return the delay before the next start."""
        if not counts or (self.started is not None and now - self.started >= HEALTHY_SECONDS):
            self.failures = 0
        self.started = None
        if not counts:
            return 1
        self.failures += 1
        return next_delay(self.failures)


def hung(now, started, last_tick, limit=STALE_SECONDS):
    """A service is hung only after it proved it ticks (a heartbeat since its start) and then went quiet."""
    return last_tick is not None and last_tick >= started and now - last_tick > limit


def default_paths():
    tool = Path(__file__).resolve().parent
    exe = Path(sys.executable)
    if os.name == 'nt':
        python = exe.with_name('python.exe') if exe.name.lower() == 'pythonw.exe' else exe
        pythonw = exe.with_name('pythonw.exe')
    else:
        python = pythonw = exe
    return dict(tool=tool, state=Path.home() / '.config' / 'paseo-bot', python=python, pythonw=pythonw)


def run_arguments(python, script, state):
    return [str(python), '-X', 'utf8', str(script), 'run', '--state', str(state)]


def task_xml(user, pythonw, script, state, tool, start_boundary):
    """Windows logon task for one user; the repeating trigger only revives a dead supervisor."""
    command = '-X utf8 "%s" run --state "%s"' % (script, state)
    return f'''<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Paseo bot resident supervisor (no console). Restarts the dispatcher and GUI service within seconds with crash-loop backoff and hang detection. The repeating trigger starts nothing while the supervisor runs. Remove with: paseo-bot.ps1 supervise uninstall -Apply</Description>
  </RegistrationInfo>
  <Principals>
    <Principal id="Author">
      <UserId>{escape(user)}</UserId>
      <LogonType>InteractiveToken</LogonType>
    </Principal>
  </Principals>
  <Settings>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <StartWhenAvailable>true</StartWhenAvailable>
  </Settings>
  <Triggers>
    <LogonTrigger>
      <UserId>{escape(user)}</UserId>
    </LogonTrigger>
    <TimeTrigger>
      <StartBoundary>{escape(start_boundary)}</StartBoundary>
      <Repetition>
        <Interval>PT1M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </TimeTrigger>
  </Triggers>
  <Actions Context="Author">
    <Exec>
      <Command>{escape(str(pythonw))}</Command>
      <Arguments>{escape(command)}</Arguments>
      <WorkingDirectory>{escape(str(tool))}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
'''


def launchd_plist(python, script, state, tool, path_env):
    """macOS per-user agent: launchd restarts the supervisor whenever it exits, from login on."""
    return plistlib.dumps({
        'Label': LAUNCHD_LABEL,
        'ProgramArguments': run_arguments(python, script, state),
        'WorkingDirectory': str(tool),
        'RunAtLoad': True,
        'KeepAlive': True,
        'ThrottleInterval': 5,
        # The services run in their own sessions and must survive a supervisor restart.
        'AbandonProcessGroup': True,
        'EnvironmentVariables': {'PATH': path_env, 'PYTHONIOENCODING': 'utf-8'},
        'StandardOutPath': str(Path(state) / 'supervisor.launchd.log'),
        'StandardErrorPath': str(Path(state) / 'supervisor.launchd.log'),
    })


def systemd_unit(python, script, state, tool, path_env):
    """Linux user service: systemd restarts the supervisor; the services outlive its restarts."""
    def literal(value):  # systemd expands % specifiers and splits on spaces
        return str(value).replace('%', '%%').replace('"', '\\"')
    quoted = ' '.join('"%s"' % literal(a) for a in run_arguments(python, script, state))
    tool, path_env = literal(tool), literal(path_env)
    return f'''[Unit]
Description=Paseo bot resident supervisor
After=network-online.target

[Service]
Type=simple
WorkingDirectory={tool}
Environment="PATH={path_env}" "PYTHONIOENCODING=utf-8"
ExecStart={quoted}
Restart=always
RestartSec=2
KillMode=process

[Install]
WantedBy=default.target
'''


def mutex_name(state):
    digest = hashlib.sha256(os.path.normcase(os.path.abspath(state)).encode()).hexdigest()[:16]
    return 'Local\\PaseoBotSupervisor-' + digest


class Log:
    def __init__(self, path):
        self.path = path

    def __call__(self, text):
        try:
            if self.path.exists() and self.path.stat().st_size > LOG_LIMIT:
                os.replace(self.path, self.path.with_name(self.path.name + '.1'))
            with open(self.path, 'a', encoding='utf-8') as f:
                f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + text + '\n')
        except OSError:
            pass


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return default


def heartbeat(state, name, pid):
    """Last tick time written by the running service, or None when unknown."""
    if name == 'paseo_bot':
        health = read_json(state / 'health.json', {})
        return health.get('lastTickAt') if health.get('pid') == pid else None
    try:
        db = sqlite3.connect(f'file:{state / "queue.sqlite3"}?mode=ro', uri=True, timeout=2)
        try:
            row = db.execute("SELECT value FROM gui_meta WHERE key='heartbeat'").fetchone()
        finally:
            db.close()
        return json.loads(row[0]).get('lastTickAt') if row else None
    except (sqlite3.Error, ValueError, TypeError):
        return None


TOAST = r'''
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$n = $t.GetElementsByTagName('text')
$n.Item(0).AppendChild($t.CreateTextNode($env:PASEO_BOT_TOAST_TITLE)) > $null
$n.Item(1).AppendChild($t.CreateTextNode($env:PASEO_BOT_TOAST_BODY)) > $null
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($t))
'''
OSASCRIPT = ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run']


def notify_command(title, body, platform=sys.platform):
    """Command and environment for a desktop notification; text travels as data, never as script."""
    if platform == 'win32':
        return (['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', TOAST],
                dict(os.environ, PASEO_BOT_TOAST_TITLE=title, PASEO_BOT_TOAST_BODY=body))
    if platform == 'darwin':
        return ['osascript', *OSASCRIPT, title, body], None
    if shutil.which('notify-send'):
        return ['notify-send', title, body], None
    return None, None


def notify(title, body):
    """Best-effort desktop notification; never blocks supervision."""
    command, env = notify_command(title, body)
    if not command:
        return
    try:
        subprocess.Popen(command, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, **QUIET)
    except OSError:
        pass


class Win32:
    """Process access through kernel32/ntdll."""

    def __init__(self):
        import ctypes
        import ctypes.wintypes as w
        self.c, self.w = ctypes, w
        self.k32 = ctypes.WinDLL('kernel32', use_last_error=True)
        self.ntdll = ctypes.WinDLL('ntdll')
        for name in ('CreateMutexW', 'OpenProcess', 'CreateToolhelp32Snapshot'):
            getattr(self.k32, name).restype = w.HANDLE

        class Entry(ctypes.Structure):
            _fields_ = [('dwSize', w.DWORD), ('cntUsage', w.DWORD), ('th32ProcessID', w.DWORD),
                        ('th32DefaultHeapID', ctypes.c_void_p), ('th32ModuleID', w.DWORD),
                        ('cntThreads', w.DWORD), ('th32ParentProcessID', w.DWORD),
                        ('pcPriClassBase', ctypes.c_long), ('dwFlags', w.DWORD), ('szExeFile', w.WCHAR * 260)]

        class Text(ctypes.Structure):
            _fields_ = [('Length', w.USHORT), ('MaximumLength', w.USHORT), ('Buffer', ctypes.c_void_p)]
        self.Entry, self.Text = Entry, Text

    def own_lock(self, state):
        handle = self.k32.CreateMutexW(None, True, mutex_name(state))
        return bool(handle) and self.c.get_last_error() != ERROR_ALREADY_EXISTS

    def spawn_options(self):
        return dict(creationflags=CREATE_NO_WINDOW)

    def child(self, proc):
        return self.open(proc.pid)

    def open(self, pid, access=SYNCHRONIZE | QUERY_LIMITED):
        return self.k32.OpenProcess(access, False, pid)

    def exited(self, handle, wait_ms=0):
        return self.k32.WaitForSingleObject(handle, wait_ms) == 0

    def exit_code(self, handle):
        code = self.w.DWORD()
        return code.value if self.k32.GetExitCodeProcess(handle, self.c.byref(code)) else None

    def close(self, handle):
        self.k32.CloseHandle(handle)

    def terminate(self, pid):
        handle = self.open(pid, TERMINATE)
        if handle:
            self.k32.TerminateProcess(handle, 1)
            self.close(handle)

    def command_line(self, handle):
        size = self.w.ULONG(0)
        self.ntdll.NtQueryInformationProcess(handle, 60, None, 0, self.c.byref(size))  # ProcessCommandLineInformation
        if not size.value:
            return ''
        buf = self.c.create_string_buffer(size.value)
        if self.ntdll.NtQueryInformationProcess(handle, 60, buf, size, self.c.byref(size)) != 0:
            return ''
        text = self.Text.from_buffer(buf)
        return self.c.wstring_at(text.Buffer, text.Length // 2) if text.Buffer else ''

    def find(self, script):
        """(pid, handle) of a live python.exe whose command line names script."""
        snap = self.k32.CreateToolhelp32Snapshot(2, 0)
        entry = self.Entry(); entry.dwSize = self.c.sizeof(self.Entry)
        pids, ok = [], self.k32.Process32FirstW(snap, self.c.byref(entry))
        while ok:
            if entry.szExeFile.lower() == 'python.exe':
                pids.append(entry.th32ProcessID)
            ok = self.k32.Process32NextW(snap, self.c.byref(entry))
        self.close(snap)
        needle = os.path.normcase(str(script))
        for pid in pids:
            handle = self.open(pid)
            if not handle:
                continue
            if needle in os.path.normcase(self.command_line(handle)) and not self.exited(handle):
                return pid, handle
            self.close(handle)
        return None


def matching_pids(ps_output, script, exclude):
    """PIDs from `ps -o pid=,command=` lines whose command runs `script ... serve`."""
    out = []
    for line in ps_output.splitlines():
        pid, _, command = line.strip().partition(' ')
        if pid.isdigit() and int(pid) != exclude and str(script) in command and command.rstrip().endswith(' serve'):
            out.append(int(pid))
    return out


class Posix:
    """Process access on macOS and Linux. A handle is the Popen we started or the PID we adopted."""

    def own_lock(self, state):
        import fcntl
        self.lock = open(Path(state) / 'supervisor.lock', 'a+')
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except OSError:
            return False

    def spawn_options(self):
        # Own session: the services survive a supervisor restart and are adopted again.
        return dict(start_new_session=True)

    def child(self, proc):
        return proc

    def alive(self, handle):
        if isinstance(handle, subprocess.Popen):
            return handle.poll() is None
        try:
            os.kill(handle, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True

    def exited(self, handle, wait_ms=0):
        deadline = time.monotonic() + wait_ms / 1000
        while self.alive(handle):
            if time.monotonic() >= deadline:
                return False
            time.sleep(0.1)
        return True

    def exit_code(self, handle):
        return handle.returncode if isinstance(handle, subprocess.Popen) else None

    def close(self, handle):
        pass

    def terminate(self, pid):
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    def find(self, script):
        listing = subprocess.run(['ps', 'axww', '-o', 'pid=,command='], capture_output=True, text=True).stdout  # BSD form: macOS and procps
        pids = matching_pids(listing, script, os.getpid())
        return (pids[0], pids[0]) if pids else None


def platform_ops():
    return Win32() if os.name == 'nt' else Posix()


class Service:
    def __init__(self, name, args, ops, log, alert):
        self.name, self.args, self.ops, self.log, self.alert = name, args, ops, log, alert
        self.script = args.tool / (name + '.py')
        self.pid = self.handle = self.proc = None
        self.backoff = Backoff()
        self.next_start = 0.0
        self.started_wall = 0.0
        self.next_check = 0.0
        self.last_exit = None
        self.restarts = 0
        self.alerted = False

    def ensure(self, now):
        if self.handle is not None or now < self.next_start:
            return
        found = self.ops.find(self.script)
        if found:
            self.pid, self.handle = found
            self.mark_started(now)
            self.log(f'{self.name}: adopted running pid {self.pid}')
            return
        state = self.args.state
        (state / (self.name + '.stop')).unlink(missing_ok=True)
        try:
            with open(state / (self.name + '.out.log'), 'ab') as out, open(state / (self.name + '.err.log'), 'ab') as err:
                self.proc = subprocess.Popen(
                    [str(self.args.python), '-X', 'utf8', str(self.script), '--state', str(state), 'serve'],
                    cwd=str(self.args.tool), stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                    **self.ops.spawn_options())
        except OSError as e:
            self.exited(now, 'launch failed: ' + type(e).__name__)
            return
        self.pid = self.proc.pid
        self.handle = self.ops.child(self.proc)
        self.mark_started(now)
        self.log(f'{self.name}: started pid {self.pid}')

    def mark_started(self, now):
        self.backoff.start(now)
        self.started_wall = time.time()
        self.next_check = now + self.args.check_seconds

    def check(self, now):
        if self.handle is None:
            return
        if not self.ops.exited(self.handle):
            if self.alerted and self.backoff.started is not None and now - self.backoff.started >= HEALTHY_SECONDS:
                self.alerted = False
                self.alert(self.name, None)
                self.log(f'{self.name}: healthy again; alert cleared')
            if now >= self.next_check:
                self.next_check = now + self.args.check_seconds
                last = heartbeat(self.args.state, self.name, self.pid)
                if hung(time.time(), self.started_wall, last, self.args.stale_seconds):
                    reason = f'no heartbeat for {round(time.time() - last)}s'
                    self.log(f'{self.name}: pid {self.pid} looks hung ({reason}); restarting')
                    self.raise_alert(f'{self.name} stopped responding ({reason}) and was restarted.')
                    self.stop(now, 'hung: ' + reason, counts=True)
            return
        self.reap(now, f'pid {self.pid} exited with code {self.ops.exit_code(self.handle)}', counts=True)

    def stop(self, now, why, counts):
        """Ask the service to stop, wait for it, kill it only if it does not comply."""
        if self.handle is None:
            return
        try:
            (self.args.state / (self.name + '.stop')).write_text(str(self.pid), encoding='utf-8')
        except OSError:
            pass
        if not self.ops.exited(self.handle, STOP_GRACE_SECONDS * 1000):
            self.log(f'{self.name}: pid {self.pid} ignored the stop request; terminating')
            self.ops.terminate(self.pid)
            self.ops.exited(self.handle, 5000)
        self.reap(time.monotonic(), why, counts)

    def reap(self, now, why, counts):
        self.ops.close(self.handle)
        self.handle = None
        if self.proc is not None:
            self.proc.poll()
            self.proc = None
        (self.args.state / (self.name + '.stop')).unlink(missing_ok=True)
        self.exited(now, why, counts)

    def exited(self, now, why, counts=True):
        delay = self.backoff.exited(now, counts)
        self.next_start = now + delay
        self.last_exit = dict(at=time.time(), reason=why)
        self.restarts += 1
        self.log(f'{self.name}: {why}; restart in {delay}s (consecutive failures {self.backoff.failures})')
        if self.backoff.failures >= ALERT_FAILURES and not self.alerted:
            self.raise_alert(f'{self.name} keeps exiting ({self.backoff.failures} times in a row). See supervisor.log and {self.name}.err.log.')

    def raise_alert(self, text):
        self.alerted = True
        self.alert(self.name, text)

    def snapshot(self, now):
        return dict(pid=self.pid if self.handle is not None else None,
                    state='running' if self.handle is not None else 'waiting',
                    failures=self.backoff.failures, restarts=self.restarts,
                    restartInSeconds=0 if self.handle is not None else max(0, round(self.next_start - now)),
                    lastExit=self.last_exit)


def write_status(path, data):
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(data, sort_keys=True), encoding='utf-8')
    os.replace(tmp, path)


def run(args):
    ops = platform_ops()
    log = Log(args.state / 'supervisor.log')
    if not ops.own_lock(args.state):
        log('another supervisor owns this state directory; exiting')
        return 0
    alerts = {}

    def alert(name, text):
        if text is None:
            alerts.pop(name, None)
            return
        alerts[name] = dict(text=text, at=time.time())
        log(f'{name}: ALERT {text}')
        notify('Paseo 봇 확인 필요', text)

    services = [Service(name, args, ops, log, alert) for name in SERVICES]
    log(f'supervisor started pid {os.getpid()}')
    last, written = None, 0.0
    while True:
        now = time.monotonic()
        request = args.state / RESTART_REQUEST
        if request.exists():
            request.unlink(missing_ok=True)
            log('restart requested; stopping services at this idle boundary')
            for service in services:
                service.stop(now, 'restart requested', counts=False)
        for service in services:
            try:
                service.check(now)
                service.ensure(now)
            except Exception as e:  # keep supervising the other service
                log(f'{service.name}: supervisor error {type(e).__name__}: {e}')
        status = dict(pid=os.getpid(), alert=dict(alerts) or None, services={s.name: s.snapshot(now) for s in services})
        if status != last or now - written >= STATUS_REFRESH_SECONDS:
            try:
                write_status(args.state / 'supervisor.json', dict(status, updatedAt=time.time()))
                last, written = status, now
            except OSError:
                pass
        time.sleep(POLL_SECONDS)


# ---- install / uninstall / status, per operating system -------------------------------


def current_user():
    domain, user = os.environ.get('USERDOMAIN', ''), os.environ.get('USERNAME', '')
    if not user:
        raise ValueError('USERNAME unavailable')
    return domain + '\\' + user if domain else user


def quiet_run(command, check=False):
    return subprocess.run(command, capture_output=True, text=True, check=check, **QUIET)


def service_file(platform=sys.platform):
    if platform == 'darwin':
        return Path.home() / 'Library/LaunchAgents' / (LAUNCHD_LABEL + '.plist')
    return Path(os.environ.get('XDG_CONFIG_HOME') or Path.home() / '.config') / 'systemd/user' / SYSTEMD_UNIT


def install(args):
    script = Path(__file__).resolve()
    if os.name == 'nt':
        xml = task_xml(current_user(), args.pythonw, script, args.state, args.tool, time.strftime('%Y-%m-%dT%H:%M:%S'))
        plan = dict(kind='windows-logon-task', taskName=args.task_name,
                    action=f'{args.pythonw} -X utf8 {script} run',
                    triggers=['at logon', 'every minute (starts nothing while the supervisor runs)'],
                    recommended='supervise install-service -Apply: the PaseoBotGuardian Windows service', applied=False)
        if not args.apply:
            return dict(plan, taskXml=xml, next='Re-run with -Apply (PowerShell) or --apply to register.')
        if not Path(args.pythonw).is_file():
            raise ValueError('pythonw.exe not found next to this Python')
        path = args.state / 'supervisor-task.xml'
        path.write_text(xml, encoding='utf-16')
        try:
            quiet_run(['schtasks', '/Create', '/TN', args.task_name, '/XML', str(path), '/F'], check=True)
            quiet_run(['schtasks', '/Run', '/TN', args.task_name], check=True)
        finally:
            path.unlink(missing_ok=True)
        return dict(plan, applied=True)

    path_env = os.environ.get('PATH', '/usr/bin:/bin')
    target = service_file()
    if sys.platform == 'darwin':
        content = launchd_plist(args.python, script, args.state, args.tool, path_env).decode('utf-8')
        plan = dict(kind='launchd-agent', file=str(target), label=LAUNCHD_LABEL, keepAlive=True, applied=False)
    else:
        content = systemd_unit(args.python, script, args.state, args.tool, path_env)
        plan = dict(kind='systemd-user-service', file=str(target), unit=SYSTEMD_UNIT, restart='always', applied=False,
                    note='Run `loginctl enable-linger` once to keep it running without an open session.')
    if not args.apply:
        return dict(plan, content=content, next='Re-run with --apply to install and start it.')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')
    if sys.platform == 'darwin':
        domain = f'gui/{os.getuid()}'
        quiet_run(['launchctl', 'bootout', f'{domain}/{LAUNCHD_LABEL}'])
        if quiet_run(['launchctl', 'bootstrap', domain, str(target)]).returncode != 0:
            quiet_run(['launchctl', 'load', '-w', str(target)], check=True)  # sessions without a GUI domain
    else:
        quiet_run(['systemctl', '--user', 'daemon-reload'], check=True)
        quiet_run(['systemctl', '--user', 'enable', '--now', SYSTEMD_UNIT], check=True)
    return dict(plan, applied=True)


def uninstall(args):
    if os.name == 'nt':
        plan = dict(taskName=args.task_name, stops='the supervisor process only; running services keep running', applied=False)
        if not args.apply:
            return dict(plan, next='Re-run with -Apply (PowerShell) or --apply to remove.')
        quiet_run(['schtasks', '/End', '/TN', args.task_name])
        quiet_run(['schtasks', '/Delete', '/TN', args.task_name, '/F'], check=True)
        return dict(plan, applied=True)
    target = service_file()
    plan = dict(file=str(target), stops='the supervisor process only; running services keep running', applied=False)
    if not args.apply:
        return dict(plan, next='Re-run with --apply to remove.')
    if sys.platform == 'darwin':
        if quiet_run(['launchctl', 'bootout', f'gui/{os.getuid()}/{LAUNCHD_LABEL}']).returncode != 0:
            quiet_run(['launchctl', 'unload', str(target)])
    else:
        quiet_run(['systemctl', '--user', 'disable', '--now', SYSTEMD_UNIT])
    target.unlink(missing_ok=True)
    if sys.platform != 'darwin':
        quiet_run(['systemctl', '--user', 'daemon-reload'])
    return dict(plan, applied=True)


def status(args):
    out = dict(supervisor=read_json(args.state / 'supervisor.json', None))
    if os.name == 'nt':
        guardian = quiet_run(['sc.exe', 'query', 'PaseoBotGuardian'])
        out.update(taskName=args.task_name,
                   registered=quiet_run(['schtasks', '/Query', '/TN', args.task_name]).returncode == 0,
                   guardian='running' if 'RUNNING' in guardian.stdout else 'installed' if guardian.returncode == 0 else 'absent')
    elif sys.platform == 'darwin':
        out.update(file=str(service_file()), installed=service_file().exists(),
                   loaded=quiet_run(['launchctl', 'print', f'gui/{os.getuid()}/{LAUNCHD_LABEL}']).returncode == 0)
    else:
        out.update(file=str(service_file()), installed=service_file().exists(),
                   active=quiet_run(['systemctl', '--user', 'is-active', SYSTEMD_UNIT]).stdout.strip())
    return out


def idle(state):
    """True when the dispatcher has no active task and no GUI request is in flight."""
    health = read_json(state / 'health.json', {})
    if health.get('activeTasks') or health.get('activeTask'):
        return False
    db = sqlite3.connect(f'file:{state / "queue.sqlite3"}?mode=ro', uri=True)
    try:
        return not db.execute("SELECT 1 FROM gui_jobs WHERE state IN ('prepared','waiting') LIMIT 1").fetchone()
    except sqlite3.OperationalError:
        return True  # no GUI tables yet
    finally:
        db.close()


def restart(args):
    """Ask the resident supervisor to restart both services at an idle boundary (e.g. after a code update)."""
    before = read_json(args.state / 'supervisor.json', None)
    if not before:
        raise ValueError('Supervisor status unavailable')
    deadline = time.time() + args.timeout
    while not idle(args.state):
        if time.time() > deadline:
            return dict(restarted=False, reason='busy')
        time.sleep(5)
    (args.state / RESTART_REQUEST).write_text('1', encoding='utf-8')
    old = {n: s.get('pid') for n, s in before['services'].items()}
    deadline = time.time() + STOP_GRACE_SECONDS * 2 + 30
    while time.time() < deadline:
        now = read_json(args.state / 'supervisor.json', {}).get('services', {})
        if now and all(s.get('pid') and s.get('pid') != old.get(n) for n, s in now.items()):
            return dict(restarted=True, pids={n: s['pid'] for n, s in now.items()})
        time.sleep(1)
    return dict(restarted=False, reason='supervisor did not confirm new processes')


def main():
    paths = default_paths()
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument('command', choices=['run', 'install', 'uninstall', 'status', 'restart'])
    p.add_argument('--state', type=Path, default=paths['state'])
    p.add_argument('--tool', type=Path, default=paths['tool'])
    p.add_argument('--python', type=Path, default=paths['python'], help='interpreter for the services')
    p.add_argument('--pythonw', type=Path, default=paths['pythonw'], help='Windows: windowless interpreter for the task')
    p.add_argument('--task-name', default=TASK_NAME)
    p.add_argument('--stale-seconds', type=int, default=STALE_SECONDS, help='run: heartbeat age that counts as hung')
    p.add_argument('--check-seconds', type=int, default=HEARTBEAT_CHECK_SECONDS, help=argparse.SUPPRESS)
    p.add_argument('--apply', action='store_true', help='install/uninstall: actually change the system')
    p.add_argument('--timeout', type=int, default=1800, help='restart: seconds to wait for an idle boundary')
    args = p.parse_args()
    if args.command == 'run':
        return run(args)
    try:
        out = dict(install=install, uninstall=uninstall, status=status, restart=restart)[args.command](args)
        print(json.dumps({'ok': True, 'result': out}, ensure_ascii=False))
        return 0
    except (OSError, ValueError, subprocess.SubprocessError, sqlite3.Error) as e:
        print(json.dumps({'ok': False, 'error': 'Supervisor ' + args.command + ' failed: ' + type(e).__name__}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
