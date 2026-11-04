"""Small service helpers shared by the Discord runner."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import sys
import time
from uuid import uuid4

def describe(error):
    return type(error).__name__

def log_event(**fields):
    print(json.dumps(dict(fields, time=time.strftime('%Y-%m-%dT%H:%M:%S')), ensure_ascii=False), file=sys.stderr, flush=True)

def private_file(path):
    if path.is_symlink() or not path.is_file() or (os.name != 'nt' and path.stat().st_mode & 0o077):
        raise ValueError('Private regular file required')

def write_json(path, value):
    temp = path.with_name('.' + uuid4().hex + '.tmp')
    try:
        with os.fdopen(os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w', encoding='utf-8') as f:
            json.dump(value, f, ensure_ascii=False)
        for attempt in range(6):
            try:
                os.replace(temp, path)
                break
            except PermissionError:
                if attempt == 5: raise
                time.sleep(0.05 * (attempt + 1))
    finally:
        temp.unlink(missing_ok=True)

def stop_requested(home, name):
    path = Path(home) / (name + '.stop')
    try:
        if path.read_text(encoding='utf-8').strip() != str(os.getpid()): return False
        path.unlink(missing_ok=True)
        return True
    except OSError:
        return False

@contextmanager
def lock(home, name):
    home.mkdir(parents=True, exist_ok=True)
    fd = os.open(home / name, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        if os.name == 'nt':
            import msvcrt
            if os.fstat(fd).st_size == 0: os.write(fd, b'0')
            os.lseek(fd, 0, 0)
            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)
