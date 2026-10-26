"""POSIX remote health/cleanup payload. Sent over the existing exec transport."""
import collections
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import tempfile
import time
import uuid

MANAGED = Path.home() / '.cache/paseo-multi'
PROTECTED = re.compile(r'(\bpaseo\b|\bsshd?\b|\bmosh\b|\bcodex\b|\bclaude\b|\bopencode\b|command.code|\blaunchd\b|\bsystemd\b|\bloginwindow\b)', re.I)


def command(args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=10).strip()


def size(directory, limit=20000):
    if Path(directory).is_symlink():
        return {'bytes': 0, 'partial': True}
    total = 0
    count = 0
    try:
        for root, dirs, files in os.walk(directory, followlinks=False):
            dirs[:] = [d for d in dirs if not (Path(root) / d).is_symlink()]
            for name in files:
                count += 1
                if count > limit:
                    return {'bytes': total, 'partial': True}
                try:
                    info = (Path(root) / name).lstat()
                    if stat.S_ISREG(info.st_mode):
                        total += info.st_size
                except OSError:
                    pass
    except OSError:
        return {'bytes': total, 'partial': True}
    return {'bytes': total, 'partial': False}


def process_snapshot():
    # No command lines leave the host. ps e is inspected only for our single tag.
    rows = []
    raw = command(['ps', '-axo', 'pid=,ppid=,uid=,pgid=,etimes=,rss=,lstart=,comm=']) if os.uname().sysname != 'Darwin' else command(['ps', '-axo', 'pid=,ppid=,uid=,pgid=,etime=,rss=,lstart=,comm='])
    for line in raw.splitlines():
        parts = line.split(None, 11)
        if len(parts) != 12:
            continue
        pid, parent, uid, pgid, elapsed, rss = parts[:6]
        started, name = ' '.join(parts[6:11]), parts[11]
        if '-' in elapsed or ':' in elapsed:
            day, _, clock = elapsed.rpartition('-')
            nums = [int(n) for n in clock.split(':')]
            age = int(day or 0) * 86400 + sum(v * 60 ** i for i, v in enumerate(reversed(nums)))
        else:
            age = int(elapsed)
        rows.append(dict(pid=int(pid), ppid=int(parent), uid=int(uid), pgid=int(pgid),
                         ageSeconds=age, started=started, rssBytes=int(rss)*1024,
                         name=Path(name).name, session=None, ports=[]))
    by_pid = {p['pid']: p for p in rows}
    protected_commands = set()
    try:
        for line in command(['ps', '-axo', 'pid=,args=']).splitlines():
            fields = line.split(None, 1)
            if len(fields)==2 and PROTECTED.search(fields[1]):
                protected_commands.add(int(fields[0]))
    except (OSError, subprocess.SubprocessError):
        protected_commands = set(by_pid)  # unreadable commands are not killable
    ancestors = {os.getpid()}
    parent = os.getppid()
    while parent in by_pid and parent not in ancestors:
        ancestors.add(parent)
        parent = by_pid[parent]['ppid']
    for p in rows:
        p['agentTree'] = p['pid'] in protected_commands
        p['protected'] = p['agentTree'] or p['pid'] in ancestors
    try:
        sockets = command(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'])
        current = None
        for line in sockets.splitlines():
            if line.startswith('p'):
                current = by_pid.get(int(line[1:]))
            elif line.startswith('n') and current is not None:
                port = re.search(r':(\d+)$', line)
                if port:
                    current['ports'].append(int(port[1]))
        ports_known = True
    except (OSError, subprocess.SubprocessError):
        ports_known = False
    for p in rows:
        if p['uid'] == os.getuid() and p['uid'] != 0:
            try:
                env = Path('/proc/%s/environ' % p['pid']).read_bytes().replace(b'\0', b' ').decode(errors='replace') if os.uname().sysname != 'Darwin' else command(['ps', 'eww', '-p', str(p['pid']), '-o', 'command='])
                match = re.search(r'(?:^|\s)PASEO_MULTI_SESSION=([a-f0-9-]{36})(?:\s|$)', env)
                if match:
                    p['session'] = match[1]
            except (OSError, subprocess.SubprocessError):
                pass
        parent = by_pid.get(p['ppid'])
        p['parentDead'] = p['ppid'] <= 1 or (p['ppid'] not in by_pid) or (parent and parent['ageSeconds'] < p['ageSeconds'])
        p['cause'] = 'parent %s (%s)' % (p['ppid'], parent['name'] if parent else 'absent')
    return rows, ports_known


def forbidden(rows, daemon_pid):
    ids = {p['pid'] for p in rows if p['uid'] != os.getuid() or p['uid'] == 0 or p['pid'] <= 1 or p.get('protected') or PROTECTED.search(p['name'])}
    # The daemon itself is never a target. Its PTY children can be owned runs.
    ids.add(daemon_pid)
    roots = {p['pid'] for p in rows if p['pid'] != daemon_pid and (p['uid'] != os.getuid() or p['uid'] == 0 or PROTECTED.search(p['name']) or p.get('agentTree'))}
    roots = {p for p in roots if p > 1}
    # Exclude daemon ancestors: launchd/systemd own unrelated user applications.
    ancestor = daemon_pid
    by_pid = {p['pid']:p for p in rows}
    while ancestor in by_pid:
        roots.discard(ancestor)
        next_parent = by_pid[ancestor]['ppid']
        if next_parent == ancestor:
            break
        ancestor = next_parent
    while True:
        more = {p['pid'] for p in rows if p['ppid'] in roots}
        if more <= roots:
            break
        roots |= more
    return ids | roots


def candidates(rows, daemon_pid, ended, protected=()):
    denied = forbidden(rows, daemon_pid)
    counts = collections.Counter(p['name'].casefold() for p in rows)
    result = []
    for p in rows:
        if p['pid'] in denied or p['session'] in protected or (p['session'] and p['session'] not in ended and not p['parentDead']):
            continue
        tagged = p['session'] and (p['session'] in ended or p['parentDead'])
        orphan = re.fullmatch(r'(node|python[\d.]*|bun)(\.exe)?', p['name'], re.I) and p['parentDead'] and p['ageSeconds'] >= 21600 and p['ports']
        pileup = counts[p['name'].casefold()] >= 3
        if tagged or orphan or pileup:
            result.append(dict(id='process:%s:%s' % (p['pid'], p['started']), kind='process',
                               tier='AUTO' if tagged else 'CONFIRM', reason='ended/dead-parent tagged run' if tagged else 'orphan dev server' if orphan else 'same-name pileup; inspect cause before picking', **p))
    return result


def temp_candidates():
    folder = MANAGED / 'temp'
    if folder.is_symlink() or MANAGED.is_symlink():
        return []
    result = []
    if folder.is_dir():
        for file in folder.iterdir():
            info = file.lstat()
            if stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and time.time()-info.st_mtime > 172800:
                result.append(dict(id='temp:'+file.name, kind='temp', tier='AUTO', reason='managed file older than two days', name=file.name, mtime=info.st_mtime_ns, bytes=info.st_size))
    return result


def collect(daemon_pid=0, ended=(), protected=()):
    rows, ports_known = process_snapshot()
    disk = shutil.disk_usage(Path.home())
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=0.1)
        ram = dict(totalBytes=psutil.virtual_memory().total, availableBytes=psutil.virtual_memory().available)
    except ImportError:
        cpu = None
        if os.uname().sysname == 'Darwin':
            total = int(command(['sysctl', '-n', 'hw.memsize']))
            vm = command(['vm_stat'])
            page = int(re.search(r'page size of (\d+)', vm)[1])
            free = sum(int(n) for n in re.findall(r'Pages (?:free|inactive|speculative):\s+(\d+)', vm)) * page
            ram = dict(totalBytes=total, availableBytes=free)
            text = command(['top', '-l', '1', '-n', '0'])
            idle = re.search(r'([\d.]+)% idle', text)
            cpu = round(100-float(idle[1]), 2) if idle else None
        else:
            mem = dict(re.findall(r'^(\w+):\s+(\d+)', Path('/proc/meminfo').read_text(), re.M))
            ram = dict(totalBytes=int(mem['MemTotal'])*1024, availableBytes=int(mem['MemAvailable'])*1024)
            def ticks():
                return [int(v) for v in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
            a = ticks(); time.sleep(0.1); b = ticks()
            diff = [y-x for x, y in zip(a, b)]
            cpu = round(100*(1-(diff[3]+diff[4])/sum(diff)), 2) if sum(diff) else None
    counts = collections.Counter(p['name'] for p in rows)
    return dict(version=1, platform=os.uname().sysname, cpuPercent=cpu, ram=ram,
                disk=dict(totalBytes=disk.total, freeBytes=disk.free),
                topProcesses=sorted(rows, key=lambda p:p['rssBytes'], reverse=True)[:10],
                processCounts=[dict(name=n, count=c, causes=sorted({p['cause'] for p in rows if p['name']==n})) for n,c in counts.most_common()],
                processes=rows, portsKnown=ports_known, temp=size(tempfile.gettempdir()),
                managedTemp=size(MANAGED/'temp'), candidates=candidates(rows, daemon_pid, ended, protected)+temp_candidates())


def private_root():
    MANAGED.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = MANAGED.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Managed root must be a private owned directory')
    return MANAGED


def audit(event):
    file = private_root()/'cleanup.jsonl'
    fd = os.open(file, os.O_WRONLY|os.O_APPEND|os.O_CREAT|os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as stream:
        if os.fstat(stream.fileno()).st_uid != os.getuid() or os.fstat(stream.fileno()).st_mode & 0o077:
            raise ValueError('Unsafe audit file')
        stream.write(json.dumps(dict(time=time.time(), **event))+'\n'); stream.flush(); os.fsync(stream.fileno())


def apply(request):
    rows, _ = process_snapshot()
    eligible = {p['id']:p for p in candidates(rows, request['daemonPid'], request.get('ended', []), request.get('protected', []))+temp_candidates()}
    results = []
    for picked in request['items']:
        current = eligible.get(picked['id'])
        event = dict(id=picked['id'], reason=picked['reason'], status='skipped')
        try:
            if not current or current['tier'] != picked['tier'] or (current['tier'] == 'CONFIRM' and current['id'] not in request.get('picks', [])):
                raise ValueError('Eligibility changed or explicit pick missing')
            audit(dict(event, status='attempt'))
            if current['kind'] == 'temp':
                quarantine = private_root()/'quarantine'
                quarantine.mkdir(mode=0o700, exist_ok=True)
                if quarantine.is_symlink() or quarantine.stat().st_mode & 0o077:
                    raise ValueError('Unsafe quarantine')
                file = MANAGED/'temp'/current['name']
                # Nonblocking lock; moving only regular, owned files under our root.
                import fcntl
                with os.fdopen(os.open(file, os.O_RDONLY|os.O_NOFOLLOW), 'rb') as stream:
                    fcntl.flock(stream, fcntl.LOCK_EX|fcntl.LOCK_NB)
                    info=file.lstat()
                    opened=os.fstat(stream.fileno())
                    if info.st_mtime_ns != picked['mtime'] or not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_ino != opened.st_ino:
                        raise ValueError('File changed')
                    destination = quarantine/(str(uuid.uuid4())+'.quarantined')
                    file.rename(destination)
                    os.utime(destination, None)
                event['status'] = 'quarantined'
            else:
                # Never signal a shared group or any protected/live-run member.
                rows, _ = process_snapshot()
                denied = forbidden(rows, request['daemonPid'])
                if current['id'] not in {p['id'] for p in candidates(rows, request['daemonPid'], request.get('ended', []), request.get('protected', []))}:
                    raise ValueError('Process eligibility changed')
                target = next((p for p in rows if p['pid']==current['pid'] and p['started']==current['started']), None)
                if not target or target['pgid'] != target['pid']:
                    raise ValueError('PID changed or process group is not isolated')
                group = [p for p in rows if p['pgid']==target['pgid']]
                if any(p['pid'] in denied or p['session'] in request.get('protected', []) or (p['session'] and p['session'] not in request.get('ended', []) and not p['parentDead']) for p in group):
                    raise ValueError('Process group includes protected or live run')
                descendants = {target['pid']}
                for _ in rows:
                    descendants |= {p['pid'] for p in rows if p['ppid'] in descendants}
                if any(p['pid'] not in descendants for p in group):
                    raise ValueError('Process group includes unrelated members')
                if any(p['pid'] in descendants and p['pgid'] != target['pgid'] for p in rows):
                    raise ValueError('Descendants escaped isolated process group')
                os.killpg(target['pgid'], signal.SIGTERM)
                time.sleep(2)
                remaining, _ = process_snapshot()
                live = [p for p in remaining if p['pgid']==target['pgid']]
                known = {(p['pid'], p['started']) for p in group}
                if live and all((p['pid'], p['started']) in known for p in live):
                    os.killpg(target['pgid'], signal.SIGKILL)
                elif live:
                    raise ValueError('Process group changed during grace period')
                time.sleep(0.1)
                verified, _ = process_snapshot()
                if any(p['pgid']==target['pgid'] for p in verified):
                    raise ValueError('Process group termination unconfirmed')
                event['status'] = 'terminated'
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            event['detail'] = str(error)
        audit(event); results.append(event)
    # Purge only quarantine files created by us, seven days after quarantine.
    quarantine = MANAGED/'quarantine'
    if request.get('purge', True) and quarantine.is_dir() and not quarantine.is_symlink():
        for file in quarantine.iterdir():
            info = file.lstat()
            if re.fullmatch(r'[a-f0-9-]{36}\.quarantined', file.name) and stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid() and time.time()-info.st_mtime > 604800:
                event=dict(id='quarantine:'+file.name, reason='seven day quarantine retention', status='skipped')
                audit(dict(event, status='purge-attempt'))
                try:
                    import fcntl
                    with os.fdopen(os.open(file, os.O_RDONLY|os.O_NOFOLLOW), 'rb') as stream:
                        fcntl.flock(stream, fcntl.LOCK_EX|fcntl.LOCK_NB)
                        if file.lstat().st_ino != os.fstat(stream.fileno()).st_ino:
                            raise ValueError('Quarantine file changed')
                        file.unlink()
                    event['status']='purged'
                except (OSError, ValueError) as error:
                    event['detail']=str(error)
                audit(event); results.append(event)
    return results


def main(request):
    return apply(request) if request.get('apply') else collect(request.get('daemonPid', 0), request.get('ended', []), request.get('protected', []))
