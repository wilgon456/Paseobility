import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';

const req = JSON.parse(fs.readFileSync(0, 'utf8'));
let client;
let endpoint = '';
const secretValues = [];
let preparedRun;
function redact(text) {
  let out = String(text);
  for (const s of [endpoint, ...secretValues]) if (s) out = out.split(s).join('[connection redacted]');
  return out.replace(/https:\/\/[^\s"']*#offer=[^\s"']+/g, '[pairing offer redacted]');
}
function scrub(data) {
  if (typeof data === 'string') return redact(data);
  if (Array.isArray(data)) return data.map(scrub);
  if (data && typeof data === 'object') return Object.fromEntries(Object.entries(data).map(([k,v]) => [k,scrub(v)]));
  return data;
}
function endpointFor(h) {
  if (h.endpoint) {
    try {
      const u = new URL(h.endpoint);
      if (u.searchParams.get('password')) secretValues.push(u.searchParams.get('password'));
      if (u.hash.startsWith('#offer=')) {
        const offer = JSON.parse(Buffer.from(u.hash.slice(7), 'base64url').toString());
        if (offer.daemonPublicKeyB64) secretValues.push(offer.daemonPublicKeyB64);
      }
    } catch { /* Installed client validates transport syntax. */ }
    return h.endpoint;
  }
  const relay = h.connections?.find(c => c.type === 'relay');
  if (relay) {
    if (!relay.daemonPublicKeyB64 || !relay.relayEndpoint) throw Error('Incomplete relay registration.');
    secretValues.push(relay.daemonPublicKeyB64);
    const offer = {v: 2, serverId: h.serverId, daemonPublicKeyB64: relay.daemonPublicKeyB64,
      relay: {endpoint: relay.relayEndpoint, useTls: relay.useTls ?? true}};
    return 'https://app.paseo.sh/#offer=' + Buffer.from(JSON.stringify(offer)).toString('base64url');
  }
  const direct = h.connections?.find(c => c.type === 'directTcp');
  if (!direct?.endpoint) throw Error('No supported registered connection.');
  const target = new URL(direct.endpoint.includes('://') ? direct.endpoint : 'tcp://' + direct.endpoint);
  if (direct.useTls) target.searchParams.set('ssl', 'true');
  if (direct.password) {secretValues.push(direct.password); target.searchParams.set('password', direct.password);}
  return target.toString().replace(/\/(?=\?|$)/, '');
}
async function agents() {
  const rows = [], cursors = new Set(), ids = new Set();
  const deadline = Date.now() + 30000;
  let cursor;
  for (let page = 0; page < 50; page++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error('Agent snapshot deadline exceeded.');
    const result = await client.fetchAgents({timeout: remaining,
      page: {limit: 200, ...(cursor ? {cursor} : {})}});
    if (!Array.isArray(result.entries) || typeof result.pageInfo?.hasMore !== 'boolean')
      throw Error('Unsupported agent pagination schema.');
    for (const row of result.entries) {
      const a = row.agent;
      if (!a || typeof a.id !== 'string' || !a.id || ids.has(a.id) ||
          (a.pendingPermissions != null && !Array.isArray(a.pendingPermissions)))
        throw Error('Invalid or duplicate agent record.');
      ids.add(a.id);
      if (a.archivedAt) continue;
      const count = a.pendingPermissions?.length ?? a.pendingPermissionCount ?? 0;
      if (!Number.isInteger(count) || count < 0) throw Error('Unknown pending permission count.');
      rows.push({id: a.id, title: a.title, status: a.status,
        requiresAttention: !!a.requiresAttention, attentionReason: a.attentionReason,
        pendingPermissionCount: count});
    }
    if (!result.pageInfo.hasMore) {
      if (result.pageInfo.nextCursor) throw Error('Inconsistent agent pagination.');
      return rows;
    }
    cursor = result.pageInfo.nextCursor;
    if (typeof cursor !== 'string' || !cursor || cursors.has(cursor))
      throw Error('Missing or repeated agent cursor.');
    cursors.add(cursor);
  }
  throw Error('Agent snapshot exceeds page limit.');
}
async function capture(run) {
  const terminals = await client.listTerminals();
  const matchesByName = terminals.terminals?.filter(t => t.name === run.name) ?? [];
  const terminal = run.terminalId ? terminals.terminals?.find(t => t.id === run.terminalId) :
    (matchesByName.length === 1 ? matchesByName[0] : null);
  if (!terminal || terminal.name !== run.name) throw Error('Recorded terminal missing or ownership changed; outcome is unknown.');
  run = {...run, terminalId: terminal.id};
  const r = await client.captureTerminal(run.terminalId, {stripAnsi: true, start: 0});
  if (r.error) throw Error('Cannot capture recorded terminal.');
  const output = (r.lines ?? []).join('\n');
  const matches = [...output.matchAll(new RegExp('PASEO_RUN_' + run.runId + '_EXIT=(-?\\d+)', 'g'))];
  return {runId: run.runId, host: run.host, terminalId: run.terminalId,
    status: matches.length ? 'completed' : 'running',
    exitCode: matches.length ? Number(matches.at(-1)[1]) : null, output};
}
function runCli(argv) {
  return new Promise((resolve, reject) => {
    const env = {...process.env, PASEO_HOST: endpoint};
    delete env.PASEO_HOME;
    const p = spawn(req.cli, [...(req.cliPrefix ?? []), ...argv], {env, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    const timer = setTimeout(() => {p.kill(); reject(Error('CLI timed out; inspect state before retrying.'));}, 45000);
    p.stdout.on('data', b => stdout += b);
    p.stderr.on('data', b => stderr += b);
    p.on('error', e => {clearTimeout(timer); reject(e);});
    p.on('close', code => {clearTimeout(timer); resolve({host: req.host.label, exitCode: code, stdout, stderr});});
  });
}
async function main() {
  endpoint = endpointFor(req.host);
  const {connectToDaemon} = await import(pathToFileURL(process.env.PASEO_MULTI_HOST_CLIENT_MODULE).href);
  client = await connectToDaemon({target: {kind: 'endpoint', host: endpoint}, timeout: 30000});
  const status = await client.getDaemonStatus({timeout: 30000});
  if (status.serverId !== req.host.serverId) throw Error('Live server identity differs from registered target.');
  if (req.action === 'status') return {host: req.host.label, serverId: status.serverId,
    version: status.version, pid: status.pid, startedAt: status.startedAt, providers: status.providers};
  if (req.action === 'agents') return {host: req.host.label, agents: await agents()};
  if (req.action === 'restart') {
    const rows = await agents();
    const blocked = rows.filter(a => !['idle', 'error', 'closed'].includes(a.status) ||
      a.attentionReason === 'permission' ||
      (a.requiresAttention && a.attentionReason !== 'finished') || a.pendingPermissionCount > 0);
    if (blocked.length) throw Error('Restart deferred: active/unknown agent state or attention required.');
    return {host: req.host.label, acknowledged: await client.restartServer('cli_restart', undefined, {timeout: 30000}),
      verification: 'Reconnect and verify daemon version separately.'};
  }
  if (req.action === 'cli') return runCli(req.args);
  if (req.action === 'exec') {
    const runId = randomUUID();
    const run = {runId, host: req.host.label, serverId: req.host.serverId,
      terminalId: null, name: 'paseo-multi-' + runId, createdAt: new Date().toISOString()};
    const marker = 'PASEO_RUN_' + runId + '_EXIT=';
    let command, args;
    if (req.shell === 'powershell') {
      command = 'powershell.exe';
      const inner = Buffer.from("$ErrorActionPreference='Stop'\n" + req.script, 'utf16le').toString('base64');
      const wrapper = `& powershell.exe -NoProfile -EncodedCommand ${inner}; $rc=$LASTEXITCODE; Write-Output ('${marker}' + $rc); while ($true) {Start-Sleep -Seconds 60}`;
      args = ['-NoProfile', '-EncodedCommand', Buffer.from(wrapper, 'utf16le').toString('base64')];
      if (args.join(' ').length > 28000) throw Error('PowerShell script exceeds Windows command-line limit; use a shorter host-side script. No command was submitted.');
    } else {
      command = '/bin/bash';
      const literal = "'" + req.script.replaceAll("'", "'\\''") + "'";
      args = ['-c', `/bin/bash -c ${literal}; rc=$?; printf '\\n${marker}%s\\n' "$rc"; while :; do sleep 60; done`];
    }
    fs.mkdirSync(req.stateDir, {recursive: true, mode: 0o700});
    const recordPath = path.join(req.stateDir, runId + '.json');
    const fd = fs.openSync(recordPath, 'wx', 0o600);
    try {fs.writeFileSync(fd, JSON.stringify(run)); fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    // Recovery is durable before dispatch; lost responses resolve by unique name.
    preparedRun = run;
    const r = await client.createTerminal(req.shell === 'powershell' ? 'C:\\' : '/',
      run.name, undefined, {command, args, size: {cols: 180, rows: 40}});
    if (r.error || !r.terminal?.id) throw Error('Remote terminal creation failed.');
    run.terminalId = r.terminal.id;
    const deadline = Date.now() + req.wait * 1000;
    let result;
    do {
      await new Promise(r => setTimeout(r, 500));
      result = await capture(run);
    } while (result.status === 'running' && Date.now() < deadline);
    return result;
  }
  if (req.action === 'capture') return capture(req.run);
  if (req.action === 'close') {
    const terminals = await client.listTerminals();
    const byName = terminals.terminals?.filter(t => t.name === req.run.name) ?? [];
    const terminal = req.run.terminalId ? terminals.terminals?.find(t => t.id === req.run.terminalId) :
      (byName.length === 1 ? byName[0] : null);
    if (!terminal) return {runId: req.run.runId, status: 'already absent'};
    if (terminal.name !== req.run.name) throw Error('Terminal ownership/name changed; refusing close.');
    const result = await capture(req.run);
    if (result.status !== 'completed' && !req.interrupt) throw Error('Command still running; close requires explicit interruption.');
    await client.killTerminal(terminal.id);
    return {runId: req.run.runId, status: 'closed', exitCode: result.exitCode};
  }
  throw Error('Unsupported operation.');
}
try {
  const result = await main();
  console.log(JSON.stringify({ok: true, result: scrub(result)}));
} catch (e) {
  const recovery = preparedRun ? ` Run ${preparedRun.runId} is recorded; capture it before retrying.` : '';
  console.log(JSON.stringify({ok: false, error: redact(e.message ?? e.code ?? 'Remote request failed.') + recovery}));
  process.exitCode = 1;
} finally {
  if (client) await client.close().catch(() => {});
}
