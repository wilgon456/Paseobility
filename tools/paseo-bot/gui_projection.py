"""Read-only DTOs. Filters run over the full queue with bound SQL parameters."""
import json
import re
import socket
import time
from gui_state import project_list
from paseo_bot import MODELS, model_alias, route_model, scrub

GROUPS = {'waiting': ['queued', 'ready'], 'running': ['dispatching', 'running', 'repairing'],
          'attention': ['blocked', 'unknown'], 'success': ['passed'], 'failed': ['failed'], 'closed': ['closed']}


def safe_pr(value):
    return value if isinstance(value, str) and re.fullmatch(r'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[1-9][0-9]*', value) else ''


def snapshot(db, home, request, writable, read_json):
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    origin = 'o.context' if 'task_origins' in tables else "'{}'"
    join = ' LEFT JOIN task_origins o ON o.task_id=t.id' if 'task_origins' in tables else ''
    where, params = [], []
    for key, expression in [('project', "json_extract(t.body,'$.project')"), ('machine', "coalesce(json_extract(t.record,'$.machine'),json_extract(t.body,'$.machine'),'')"), ('requester', "coalesce(json_extract(" + origin + ",'$.requester'),'legacy')")]:
        value = request.get(key, '')
        if not isinstance(value, str) or len(value) > 200:
            raise ValueError('Filter')
        if value:
            where.append(expression + '=?'); params.append(value)
    query = request.get('query', '')
    if not isinstance(query, str) or len(query) > 200:
        raise ValueError('Search')
    if query:
        where.append("instr(lower(json_extract(t.body,'$.title') || ' ' || t.id),lower(?)) > 0"); params.append(query)
    group = request.get('group', '')
    if group:
        if group not in GROUPS:
            raise ValueError('Group')
        where.append('t.state IN (%s)' % ','.join('?' for _ in GROUPS[group])); params.extend(GROUPS[group])
    else:
        where.append("t.state<>'closed'")  # Closed cards leave the board; ask for group=closed to see them.
    scope = request.get('scope', '')
    if scope:
        where.append("json_extract(" + origin + ",'$.conversationId')=?"); params.append(scope)
    offset = request.get('offset', 0)
    if type(offset) is not int or not 0 <= offset <= 1000000:
        raise ValueError('Offset')
    order = {'newest': 't.rowid DESC', 'oldest': 't.rowid ASC', 'updated': "coalesce(json_extract(t.record,'$.updatedAt'),json_extract(t.record,'$.createdAt'),0) DESC,t.rowid DESC", 'title': "json_extract(t.body,'$.title') COLLATE NOCASE,t.rowid DESC"}.get(request.get('sort', 'newest'))
    if not order:
        raise ValueError('Sort')
    suffix = ' WHERE ' + ' AND '.join(where) if where else ''
    db.execute('BEGIN')
    counts = dict(db.execute('SELECT state,count(*) FROM tasks GROUP BY state'))
    filtered = db.execute('SELECT count(*) FROM tasks t' + join + suffix, params).fetchone()[0]
    rows = db.execute('SELECT t.id,t.state,t.body,t.record,' + origin + ' FROM tasks t' + join + suffix + ' ORDER BY ' + order + ' LIMIT 100 OFFSET ?', params + [offset]).fetchall()
    tasks = []
    for task_id, state, body, record, context in rows:
        body, record, context = json.loads(body), json.loads(record), json.loads(context or '{}')
        # Active alias once dispatched (fallbacks included), otherwise the planned work model.
        model = model_alias(record.get('model'))
        if model not in MODELS:
            try: model = route_model(body, 'work')
            except (TypeError, AttributeError): model = ''
        tasks.append(dict(id=task_id, state=state, title=body.get('title', task_id), project=body['project'],
                          machine=record.get('machine', body.get('machine', '')), profile=record.get('profile', ''), model=model if model in MODELS else '',
                          stage=record.get('stage', ''), createdAt=record.get('createdAt', 0),
                          updatedAt=record.get('updatedAt', record.get('createdAt', 0)),
                          requester=context.get('requester', 'legacy'), conversationId=context.get('conversationId', ''),
                          retryOf=context.get('retryOf') or '',
                          prUrl=safe_pr(record.get('prUrl') or record.get('evidence', {}).get('review', {}).get('prUrl'))))
    config = read_json(home / 'projects.json', {'projects': []})
    health = read_json(home / 'health.json', {})
    owner = read_json(home / 'owner.json', {})
    active = owner.get('mode') == 'active' and owner.get('host', '').casefold() == socket.gethostname().casefold()
    out = dict(host=socket.gethostname(), healthy=time.time() - health.get('lastTickAt', 0) < 120,
               lastTickAt=health.get('lastTickAt', 0), acceptsTasks=active and writable,
               queue=counts, tasks=tasks, total=sum(counts.values()), filtered=filtered, offset=offset,
               projects=project_list(config), conversations=[], messages=[], plans=[], configured=False,
               managerHealthy=False, deliveryState='', stuck='', lastSyncAt=time.time())
    if 'gui_conversations' in tables:
        out['configured'] = True
        out['conversations'] = [dict(zip(['id', 'title', 'agentId', 'status', 'createdAt'], r)) for r in db.execute('SELECT * FROM gui_conversations ORDER BY created DESC LIMIT 50')]
        selected = request.get('conversationId') or (out['conversations'][0]['id'] if out['conversations'] else '')
        if selected and selected not in [c['id'] for c in out['conversations']]:
            raise ValueError('Conversation scope')
        before = request.get('before', 1e20)
        if type(before) not in [int, float] or before < 0:
            raise ValueError('History cursor')
        messages = db.execute('SELECT id,role,text,time,payload FROM gui_messages WHERE conversation=? AND time<? ORDER BY time DESC LIMIT 100', (selected, before)).fetchall()
        out['messages'] = [dict(id=i, role=r, text=t, time=ts, payload=json.loads(p)) for i, r, t, ts, p in reversed(messages)]
        out['plans'] = [dict(id=i, digest=d, state=s, **json.loads(b)) for i, b, d, s in db.execute('SELECT id,body,digest,state FROM gui_plans WHERE conversation=? ORDER BY created DESC LIMIT 10', (selected,))]
        job = db.execute("SELECT state FROM gui_jobs WHERE conversation=? AND state NOT IN ('done','invalid') ORDER BY created LIMIT 1", (selected,)).fetchone()
        out['deliveryState'] = job[0] if job else ''
        status = next((c['status'] for c in out['conversations'] if c['id'] == selected), '')
        out['stuck'] = 'job-unknown' if out['deliveryState'] == 'unknown' else 'manager-missing' if status == 'missing' else ''
        meta = db.execute("SELECT value FROM gui_meta WHERE key='heartbeat'").fetchone()
        out['managerHealthy'] = bool(meta and time.time() - json.loads(meta[0]).get('lastTickAt', 0) < 120)
    return scrub(out)
