// Complete state and exact-ID archive adapter. Default request is read-only.
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

let client;
try {
  const input = fs.readFileSync(0, 'utf8');
  const request = input.trim() ? JSON.parse(input) : {action: 'snapshot'};
  if (!['snapshot', 'archive'].includes(request.action)) throw Error('Unknown request');
  const modulePath = process.env.PASEO_CLEANUP_CLIENT_MODULE;
  if (!modulePath) throw Error('Installed client required');
  const clientModule = await import(pathToFileURL(modulePath).href);
  if (typeof clientModule.connectToDaemon !== 'function')
    throw Error('Installed Paseo client interface changed: missing connectToDaemon');
  const targetModule = await import(pathToFileURL(path.join(path.dirname(modulePath), 'daemon-target.js')).href);
  if (typeof targetModule.selectDaemonTarget !== 'function')
    throw Error('Installed Paseo client interface changed: missing selectDaemonTarget');
  client = await clientModule.connectToDaemon({target: targetModule.selectDaemonTarget({}), timeout: 10000});
  const daemon = await client.getDaemonStatus({timeout: 10000});
  if (request.action === 'archive' && (!request.serverId || request.serverId !== daemon.serverId))
    throw Error('Daemon identity changed');
  // Paseo 0.12 hides background workspaces and their agents unless asked. A 0.12+
  // client gates the flag on the host feature (and throws without it); an older
  // client cannot send it, so on a 0.12+ host background records stay invisible.
  // backgroundCovered says whether the snapshot can contain every such record.
  const newClient = typeof client.supportsBackgroundWorkspaces === 'function';
  const scope = newClient && client.supportsBackgroundWorkspaces() === true ? {includeBackground: true} : {};
  const hostVersion = /^(\d+)\.(\d+)/.exec(String(daemon.version ?? ''));
  const backgroundCovered = newClient ||
    (!!hostVersion && Number(hostVersion[1]) === 0 && Number(hostVersion[2]) < 12);
  const deadline = Date.now() + 30000;
  async function collect(fetch) {
    const rows = [], cursors = new Set();
    let cursor;
    for (let page = 0; page < 50; page++) {
      if (Date.now() > deadline) throw Error('Snapshot deadline exceeded');
      const result = await fetch({...scope, page: {limit: 200, ...(cursor ? {cursor} : {})}});
      if (!Array.isArray(result.entries) || !result.pageInfo || typeof result.pageInfo.hasMore !== 'boolean')
        throw Error('Unknown pagination schema');
      rows.push(...result.entries);
      if (!result.pageInfo.hasMore) {
        if (result.pageInfo.nextCursor) throw Error('Inconsistent pagination');
        return rows;
      }
      cursor = result.pageInfo.nextCursor;
      if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) throw Error('Invalid cursor');
      cursors.add(cursor);
    }
    throw Error('Snapshot exceeds page limit');
  }
  const agents = (await collect(options => client.fetchAgents(options))).filter(row => !row.agent?.archivedAt).map(row => {
    const a = row.agent;
    if (!a || (a.pendingPermissions != null && !Array.isArray(a.pendingPermissions))) throw Error('Unknown agent schema');
    return {id: a.id, shortId: a.id?.slice(0, 7), name: a.title, status: a.status,
      workspaceId: a.workspaceId, cwd: a.cwd, requiresAttention: !!a.requiresAttention,
      attentionReason: a.attentionReason, pendingPermissionCount: a.pendingPermissions?.length ?? 0};
  });
  const workspaces = (await collect(options => client.fetchWorkspaces(options))).map(w => ({
    workspaceId: w.id, name: w.name, project: w.projectDisplayName, cwd: w.workspaceDirectory,
    isolation: w.workspaceKind, background: w.background === true,
  }));
  if (request.action === 'archive') {
    if (!['agent', 'workspace'].includes(request.kind) || typeof request.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(request.id)) throw Error('Invalid exact target');
    const protectedAgent = agent => !['idle','error','closed'].includes(agent.status) ||
      agent.pendingPermissionCount > 0 || agent.attentionReason === 'permission' ||
      (agent.requiresAttention && agent.attentionReason !== 'finished');
    if (request.kind === 'agent') {
      const agent = agents.find(a => a.id === request.id);
      if (!agent || protectedAgent(agent)) throw Error('Agent protected');
    } else {
      if (!workspaces.some(w => w.workspaceId === request.id) ||
          agents.some(a => !a.workspaceId || (a.workspaceId === request.id && protectedAgent(a)))) throw Error('Workspace protected');
    }
    const result = request.kind === 'agent' ? await client.archiveAgent(request.id) : await client.archiveWorkspace(request.id);
    if (result.error) throw Error('Archive refused');
    console.log(JSON.stringify({[request.kind === 'agent' ? 'agentId' : 'workspaceId']: request.id,
      status:'archived', archivedAt: result.archivedAt}));
  } else {
    console.log(JSON.stringify({complete: true, serverId: daemon.serverId, backgroundCovered, agents, workspaces}));
  }
} catch (error) {
  const changed = /^Installed Paseo client interface changed: missing [A-Za-z]+$/.test(error?.message ?? '');
  console.log(JSON.stringify({error: changed ? error.message
    : 'Installed Paseo client could not complete the guarded request. Check compatibility and fresh state before retrying.'}));
  process.exitCode = 1;
} finally {
  if (client) await client.close().catch(() => {});
}
