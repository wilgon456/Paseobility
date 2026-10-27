"""Durable, opt-in completion delivery. No URL or credential is kept in SQLite."""
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import time

STATES = {'passed', 'failed', 'blocked'}
MAX_ATTEMPTS = 4  # Initial attempt plus at most three retries.


def initialize(db):
    db.execute('''CREATE TABLE IF NOT EXISTS webhook_jobs(
        task_id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL, payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        next_at REAL NOT NULL DEFAULT 0, http_status INTEGER)''')


def enqueue(db, record, body):
    payload = {
        'task_id': record['id'], 'project': record['project'],
        'machine': record.get('machine') or body.get('machine') or socket.gethostname(),
        'state': record['state'], 'summary': record.get('summary') or record.get('reason', ''),
        # A bot-published draft PR wins over producer-supplied metadata.
        'pr_url': record.get('prUrl') or record.get('pr_url') or body.get('pr_url', ''),
        'requester': body.get('requester', '')}
    payload = {k: str(v)[:8000] for k, v in payload.items()}
    identity = hashlib.sha256(('paseo-completion-v1:' + record['id']).encode()).hexdigest()
    db.execute('INSERT OR IGNORE INTO webhook_jobs(task_id,delivery_id,payload) VALUES (?,?,?)',
               (record['id'], identity, json.dumps(payload, ensure_ascii=False)))


def attempt(config, payload, delivery_id):
    cmd = [config['python'], str(Path(__file__).with_name('webhook_delivery.py'))]
    if config.get('brokerConfig'):
        cmd.extend(['--broker-config', config['brokerConfig']])
    try:
        result = subprocess.run(cmd, input=json.dumps({'payload': payload, 'delivery_id': delivery_id}, ensure_ascii=False),
                                text=True, encoding='utf-8', capture_output=True, timeout=45)
        if result.returncode:
            return {'outcome': 'uncertain'}
        receipt = json.loads(result.stdout)
        if not isinstance(receipt, dict) or receipt.get('outcome') not in {'delivered', 'retry', 'rejected', 'uncertain'}:
            return {'outcome': 'uncertain'}
        return receipt
    except OSError:
        return {'outcome': 'retry'}  # No child was started; no POST could have happened.
    except (subprocess.SubprocessError, ValueError):
        return {'outcome': 'uncertain'}


def drain(db, home, send=attempt, now=None):
    config_file = Path(home) / 'webhook.json'
    if not config_file.is_file():
        return
    config = json.loads(config_file.read_text(encoding='utf-8-sig'))
    if config.get('enabled') is not True:
        return
    if set(config) - {'enabled', 'python', 'brokerConfig'} or not Path(config['python']).is_absolute():
        raise ValueError('Invalid webhook configuration.')
    now = time.time() if now is None else now
    with db:
        # A crash between send and durable acknowledgement must not replay a POST.
        db.execute("UPDATE webhook_jobs SET status='uncertain' WHERE status='sending'")
        row = db.execute("SELECT task_id,delivery_id,payload,attempts FROM webhook_jobs WHERE status='pending' AND next_at<=? ORDER BY rowid LIMIT 1", (now,)).fetchone()
        if not row:
            return
        task_id, identity, encoded, attempts = row
        db.execute("UPDATE webhook_jobs SET status='sending',attempts=attempts+1 WHERE task_id=?", (task_id,))
    # Never perform network I/O within the task transaction.
    try:
        receipt = send(config, json.loads(encoded), identity)
    except Exception:
        receipt = {'outcome': 'uncertain'}
    outcome = receipt.get('outcome', 'uncertain')
    attempts += 1
    status = ('pending' if attempts < MAX_ATTEMPTS else 'exhausted') if outcome == 'retry' else outcome
    if status not in {'pending', 'exhausted', 'delivered', 'rejected', 'uncertain'}:
        status = 'uncertain'
    http_status = receipt.get('http_status')
    if type(http_status) is not int or not 100 <= http_status <= 599:
        http_status = None
    with db:
        db.execute('UPDATE webhook_jobs SET status=?,next_at=?,http_status=? WHERE task_id=?',
                   (status, now + 5 * (3 ** (attempts - 1)), http_status, task_id))
