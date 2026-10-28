"""Opt-in resident supervisor for the Windows bot runtime (dispatcher + GUI service).

`run` stays resident and restarts `paseo_bot.py serve` / `gui_serve.py serve`
about one second after either exits. Exits shortly after a start count as
consecutive failures and back off (1, 2, 4 ... 300 s); a long healthy run resets
the count. A service that is already running is adopted, never duplicated.

Run it with pythonw.exe: it has no console, and the services are console
python.exe processes created with CREATE_NO_WINDOW, so their own children (node,
git, the Paseo CLI) inherit an invisible console. Nothing flashes on screen even
when Windows Terminal is the default terminal.

`install` prints the logon task it would register and changes nothing unless
`--apply` is given. Task Scheduler does not relaunch an action that exited
abnormally, so the task also repeats every five minutes; with IgnoreNew that
trigger starts nothing while the supervisor is alive and only revives a dead one.
macOS and Linux should use launchd KeepAlive or systemd Restart=on-failure.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from xml.sax.saxutils import escape

SERVICES = ('paseo_bot', 'gui_serve')
HEALTHY_SECONDS = 300
MAX_DELAY = 300
POLL_SECONDS = 1.0
LOG_LIMIT = 1_000_000
TASK_NAME = 'PaseoBotSupervisor'
CREATE_NO_WINDOW = 0x08000000
SYNCHRONIZE, QUERY_LIMITED, TERMINATE = 0x00100000, 0x1000, 0x0001
ERROR_ALREADY_EXISTS = 183


def next_delay(failures):
    """Seconds to wait before restart number `failures` (1-based)."""
    return min(MAX_DELAY, 2 ** max(0, failures - 1))


class Backoff:
    def __init__(self):
        self.failures = 0
        self.started = None

    def start(self, now):
        self.started = now

    def exited(self, now):
        """Record an exit and return the delay before the next start."""
        if self.started is not None and now - self.started >= HEALTHY_SECONDS:
            self.failures = 0
        self.started = None
        self.failures += 1
        return next_delay(self.failures)


def default_paths():
    tool = Path(__file__).resolve().parent
    exe = Path(sys.executable)
    python = exe.with_name('python.exe') if exe.name.lower() == 'pythonw.exe' else exe
    return dict(tool=tool, state=Path.home() / '.config' / 'paseo-bot', python=python,
                pythonw=exe.with_name('pythonw.exe') if os.name == 'nt' else exe)


def task_xml(user, pythonw, script, state, tool, start_boundary):
    """Logon task for one user; the repeating trigger only revives a dead supervisor."""
    command = '-X utf8 "%s" run --state "%s"' % (script, state)
    return f'''<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Paseo bot resident supervisor (no console). Restarts the dispatcher and GUI service within seconds with crash-loop backoff. The repeating trigger starts nothing while the supervisor runs. Remove with: paseo-bot.ps1 supervise uninstall -Apply</Description>
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
        <Interval>PT5M</Interval>
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


class Win32:
    """Minimal process access through kernel32/ntdll; Windows only."""

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

    def own_mutex(self, name):
        handle = self.k32.CreateMutexW(None, True, name)
        return handle if handle and self.c.get_last_error() != ERROR_ALREADY_EXISTS else None

    def open(self, pid, access=SYNCHRONIZE | QUERY_LIMITED):
        return self.k32.OpenProcess(access, False, pid)

    def exited(self, handle):
        return self.k32.WaitForSingleObject(handle, 0) == 0

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


class Service:
    def __init__(self, name, args, win, log):
        self.name, self.args, self.win, self.log = name, args, win, log
        self.script = args.tool / (name + '.py')
        self.pid = self.handle = self.proc = None
        self.backoff = Backoff()
        self.next_start = 0.0
        self.last_exit = None

    def ensure(self, now):
        if self.handle is not None or now < self.next_start:
            return
        found = self.win.find(self.script)
        if found:
            self.pid, self.handle = found
            self.backoff.start(now)
            self.log(f'{self.name}: adopted running pid {self.pid}')
            return
        state = self.args.state
        try:
            with open(state / (self.name + '.out.log'), 'ab') as out, open(state / (self.name + '.err.log'), 'ab') as err:
                self.proc = subprocess.Popen(
                    [str(self.args.python), '-X', 'utf8', str(self.script), '--state', str(state), 'serve'],
                    cwd=str(self.args.tool), stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                    creationflags=CREATE_NO_WINDOW)
        except OSError as e:
            self.exited(now, 'launch failed: ' + type(e).__name__)
            return
        self.pid = self.proc.pid
        self.handle = self.win.open(self.pid)
        self.backoff.start(now)
        self.log(f'{self.name}: started pid {self.pid}')

    def check(self, now):
        if self.handle is None or not self.win.exited(self.handle):
            return
        code = self.win.exit_code(self.handle)
        self.win.close(self.handle)
        self.handle = None
        if self.proc is not None:
            self.proc.poll()
            self.proc = None
        self.exited(now, f'pid {self.pid} exited with code {code}')

    def exited(self, now, why):
        delay = self.backoff.exited(now)
        self.next_start = now + delay
        self.last_exit = dict(at=time.time(), reason=why)
        self.log(f'{self.name}: {why}; restart in {delay}s (consecutive failures {self.backoff.failures})')

    def snapshot(self, now):
        return dict(pid=self.pid if self.handle is not None else None,
                    state='running' if self.handle is not None else 'waiting',
                    failures=self.backoff.failures,
                    restartInSeconds=0 if self.handle is not None else max(0, round(self.next_start - now)),
                    lastExit=self.last_exit)


def write_status(path, data):
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(data, sort_keys=True), encoding='utf-8')
    os.replace(tmp, path)


def run(args):
    win = Win32()
    log = Log(args.state / 'supervisor.log')
    if not win.own_mutex(mutex_name(args.state)):
        log('another supervisor owns this state directory; exiting')
        return 0
    services = [Service(name, args, win, log) for name in SERVICES]
    log(f'supervisor started pid {os.getpid()}')
    last = None
    while True:
        now = time.monotonic()
        for service in services:
            try:
                service.check(now)
                service.ensure(now)
            except Exception as e:  # keep supervising the other service
                log(f'{service.name}: supervisor error {type(e).__name__}')
        status = dict(pid=os.getpid(), services={s.name: s.snapshot(now) for s in services})
        if status != last:
            try:
                write_status(args.state / 'supervisor.json', dict(status, updatedAt=time.time()))
                last = status
            except OSError:
                pass
        time.sleep(POLL_SECONDS)


def current_user():
    domain, user = os.environ.get('USERDOMAIN', ''), os.environ.get('USERNAME', '')
    if not user:
        raise ValueError('USERNAME unavailable')
    return domain + '\\' + user if domain else user


def install(args):
    xml = task_xml(current_user(), args.pythonw, Path(__file__).resolve(), args.state, args.tool,
                   time.strftime('%Y-%m-%dT%H:%M:%S'))
    plan = dict(taskName=args.task_name, action=f'{args.pythonw} -X utf8 {Path(__file__).resolve()} run',
                triggers=['at logon', 'every 5 minutes (starts nothing while the supervisor runs)'],
                files=[str(args.state / 'supervisor.log'), str(args.state / 'supervisor.json')],
                applied=False)
    if not args.apply:
        return dict(plan, taskXml=xml, next='Re-run with -Apply (PowerShell) or --apply to register.')
    if not Path(args.pythonw).is_file():
        raise ValueError('pythonw.exe not found next to this Python')
    path = args.state / 'supervisor-task.xml'
    path.write_text(xml, encoding='utf-16')
    try:
        subprocess.run(['schtasks', '/Create', '/TN', args.task_name, '/XML', str(path), '/F'],
                       check=True, capture_output=True, creationflags=CREATE_NO_WINDOW)
        subprocess.run(['schtasks', '/Run', '/TN', args.task_name],
                       check=True, capture_output=True, creationflags=CREATE_NO_WINDOW)
    finally:
        path.unlink(missing_ok=True)
    return dict(plan, applied=True)


def uninstall(args):
    plan = dict(taskName=args.task_name, stops='the supervisor process only; running services keep running',
                applied=False)
    if not args.apply:
        return dict(plan, next='Re-run with -Apply (PowerShell) or --apply to remove.')
    subprocess.run(['schtasks', '/End', '/TN', args.task_name], capture_output=True, creationflags=CREATE_NO_WINDOW)
    subprocess.run(['schtasks', '/Delete', '/TN', args.task_name, '/F'],
                   check=True, capture_output=True, creationflags=CREATE_NO_WINDOW)
    return dict(plan, applied=True)


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return default


def status(args):
    registered = subprocess.run(['schtasks', '/Query', '/TN', args.task_name], capture_output=True,
                                creationflags=CREATE_NO_WINDOW).returncode == 0
    return dict(taskName=args.task_name, registered=registered,
                supervisor=read_json(args.state / 'supervisor.json', None))


def idle(state):
    """True when the dispatcher has no active task and no GUI request is in flight."""
    health = read_json(state / 'health.json', {})
    if health.get('activeTasks') or health.get('activeTask'):
        return False
    import sqlite3
    db = sqlite3.connect(f'file:{state / "queue.sqlite3"}?mode=ro', uri=True)
    try:
        return not db.execute("SELECT 1 FROM gui_jobs WHERE state IN ('prepared','waiting') LIMIT 1").fetchone()
    except sqlite3.OperationalError:
        return True  # no GUI tables yet
    finally:
        db.close()


def restart(args):
    """Stop both services at an idle boundary; the resident supervisor starts the new code."""
    sup = read_json(args.state / 'supervisor.json', None)
    if not sup:
        raise ValueError('Supervisor status unavailable')
    deadline = time.time() + args.timeout
    while not idle(args.state):
        if time.time() > deadline:
            return dict(restarted=False, reason='busy')
        time.sleep(5)
    win = Win32()
    stopped = []
    for name, service in sup['services'].items():
        if service.get('pid'):
            win.terminate(service['pid'])
            stopped.append(name)
    return dict(restarted=True, services=stopped)


def main():
    paths = default_paths()
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument('command', choices=['run', 'install', 'uninstall', 'status', 'restart'])
    p.add_argument('--state', type=Path, default=paths['state'])
    p.add_argument('--tool', type=Path, default=paths['tool'])
    p.add_argument('--python', type=Path, default=paths['python'], help='console python.exe for the services')
    p.add_argument('--pythonw', type=Path, default=paths['pythonw'], help='windowless interpreter for the task')
    p.add_argument('--task-name', default=TASK_NAME)
    p.add_argument('--apply', action='store_true', help='install/uninstall: actually change Task Scheduler')
    p.add_argument('--timeout', type=int, default=1800, help='restart: seconds to wait for an idle boundary')
    args = p.parse_args()
    if os.name != 'nt':
        print(json.dumps({'ok': False, 'error': 'Windows only; use launchd KeepAlive or systemd Restart=on-failure.'}))
        return 2
    if args.command == 'run':
        return run(args)
    try:
        out = dict(install=install, uninstall=uninstall, status=status, restart=restart)[args.command](args)
        print(json.dumps({'ok': True, 'result': out}, ensure_ascii=False))
        return 0
    except (OSError, ValueError, subprocess.SubprocessError) as e:
        print(json.dumps({'ok': False, 'error': 'Supervisor ' + args.command + ' failed: ' + type(e).__name__}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
