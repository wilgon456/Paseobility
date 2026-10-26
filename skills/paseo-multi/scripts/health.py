"""Controller orchestration for bounded remote health and opt-in cleanup."""
import base64
from concurrent.futures import ThreadPoolExecutor
import gzip
import json
from pathlib import Path
import re
import shlex
import subprocess
import uuid

HERE = Path(__file__).parent


def payload(platform, request):
    token = uuid.uuid4().hex
    start, end = 'PASEO_HEALTH_'+token+'_BEGIN', 'PASEO_HEALTH_'+token+'_END'
    if platform in ('macos', 'linux'):
        source = (HERE/'remote_health.py').read_text(encoding='utf-8')
        source += '\nimport base64, gzip\nrequest = '+repr(request)+'\n'
        source += "encoded = base64.b64encode(gzip.compress(json.dumps(main(request)).encode())).decode()\n"
        source += 'print('+repr(start)+')\nfor offset in range(0, len(encoded), 120): print(encoded[offset:offset+120])\nprint('+repr(end)+')\n'
        packed = base64.b64encode(gzip.compress(source.encode())).decode()
        loader = "import base64,gzip;exec(gzip.decompress(base64.b64decode("+repr(packed)+")))"
        script = 'python3 -c '+shlex.quote(loader)
        shell = 'bash'
    elif platform == 'windows':
        source = '$multiRequest = '+"'"+json.dumps(request, separators=(',', ':')).replace("'", "''")+"' | ConvertFrom-Json\n"
        source += (HERE/'remote_health.ps1').read_text(encoding='utf-8')
        source += "\n$multiBytes=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $multiResult -Depth 20 -Compress))\n"
        source += "$multiStream=New-Object IO.MemoryStream\n$multiZip=New-Object IO.Compression.GZipStream($multiStream,[IO.Compression.CompressionMode]::Compress,$true)\n$multiZip.Write($multiBytes,0,$multiBytes.Length);$multiZip.Dispose()\n$multiEncoded=[Convert]::ToBase64String($multiStream.ToArray())\n"
        source += "Write-Output '"+start+"'\nfor($multiOffset=0;$multiOffset -lt $multiEncoded.Length;$multiOffset+=120){$multiEncoded.Substring($multiOffset,[Math]::Min(120,$multiEncoded.Length-$multiOffset))}\nWrite-Output '"+end+"'"
        packed = base64.b64encode(gzip.compress(source.encode())).decode()
        script = "$s=New-Object IO.MemoryStream(,[Convert]::FromBase64String('"+packed+"'));$z=New-Object IO.Compression.GZipStream($s,[IO.Compression.CompressionMode]::Decompress);$r=New-Object IO.StreamReader($z,[Text.Encoding]::UTF8); & ([scriptblock]::Create($r.ReadToEnd()))"
        shell = 'powershell'
    else:
        raise ValueError('Health requires a registered macos, linux or windows platform.')
    return dict(script=script, shell=shell, token=token)


def remote(rpc, base, request, workspace=None):
    data = payload(base['host'].get('platform'), request)
    token = data.pop('token')
    result = rpc(dict(base, action='exec', wait=120, keepTerminal=False, compactWrapper=True,
                      **({'workspaceId': workspace} if workspace else {}), **data))
    if result.get('status') != 'completed' or result.get('exitCode') != 0:
        raise ValueError('Health run did not complete successfully; capture '+str(result.get('runId'))+' before retrying.')
    output = result.get('output', '')
    pattern = r'^PASEO_HEALTH_'+token+r'_BEGIN\r?\n([A-Za-z0-9+/=\s]+)\nPASEO_HEALTH_'+token+r'_END\r?$'
    matches = list(re.finditer(pattern, output, re.M))
    if len(matches) != 1:
        raise ValueError('Incomplete health output; no cleanup is authorized.')
    try:
        packed = base64.b64decode(re.sub(r'\s', '', matches[0][1]), validate=True)
        return json.loads(gzip.decompress(packed))
    except (ValueError, OSError, EOFError):
        raise ValueError('Invalid health output; no cleanup is authorized.') from None


def inventory(rpc, base):
    result = rpc(dict(base, action='inventory'))
    if not isinstance(result.get('terminals'), list) or not isinstance(result.get('processCleanupSafe'), bool):
        raise ValueError('Incomplete terminal/agent inventory.')
    return result


def report(rpc, base, workspace=None):
    snap = inventory(rpc, base)
    metrics = remote(rpc, base, dict(daemonPid=snap['daemonPid'], ended=snap['endedRuns'], protected=snap.get('protectedRuns', [])), workspace)
    if not isinstance(metrics, dict) or metrics.get('version') != 1 or not isinstance(metrics.get('candidates'), list):
        raise ValueError('Unsupported health payload schema.')
    metrics.update(host=base['host']['label'], terminals=snap.get('terminalReport', snap['terminals']),
                   processCleanupSafe=snap['processCleanupSafe'], warning=snap.get('warning'))
    metrics['candidates'].extend(snap['terminals'])
    return metrics


