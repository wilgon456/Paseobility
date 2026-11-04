import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

const sleep = ms => new Promise(r => setTimeout(r, ms));
export function writeMapping(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), {mode: 0o600});
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; }
    catch (e) {
      if (i === 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) { try { fs.unlinkSync(tmp); } catch {} throw e; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (i + 1));
    }
  }
}
export function loadMapping(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.values(data).some(x => typeof x !== 'string')) throw Error('invalid mapping');
    return data;
  } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}
export function prepareHome(home, source) {
  fs.mkdirSync(home, {recursive: true});
  const guidance = fs.readFileSync(new URL('./FRONT_AGENT.md', import.meta.url), 'utf8').replace('{{SOURCE}}', source);
  for (const name of ['AGENTS.md', 'CLAUDE.md']) fs.writeFileSync(path.join(home, name), guidance, 'utf8');
  const preferences = path.join(home, 'PREFERENCES.md');
  if (!fs.existsSync(preferences)) fs.writeFileSync(preferences, '# Preferences\n', 'utf8');
}
export async function connect(modulePath, home = process.env.PASEO_HOME || path.join(os.homedir(), '.paseo')) {
  if (!modulePath) throw Error('Paseo client module unavailable');
  const {connectToDaemon} = await import(pathToFileURL(modulePath).href);
  return connectToDaemon({target: {kind: 'instance', home}, timeout: 10000});
}

// Only the thread -> agent mapping is persisted. Timeline cursors and event dedupe
// live in memory; Paseo remains authoritative for the conversation and status.
export class Relay {
  constructor({client, stateDir, home, source, config = {}, send, typing = () => {}}) {
    this.client = client; this.file = path.join(stateDir, 'threads.json');
    this.map = loadMapping(this.file); this.home = home; this.source = source;
    this.config = {provider: 'codex', model: 'gpt-6.1-terra', thinking: 'high', mode: 'full-access', ...config};
    this.sendOutput = send; this.typing = typing; this.seen = new Map(); this.chains = new Map();
    prepareHome(home, source);
  }
  serial(thread, fn) {
    const previous = this.chains.get(thread) || Promise.resolve();
    const result = previous.catch(() => {}).then(fn);
    this.chains.set(thread, result);
    result.finally(() => { if (this.chains.get(thread) === result) this.chains.delete(thread); }).catch(() => {});
    return result;
  }
  async input(thread, text, messageId = randomUUID()) {
    return this.serial(thread, async () => {
      let id = this.map[thread];
      if (!id) {
        const created = await this.client.createWorkspace({source: {kind: 'directory', path: this.home}, title: 'Discord assistant'});
        if (!created.workspace?.id) throw Error('workspace creation failed');
        let agent;
        try {
          agent = await this.client.createAgent({provider: this.config.provider, model: this.config.model,
            thinkingOptionId: this.config.thinking, modeId: this.config.mode, cwd: this.home,
            workspaceId: created.workspace.id, title: 'Discord conversation', initialPrompt: text,
            labels: {paseo_bot_thread: thread}});
        } catch (e) { await this.client.archiveWorkspace(created.workspace.id).catch(() => {}); throw e; }
        id = agent.id; this.map[thread] = id; writeMapping(this.file, this.map);
        this.seen.set(thread, new Set());
      } else {
        const a = (await this.client.fetchAgent({agentId: id})).agent;
        if (a?.archivedAt || a?.status === 'closed') await this.client.refreshAgent(id);
        await this.client.sendMessage(id, text, {messageId, activeTurnBehavior: 'steer'});
      }
      return id;
    });
  }
  async timeline(id) {
    const module = process.env.PASEO_MULTI_HOST_CLIENT_MODULE;
    const {fetchProjectedTimelineItems} = await import(pathToFileURL(path.join(path.dirname(module), 'timeline.js')).href);
    return fetchProjectedTimelineItems({client: this.client, agentId: id, timeoutMs: 10000});
  }
  async baseline() {
    for (const [thread, id] of Object.entries(this.map)) {
      try { const items = await this.timeline(id); this.seen.set(thread, new Set(items.map(itemKey))); }
      catch { /* retry in poll; do not silently discard output */ }
    }
  }
  async poll(thread) {
    return this.serial(thread, async () => {
      const id = this.map[thread]; if (!id) return;
      const a = (await this.client.fetchAgent({agentId: id})).agent;
      if (!a) throw Error('agent missing');
      if (a.archivedAt) return;
      for (const p of a.pendingPermissions || []) if (p.id) await this.client.respondToPermission(id, p.id, {behavior: 'allow'});
      if (!['idle', 'closed', 'error'].includes(a.status)) { this.typing(thread); return; }
      const items = await this.timeline(id);
      const seen = this.seen.get(thread) || new Set(); this.seen.set(thread, seen);
      for (const item of items) {
        const key = itemKey(item);
        if (seen.has(key)) continue;
        if (item.type === 'assistant_message' && typeof item.text === 'string' && item.text.trim()) await this.sendOutput(thread, item.text);
        seen.add(key);
      }
    });
  }
  async closeThread(thread, deleted = false) {
    return this.serial(thread, async () => {
      const id = this.map[thread]; if (!id) return;
      const snapshot = await this.client.fetchAgent({agentId: id});
      let cursor;
      do {
        const page = await this.client.fetchAgents({includeBackground:true, page:{limit:200, ...(cursor ? {cursor} : {})}});
        for (const entry of page.entries || []) {
          const agent = entry.agent;
          if (agent?.id !== id && !agent?.archivedAt && agent?.labels?.paseo_bot_thread === thread) await this.client.archiveAgent(agent.id);
        }
        cursor = page.pageInfo?.hasMore ? page.pageInfo.nextCursor : null;
      } while (cursor);
      await this.client.archiveAgent(id);
      if (deleted) {
        if (snapshot.agent?.workspaceId) await this.client.archiveWorkspace(snapshot.agent.workspaceId);
        delete this.map[thread]; writeMapping(this.file, this.map); this.seen.delete(thread);
      }
    });
  }
  async switchModel(id, model, thinking) {
    await this.client.setAgentModel(id, model);
    if (thinking) await this.client.setAgentThinkingOption(id, thinking);
  }
}
function itemKey(item) { return String(item.messageId ?? item.id ?? item.eventId ?? JSON.stringify(item)); }
