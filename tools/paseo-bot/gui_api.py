#!/usr/bin/env python3
"""One authenticated SSH request on stdin; no listener, shell or credentials."""
import argparse
import json
import socket
import sqlite3
import sys
from pathlib import Path
from paseo_bot import Bot, ID, private_file, scrub

MAX_INPUT = 200000


def read_json(path, default):
    if not path.exists():
        return default
    private_file(path)
    return json.loads(path.read_text(encoding='utf-8-sig'))


def handle(home, request, allow_submit=False):
    if not isinstance(request, dict):
        raise ValueError('Invalid request')
    action = request.get('action')
    allowed = {'status': {'action', 'offset'}, 'result': {'action', 'id'}, 'submit': {'action', 'task'}}
    if action not in allowed or set(request) - allowed[action]:
        raise ValueError('Unsupported request')
    home = Path(home)
    if action == 'submit':
        if not allow_submit:
            raise ValueError('Read-only bridge')
        bot = Bot(home)
        try:
            # Exactly the same admission/owner fence/idempotency as CLI submit.
            return scrub(bot.submit(request['task']))
        finally:
            bot.db.close()
    dbpath = home / 'queue.sqlite3'
    private_file(dbpath)
    # No Bot constructor, schema creation, PRAGMA writes or queue mutations.
    db = sqlite3.connect(dbpath.resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
    try:
        db.execute('PRAGMA query_only=ON')
        if action == 'result':
            task_id = request.get('id')
            if not isinstance(task_id, str) or not ID.fullmatch(task_id):
                raise ValueError('Invalid ID')
            row = db.execute('SELECT record FROM tasks WHERE id=?', (task_id,)).fetchone()
            if not row:
                raise ValueError('Unknown task')
            return scrub(json.loads(row[0]))
        offset = request.get('offset', 0)
        if type(offset) is not int or offset < 0 or offset > 1000000:
            raise ValueError('Invalid offset')
        # A transaction keeps counts and the page consistent during dispatcher ticks.
        db.execute('BEGIN')
        counts = dict(db.execute('SELECT state,count(*) FROM tasks GROUP BY state'))
        rows = db.execute('SELECT id,state,body,record FROM tasks ORDER BY rowid DESC LIMIT 100 OFFSET ?', (offset,)).fetchall()
        tasks = []
        for task_id, state, body, record in rows:
            body, record = json.loads(body), json.loads(record)
            tasks.append(dict(id=task_id, state=state, title=body.get('title', task_id),
                              project=record.get('project', body.get('project', '')),
                              updatedAt=record.get('updatedAt', record.get('createdAt', 0))))
        health = read_json(home / 'health.json', {})
        owner = read_json(home / 'owner.json', {})
        config = read_json(home / 'projects.json', {'projects': []})
        import time
        active = owner.get('mode') == 'active' and owner.get('host', '').casefold() == socket.gethostname().casefold()
        return scrub(dict(host=socket.gethostname(), healthy=time.time() - health.get('lastTickAt', 0) < 120,
                          lastTickAt=health.get('lastTickAt', 0), acceptsTasks=active and allow_submit,
                          queue=counts, tasks=tasks, total=sum(counts.values()), offset=offset,
                          projects=[dict(id=p['id'], enabled=any(t.get('enabled') for t in p.get('targets', [])))
                                    for p in config.get('projects', [])]))
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, default=Path.home() / '.config/paseo-bot')
    parser.add_argument('--allow-submit', action='store_true')
    args = parser.parse_args()
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT + 1)
        if len(raw) > MAX_INPUT:
            raise ValueError('Oversize request')
        result = handle(args.state, json.loads(raw.decode('utf-8-sig')), args.allow_submit)
        sys.stdout.write(json.dumps({'ok': True, 'result': result}, ensure_ascii=False))
    except (ValueError, OSError, sqlite3.Error, KeyError, TypeError):
        sys.stdout.write('{"ok":false,"error":"Bot GUI request failed. Check task, queue ownership and bridge permissions."}')
        return 1
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