def cleanup(rpc, base, apply=False, port=None, picks=(), workspace=None):
    if picks and not apply:
        raise ValueError('--pick requires --apply; inspect a dry-run first.')
    health = report(rpc, base, workspace)
    items = health['candidates']
    if port is not None:
        items = [item for item in items if port in item.get('ports', [])]
    by_id = {item['id']:item for item in items}
    if any(p not in by_id or by_id[p].get('tier') == 'NEVER' for p in picks):
        raise ValueError('Unknown, filtered or protected pick; refresh the dry-run.')
    selected = [item for item in items if item.get('tier') == 'AUTO' or
                (item.get('tier') == 'CONFIRM' and item['id'] in picks)]
    result = dict(host=base['host']['label'], dryRun=not apply, candidates=items,
                  selected=[p['id'] for p in selected], actions=[], warning=health.get('warning'))
    if not apply:
        return result
    # Never dispatch a process mutation without a fresh complete idle snapshot.
    snap = inventory(rpc, base)
    for item in selected:
        if item['kind'] == 'terminal':
            try:
                action = rpc(dict(base, action='cleanup-terminal', runId=item['runId']))
                result['actions'].append(action)
            except ValueError as error:
                result['actions'].append(dict(id=item['id'], status='skipped', detail=str(error)))
    remote_items = [item for item in selected if item['kind'] != 'terminal']
    if remote_items:
        if not snap['processCleanupSafe'] and any(p['kind']=='process' for p in remote_items):
            blocked = [p for p in remote_items if p['kind']=='process']
            result['actions'].extend(dict(id=p['id'], status='skipped', reason='Active or unknown agent state; process trees protected.') for p in blocked)
            remote_items = [p for p in remote_items if p['kind']!='process']
    if remote_items or port is None:
        result['actions'].extend(remote(rpc, base, dict(apply=True, daemonPid=snap['daemonPid'],
            ended=snap['endedRuns'], protected=snap.get('protectedRuns', []), items=remote_items,
            picks=list(picks), purge=port is None), workspace))
    return result


def health_all(hosts, rpc, state_dir, workspace=None):
    def one(host):
        try:
            return dict(ok=True, result=report(rpc, dict(host=host, stateDir=str(state_dir)), workspace))
        except (ValueError, OSError, subprocess.TimeoutExpired) as error:
            return dict(ok=False, host=host['label'], error=str(error))
    with ThreadPoolExecutor(max_workers=min(8, len(hosts))) as pool:
        return list(pool.map(one, hosts))


def table(value):
    def cell(v):
        return re.sub(r'[\x00-\x1f\x7f-\x9f]', '?', str(v))
    def gib(v):
        return '?' if v is None else '%.1f' % (v/1073741824)
    if isinstance(value, list):
        return '\n\n'.join(table(v['result']) if v['ok'] else cell(v['host'])+': '+cell(v['error']) for v in value)
    if 'dryRun' in value:
        lines = ['HOST  MODE  ID  TIER  REASON']
        for p in value['candidates']:
            lines.append('  '.join(map(cell, [value['host'], 'dry-run' if value['dryRun'] else 'apply', p['id'], p['tier'], p['reason']])))
        for p in value['actions']:
            lines.append(cell(p['id'])+'  '+cell(p['status']))
        return '\n'.join(lines)
    ram, disk = value['ram'], value['disk']
    lines = ['HOST  CPU%  RAM available/total GiB  DISK free/total GiB  TEMP GiB',
             '  '.join(map(cell, [value['host'], value['cpuPercent'], gib(ram['availableBytes'])+'/'+gib(ram['totalBytes']), gib(disk['freeBytes'])+'/'+gib(disk['totalBytes']), gib(value['temp']['bytes'])+(' (partial)' if value['temp'].get('partial') else '')])),
             'TOP MEMORY: '+', '.join(cell(p['name'])+'('+str(p['pid'])+') '+gib(p['rssBytes'])+' GiB' for p in value['topProcesses']),
             'SAME NAME: '+', '.join(cell(p['name'])+' x'+str(p['count']) for p in value['processCounts'] if p['count']>1),
             'TERMINALS: '+', '.join(cell(t.get('name', t.get('terminalId', '?')))+' '+cell(t.get('status', 'completed')) for t in value.get('terminals', [])),
             'CANDIDATES:']
    lines.extend('  '.join(map(cell, [p['id'], p['tier'], p['reason'], p.get('cause', '')])) for p in value['candidates'])
    if value.get('warning'):
        lines.append(cell(value['warning']))
    return '\n'.join(lines)
