#!/usr/bin/env node
// Discord gateway for the Paseo bot: one owner, one channel, no HTTP listener.
// Zero dependencies; Node 22+ (global WebSocket and fetch). The token arrives on
// stdin as one JSON line and is never written to argv, env, files or logs.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as core from './discord_core.mjs';

const API = 'https://discord.com/api/v10';
const INTENTS = 33281; // GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT
const OUTBOUND_MS = 3000;
const HEARTBEAT_MS = 5000;
const STATE_VERSION = 1;
const DIR = path.dirname(fileURLToPath(import.meta.url));
const GUI_API = path.join(DIR, 'gui_api.py');
const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

let stateDir = '';
let token = '';
let config = null;
let state = null;
let appId = '';
let status = 'connecting';
let lastEventAt = 0;
let fatal = false;

function log(event, data = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (/token|authorization|secret|password/i.test(key)) continue;
    clean[key] = typeof value === 'string' ? value.slice(0, 200) : value;
  }
  try {
    process.stderr.write(JSON.stringify({time: new Date().toISOString(), event, ...clean}) + '\n');
  } catch {
    // A closed stderr never takes the gateway down.
  }
}

function argState(argv) {
  const index = argv.indexOf('--state');
  if (index < 0 || !argv[index + 1]) throw new Error('state');
  return path.resolve(argv[index + 1]);
}

function readConfig(dir) {
  const file = path.join(dir, 'discord.json');
  const info = fs.lstatSync(file);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('config');
  if (process.platform !== 'win32' && (info.mode & 0o077)) throw new Error('config permissions');
  // PowerShell 5.1 writes UTF-8 with a BOM; JSON.parse rejects a leading U+FEFF.
  const parsed = core.parseConfig(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
  if (!parsed) throw new Error('config');
  if (!parsed.enabled) throw new Error('disabled');
  return parsed;
}

async function readToken() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 4096) break;
  }
  const line = raw.split('\n').map(part => part.trim()).filter(Boolean)[0] ?? '';
  const value = JSON.parse(line);
  const candidate = value?.token;
  if (typeof candidate !== 'string' || !candidate || candidate.length > 512) throw new Error('token');
  if (/[\s\u0000-\u001f\u007f]/.test(candidate)) throw new Error('token');
  return candidate;
}

function emptyState() {
  return {version: STATE_VERSION, threads: {}, delivered: {}, cards: {}, permissions: {}, memory: {}, review: {}, confirms: {}, seenMessages: [], seenInteractions: [], gateway: {}, lastSeen: {}, partial: {}};
}

function newThread(conversationId) {
  const now = Date.now();
  return {
    conversationId,
    parentId: config.channelId,
    messageId: conversationId,
    createdAt: now,
    lastActivityAt: now,
    polledAt: 0,
    failures: 0,
    dormant: false,
    sync: core.syncSummary(null),
  };
}

// The memory-review conversation lives in the channel itself: no thread, warm tier.
function memoryReviewThread() {
  const now = Date.now();
  return {
    conversationId: core.MEMORY_REVIEW,
    parentId: config.channelId,
    messageId: config.channelId,
    createdAt: now,
    lastActivityAt: now - core.HOT_MS - 1000,
    polledAt: 0,
    failures: 0,
    dormant: false,
    sync: core.syncSummary(null),
  };
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== STATE_VERSION) throw new Error('state version');
  const threads = {};
  for (const [threadId, record] of Object.entries(value.threads ?? {})) {
    // A record from another channel or a damaged entry is dropped, never fatal.
    if (!core.isSnowflake(threadId) || !record || typeof record !== 'object') continue;
    if (record.parentId !== config.channelId || typeof record.conversationId !== 'string' || !record.conversationId) continue;
    threads[threadId] = {
      conversationId: record.conversationId,
      parentId: record.parentId,
      messageId: typeof record.messageId === 'string' ? record.messageId : '',
      createdAt: Number(record.createdAt) || 0,
      lastActivityAt: Number(record.lastActivityAt) || Number(record.createdAt) || 0,
      polledAt: Number(record.polledAt) || 0,
      failures: Number.isInteger(record.failures) && record.failures >= 0 ? record.failures : 0,
      dormant: record.dormant === true,
      sync: core.syncSummary(record.sync),
    };
  }
  const delivered = {};
  for (const [conversationId, ids] of Object.entries(value.delivered ?? {})) {
    if (typeof conversationId !== 'string' || !Array.isArray(ids)) continue;
    delivered[conversationId] = ids.filter(id => typeof id === 'string').slice(-500);
  }
  const cards = {};
  for (const [planId, card] of Object.entries(value.cards ?? {})) {
    if (typeof planId !== 'string' || !card || typeof card !== 'object') continue;
    if (typeof card.messageId !== 'string' || typeof card.conversationId !== 'string') continue;
    cards[planId] = {conversationId: card.conversationId, messageId: card.messageId, state: typeof card.state === 'string' ? card.state : 'pending',
      digest: typeof card.digest === 'string' ? card.digest : '', at: Number(card.at) || 0};
  }
  const permissions = {};
  for (const [pid, card] of Object.entries(value.permissions ?? {}).slice(-200)) {
    if (!core.PERMIT_KEY.test(pid) || !card || typeof card !== 'object') continue;
    if (typeof card.conversationId !== 'string' || !card.conversationId) continue;
    if (typeof card.taskId !== 'string' || !card.taskId) continue;
    if (typeof card.messageId !== 'string' || !card.messageId) continue;
    permissions[pid] = {
      conversationId: card.conversationId,
      taskId: card.taskId,
      messageId: card.messageId,
      content: typeof card.content === 'string' ? card.content.slice(0, core.MAX_MESSAGE) : '',
    };
  }
  const review = {};
  for (const [key, record] of Object.entries(value.review ?? {}).slice(-200)) {    if (typeof key === 'string' && record && typeof record === 'object') {
      review[key] = {at: Number(record.at) || 0, reason: 'needs-review', notice: record.notice === true};
    }
  }
  const session = value.gateway && typeof value.gateway === 'object' ? value.gateway : {};
  const memory = {};
  for (const [key, card] of Object.entries(value.memory ?? {}).slice(-200)) {
    if (!core.MEMORY_KEY.test(key) || !card || typeof card !== 'object') continue;
    if (typeof card.channelId !== 'string' || !core.isSnowflake(card.channelId)) continue;
    if (typeof card.messageId !== 'string' || !card.messageId) continue;
    memory[key] = {
      channelId: card.channelId,
      messageId: card.messageId,
      content: typeof card.content === 'string' ? card.content.slice(0, core.MAX_MESSAGE) : '',
      at: Number(card.at) || 0,
    };
  }
  const confirms = {};
  for (const [key, record] of Object.entries(value.confirms ?? {}).slice(-200)) {
    if (!core.CONFIRM_KEY.test(key) || !record || typeof record !== 'object') continue;
    if (typeof record.conversationId !== 'string' || !record.conversationId) continue;
    if (typeof record.taskId !== 'string' || !record.taskId) continue;
    confirms[key] = {conversationId: record.conversationId, taskId: record.taskId, at: Number(record.at) || 0};
  }
  const seen = (list, cap) => (Array.isArray(list) ? list.filter(id => typeof id === 'string').slice(-cap) : []);
  return {
    version: STATE_VERSION,
    threads,
    delivered,
    cards,
    permissions,
    memory,
    review,
    confirms,
    partial: Object.fromEntries(Object.entries(value.partial ?? {}).filter(([, v]) => Number.isInteger(v) && v > 0).slice(-100)),
    lastSeen: Object.fromEntries(Object.entries(value.lastSeen ?? {}).filter(([k, v]) => core.isSnowflake(k) && core.isSnowflake(v)).slice(-300)),
    seenMessages: seen(value.seenMessages, 5000),
    seenInteractions: seen(value.seenInteractions, 5000),
    gateway: {
      sessionId: typeof session.sessionId === 'string' ? session.sessionId : '',
      seq: Number.isInteger(session.seq) ? session.seq : null,
      resumeUrl: typeof session.resumeUrl === 'string' ? session.resumeUrl : '',
    },
  };
}

function loadState(dir) {
  const file = path.join(dir, 'discord-state.json');
  try {
    const info = fs.lstatSync(file);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('state');
    if (process.platform !== 'win32' && (info.mode & 0o077)) throw new Error('state permissions');
    try {
      return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
    } catch (error) {
      // A torn or foreign state file must not crash-loop the service: keep it aside, start clean.
      const aside = path.join(dir, `discord-state.corrupt-${Date.now()}.json`);
      try { fs.renameSync(file, aside); } catch {}
      log('state-reset', {reason: String(error?.message ?? error).slice(0, 120)});
      return emptyState();
    }
  } catch (error) {
    if (error.code === 'ENOENT') return emptyState();
    throw error;
  }
}

function atomicWrite(file, text) {
  const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  const fd = fs.openSync(temp, 'w', 0o600);
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(temp, file);
      return;
    } catch (error) {
      // Windows: a reader holding the target briefly makes rename fail with EPERM/EBUSY.
      if (attempt >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) {
        try { fs.unlinkSync(temp); } catch {}
        throw error;
      }
      const until = Date.now() + 50 * (attempt + 1);
      while (Date.now() < until) { /* short synchronous back-off */ }
    }
  }
}

let stateDirty = false;
function saveState() {
  stateDirty = false;
  try {
    atomicWrite(path.join(stateDir, 'discord-state.json'), JSON.stringify(state));
  } catch (error) {
    stateDirty = true;  // retried by the next tick
    noteError('state-save', error);
  }
}

let lastAckAt = 0;
function writeHeartbeat(stateName) {
  const payload = {pid: process.pid, lastTickAt: Date.now() / 1000, status: stateName, lastEventAt: lastEventAt / 1000, lastAckAt: lastAckAt / 1000};
  try {
    atomicWrite(path.join(stateDir, 'discord-gateway.json'), JSON.stringify(payload));
  } catch (error) {
    noteError('heartbeat-write', error);  // never let a heartbeat write break reconnect logic
  }
}

// ---- REST with bucket and global rate-limit waits ----

const buckets = new Map();
let globalUntil = 0;
const errorLogAt = new Map();

function routeKey(method, route) {
  // Interaction/webhook tokens never become map keys (unbounded growth, token in memory dumps).
  return `${method} ${route.replace(/\/(interactions|webhooks)\/(\d+)\/[^/]+/, '/$1/$2/:token').replace(/\/\d{16,22}/g, '/:id')}`;
}

async function request(method, route, {body, auth = true, reason} = {}) {
  const key = routeKey(method, route);
  const interaction = route.startsWith('/interactions/');
  let failures = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // Interaction callbacks have their own budget and a 3 s deadline: never park them behind a global wait.
    const wait = Math.max(0, (buckets.get(key) ?? 0) - Date.now(), interaction ? 0 : globalUntil - Date.now());
    if (wait > 0) await sleep(Math.min(wait, 60000));
    const headers = {};
    if (auth) headers.authorization = `Bot ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (reason) headers['x-audit-log-reason'] = reason;
    let response;
    try {
      response = await fetch(API + route, {method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(interaction ? 5000 : 15000)});
    } catch (error) {
      // Network error or timeout: a short bounded retry instead of a hung event queue.
      failures += 1;
      if (failures > 2) throw new Error('rest-network');
      await sleep(1000 * failures);
      continue;
    }
    if (response.status >= 500 && failures < 2) {
      failures += 1;
      await sleep(1000 * failures * 2);
      continue;
    }
    const resetAfter = core.rateLimitWait({headers: response.headers});
    if (core.rateLimitExhausted(response.headers) && resetAfter > 0) buckets.set(key, Date.now() + resetAfter);
    if (response.status === 429) {
      const info = await response.json().catch(() => ({}));
      const ms = Math.max(core.rateLimitWait({status: 429, headers: response.headers, body: info}), 1000);
      const global = core.isGlobalLimit(response.headers) || info?.global === true;
      if (global) globalUntil = Date.now() + ms;
      else buckets.set(key, Date.now() + ms);
      log('rate-limit', {route: route.replace(/\/\d{16,22}/g, '/:id'), waitMs: ms, global});
      await sleep(ms);
      continue;
    }
    return response;
  }
  throw new Error('rate-limit');
}

function pruneBuckets() {
  const now = Date.now();
  for (const [key, until] of buckets) if (until < now) buckets.delete(key);
  for (const [key, at] of errorLogAt) if (now - at > 3600000) errorLogAt.delete(key);
}

async function jsonRequest(method, route, body, options = {}) {
  const response = await request(method, route, {...options, body});
  if (!response.ok) {
    log('rest-error', {method, route: route.replace(/\/\d{16,22}/g, '/:id'), status: response.status});
    throw new Error(`http-${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function noteError(key, error) {
  const now = Date.now();
  if (now - (errorLogAt.get(key) ?? 0) < 60000) return;
  errorLogAt.set(key, now);
  log('operation-error', {key, error: String(error?.message ?? error).slice(0, 200)});
}

// ---- gui_api bridge (one call at a time per conversation) ----

const guiChains = new Map();

// One resident `gui_api.py --serve` child answers fast DB requests line by line.
const guiWorker = {child: null, buffer: '', pending: [], starting: false};

function stopGuiWorker(reason) {
  const child = guiWorker.child;
  guiWorker.child = null;
  guiWorker.buffer = '';
  const pending = guiWorker.pending.splice(0);
  for (const item of pending) {
    clearTimeout(item.timer);
    item.reject(new Error(reason));
  }
  if (child) { try { child.kill(); } catch {} }
}

function guiWorkerChild() {
  if (guiWorker.child) return guiWorker.child;
  const python = process.env.PASEO_BOT_PYTHON;
  if (!python) throw new Error('python-env');
  const child = spawn(python, ['-X', 'utf8', GUI_API, '--state', stateDir, '--allow-submit', '--serve'], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  guiWorker.child = child;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    if (guiWorker.child !== child) return;
    guiWorker.buffer += chunk;
    if (guiWorker.buffer.length > 4000000) { stopGuiWorker('gui-output'); return; }
    let newline;
    while ((newline = guiWorker.buffer.indexOf('\n')) >= 0) {
      const line = guiWorker.buffer.slice(0, newline);
      guiWorker.buffer = guiWorker.buffer.slice(newline + 1);
      const item = guiWorker.pending.shift();
      if (!item) continue;
      clearTimeout(item.timer);
      try {
        const value = JSON.parse(line);
        if (value?.ok !== true) {
          log('gui-refused', {action: item.action});
          item.reject(new Error('gui-refused'));
        } else item.resolve(value.result);
      } catch {
        item.reject(new Error('gui-output'));
      }
    }
  });
  child.stderr.on('data', () => {});  // drained, never logged
  child.on('error', () => { if (guiWorker.child === child) stopGuiWorker('gui-spawn'); });
  child.on('close', code => {
    if (guiWorker.child === child) {
      log('gui-worker-exit', {code});
      stopGuiWorker('gui-exit');
    }
  });
  child.stdin.on('error', () => {});
  return child;
}

function invokeResident(request) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = guiWorkerChild(); } catch (error) { reject(error); return; }
    const item = {resolve, reject, action: request.action, timer: null};
    // A stuck request (lock wait, crash) restarts the worker; requests are answered strictly in order.
    item.timer = setTimeout(() => { log('gui-timeout', {action: request.action}); stopGuiWorker('gui-timeout'); }, 30000);
    guiWorker.pending.push(item);
    child.stdin.write(JSON.stringify(request) + '\n');
  });
}

function invokeGui(request) {
  // peek waits on a remote host (up to ~65 s); keep it off the resident worker.
  if (request.action !== 'peek') return invokeResident(request);
  return invokeOnce(request);
}

function invokeOnce(request) {
  return new Promise((resolve, reject) => {
    const python = process.env.PASEO_BOT_PYTHON;
    if (!python) {
      reject(new Error('python-env'));
      return;
    }
    const child = spawn(python, ['-X', 'utf8', GUI_API, '--state', stateDir, '--allow-submit'], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let out = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error('gui-timeout'));
    }, 60000);
    child.stdout.on('data', chunk => {
      out += chunk;
      if (out.length > 1000000) child.kill();
    });
    // Drain stderr so the child can never block; its contents are never logged.
    child.stderr.on('data', () => {});
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('gui-spawn'));
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        log('gui-exit', {action: request.action, code});
        reject(new Error('gui-exit'));
        return;
      }
      try {
        const value = JSON.parse(out);
        if (value?.ok !== true) {
          log('gui-refused', {action: request.action});
          reject(new Error('gui-refused'));
          return;
        }
        resolve(value.result);
      } catch {
        reject(new Error('gui-output'));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}

function gui(request) {
  const key = request.conversationId || request.requestId || request.action;
  const previous = guiChains.get(key) ?? Promise.resolve();
  const run = previous.then(() => invokeGui(request), () => invokeGui(request));
  guiChains.set(key, run.catch(() => {}));
  return run;
}

// ---- Discord helpers ----

async function postMessage(channelId, content, components) {
  const body = {content, allowed_mentions: {parse: []}};
  if (components) body.components = components;
  const sent = await jsonRequest('POST', `/channels/${channelId}/messages`, body);
  if (!sent?.id) throw new Error('post');
  return sent.id;
}

async function editMessage(channelId, messageId, body) {
  return jsonRequest('PATCH', `/channels/${channelId}/messages/${messageId}`, {...body, allowed_mentions: {parse: []}});
}

async function openThread(messageId, name) {
  const thread = await jsonRequest('POST', `/channels/${config.channelId}/messages/${messageId}/threads`,
    {name: core.threadName(name), auto_archive_duration: 1440});
  if (!core.isSnowflake(thread?.id)) throw new Error('thread');
  return thread.id;
}

async function interactionCallback(interaction, data) {
  await request('POST', `/interactions/${interaction.id}/${interaction.token}/callback`, {body: data, auth: false});
}

async function interactionFollowUp(interaction, data) {
  await request('PATCH', `/webhooks/${appId}/${interaction.token}/messages/@original`,
    {body: {...data, allowed_mentions: {parse: []}}, auth: false});
}

// Errors and "already handled" go to the clicker privately; the card itself is never overwritten.
async function interactionPrivate(interaction, content) {
  await request('POST', `/webhooks/${appId}/${interaction.token}`,
    {body: {content: content.slice(0, core.MAX_MESSAGE), flags: 64, allowed_mentions: {parse: []}}, auth: false}).catch(() => {});
}

async function interactionEphemeral(interaction, content) {
  await interactionCallback(interaction, {type: 4, data: {content: content.slice(0, core.MAX_MESSAGE), flags: 64}});
}

// ---- attachments ----

async function fetchAttachment(attachment) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(attachment.url, {signal: controller.signal, redirect: 'error'});
    if (!response.ok) return null;
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > core.ATTACHMENT_MAX_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > core.ATTACHMENT_MAX_BYTES) return null;
    return bytes.toString('utf8');
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function messageText(message) {
  let text = typeof message.content === 'string' ? message.content : '';
  const attachments = Array.isArray(message.attachments) ? message.attachments.slice(0, 10) : [];
  for (const attachment of attachments) {
    let content = null;
    if (core.attachmentFetchable(attachment)) content = await fetchAttachment(attachment);
    text = core.appendAttachment(text, attachment, content);
  }
  return text.slice(0, core.TEXT_LIMIT);
}

// ---- events ----

function seen(listName, id) {
  return state[listName].includes(id);
}

async function submit(conversationId, messageKey, text, selection) {
  try {
    await gui({action: 'start', requestId: conversationId, messageId: messageKey, text, selection});
    return true;
  } catch (error) {
    noteError(`submit:${conversationId}`, error);
    state.review[conversationId] = {at: Date.now(), reason: 'needs-review', notice: false};
    return false;
  }
}

// "typing…" is the immediate acknowledgement (no extra permission needed); it lasts ~10 s per call.
const typingAt = new Map();
function typing(channelId, force = false) {
  const last = typingAt.get(channelId) ?? 0;
  if (!force && Date.now() - last < 8000) return;
  typingAt.set(channelId, Date.now());
  request('POST', `/channels/${channelId}/typing`).catch(() => {});
}

function markSeen(channelId, messageId) {
  // Highest message id seen per channel/thread, used to catch up after a fresh IDENTIFY.
  const previous = state.lastSeen[channelId];
  if (!previous || BigInt(messageId) > BigInt(previous)) state.lastSeen[channelId] = messageId;
}

async function handleMessage(message) {
  if (!core.acceptMessage(config, message, state.threads)) return;
  if (seen('seenMessages', message.id)) return;
  state.seenMessages = core.remember(state.seenMessages, message.id, 5000);
  markSeen(message.channel_id, message.id);
  saveState();
  typing(message.channel_id, true);
  const text = await messageText(message);
  if (!text.trim()) {
    log('empty-message', {id: message.id});
    return;
  }
  const thread = core.trackedThread(config, state.threads, message.channel_id);
  if (thread && !core.isMemoryReview(thread.conversationId)) {
    const record = state.threads[message.channel_id];
    // A new accepted message always revives a dormant thread.
    record.lastActivityAt = Date.now();
    record.failures = 0;
    record.dormant = false;
    const hold = state.review[thread.conversationId];
    if (hold) {
      // The hold stops new input only; replies, cards and notices keep flowing.
      log('review-hold', {id: message.id});
      const notice = core.holdNotice(hold);
      if (notice) {
        hold.notice = true;
        saveState();
        await postMessage(message.channel_id, notice).catch(() => {});
      } else {
        saveState();
      }
      return;
    }
    saveState();
    try {
      await gui({action: 'send', conversationId: thread.conversationId, messageId: `d-${message.id}`, text});
    } catch (error) {
      noteError(`send:${thread.conversationId}`, error);
      state.review[thread.conversationId] = {at: Date.now(), reason: 'needs-review', notice: true};
      saveState();
      await postMessage(message.channel_id, '요청을 접수하지 못했어요. 중복을 막으려고 자동으로 다시 보내지 않아요. /resolve 로 다시 연 뒤 한 번 더 보내 주세요.').catch(() => {});
    }
    return;
  }
  if (message.channel_id !== config.channelId) return;
  let threadId;
  try {
    threadId = await openThread(message.id, text);
  } catch (error) {
    noteError('thread', error);
    await postMessage(config.channelId, '스레드를 만들지 못했어요. 잠시 후 다시 보내 주세요.').catch(() => {});
    return;
  }
  const conversationId = `d-${message.id}`;
  state.threads[threadId] = newThread(conversationId);
  saveState();
  typing(threadId, true);
  const started = await submit(conversationId, conversationId, text, core.DEFAULT_SELECTION);
  if (!started) {
    state.review[conversationId].notice = true;
    saveState();
    await postMessage(threadId, '요청을 접수하지 못했어요. 중복을 막으려고 자동으로 다시 보내지 않아요. /resolve 로 다시 연 뒤 한 번 더 보내 주세요.').catch(() => {});
  }
}

async function latestPlan(conversationId, planId) {
  const synced = await gui({action: 'sync', conversationId});
  const plans = Array.isArray(synced?.plans) ? synced.plans : [];
  return plans.find(plan => plan?.id === planId) ?? null;
}

async function handleComponent(interaction, parsed) {
  if (parsed.action === 'memory-approve' || parsed.action === 'memory-reject') {
    const entry = state.memory[parsed.key];
    if (!entry || entry.channelId !== interaction.channel_id) {
      await interactionPrivate(interaction, '이미 처리된 기억 요청이에요.');
      return;
    }
    const op = parsed.action === 'memory-approve' ? 'approve' : 'reject';
    try {
      await gui({action: 'memory', op, key: parsed.key, requestId: `d-${interaction.id}`});
    } catch (error) {
      noteError(`memory:${parsed.key}`, error);
      await interactionPrivate(interaction, '기억 요청을 처리하지 못했어요. 상태를 확인해 주세요.');
      return;
    }
    delete state.memory[parsed.key];
    saveState();
    await editMessage(entry.channelId, entry.messageId, core.memoryEdit(entry.content, op)).catch(() => {});
    return;
  }
  const thread = core.trackedThread(config, state.threads, interaction.channel_id);
  if (!thread) return;
  if (parsed.action === 'permit-allow' || parsed.action === 'permit-deny') {
    const entry = state.permissions[parsed.pid];
    if (!entry || entry.conversationId !== thread.conversationId) {
      await interactionPrivate(interaction, '이미 처리된 권한 요청이에요.');
      return;
    }
    const decision = parsed.action === 'permit-allow' ? 'allow' : 'deny';
    try {
      await gui({action: 'permission', conversationId: entry.conversationId, taskId: entry.taskId,
        pid: parsed.pid, decision, requestId: `d-${interaction.id}`});
    } catch (error) {
      noteError(`permission:${entry.taskId}`, error);
      await interactionPrivate(interaction, '권한 요청을 처리하지 못했어요. 상태를 확인해 주세요.');
      return;
    }
    delete state.permissions[parsed.pid];
    const record = state.threads[interaction.channel_id];
    if (record) record.lastActivityAt = Date.now();
    saveState();
    const content = entry.content || (typeof interaction.message?.content === 'string' ? interaction.message.content : '');
    await editMessage(interaction.channel_id, entry.messageId, core.permissionEdit(content, decision)).catch(() => {});
    return;
  }
  if (parsed.action === 'confirm' || parsed.action === 'dismiss') {
    const entry = state.confirms[parsed.short];
    if (!entry || entry.conversationId !== thread.conversationId) {
      await interactionFollowUp(interaction, {content: '만료된 확인이에요. /cancel 로 다시 요청해 주세요.', components: []}).catch(() => {});
      return;
    }
    delete state.confirms[parsed.short];
    saveState();
    if (parsed.action === 'dismiss') {
      await interactionFollowUp(interaction, {content: '취소하지 않았어요.', components: []}).catch(() => {});
      return;
    }
    try {
      await gui({action: 'control', conversationId: entry.conversationId, taskId: entry.taskId, op: 'cancel', requestId: `d-${interaction.id}`});
    } catch (error) {
      noteError(`control:${entry.taskId}`, error);
      await interactionFollowUp(interaction, {content: '취소 요청을 접수하지 못했어요. 상태를 확인해 주세요.', components: []}).catch(() => {});
      return;
    }
    const record = state.threads[interaction.channel_id];
    if (record) record.lastActivityAt = Date.now();
    saveState();
    await interactionFollowUp(interaction, {content: `취소 요청을 접수했어요. (${entry.taskId})`, components: []}).catch(() => {});
    return;
  }
  let plan = null;
  try {
    plan = await latestPlan(thread.conversationId, parsed.planId);
  } catch (error) {
    noteError(`plan-sync:${parsed.planId}`, error);
  }
  if (!plan) {
    await interactionPrivate(interaction, '계획을 찾지 못했어요. 새 계획을 요청해 주세요.');
    return;
  }
  if (plan.state !== 'pending') {
    // Double click or decided elsewhere: show the real outcome instead of an error.
    const card = state.cards[parsed.planId];
    if (card) { card.state = plan.state; saveState(); }
    await interactionFollowUp(interaction, core.planCardEdit(plan)).catch(() => {});
    return;
  }
  const shown = state.cards[parsed.planId]?.digest;
  if (parsed.action === 'approve' && shown && shown !== plan.digest) {
    await interactionPrivate(interaction, '카드를 올린 뒤 계획이 바뀌었어요. 새 카드를 확인해 주세요.');
    return;
  }
  let outcome = plan;
  try {
    if (parsed.action === 'approve') {
      // Approve exactly what the card showed.
      await gui({action: 'approve', conversationId: thread.conversationId, planId: parsed.planId, digest: shown || plan.digest});
      outcome = {...plan, state: 'approved'};
    } else {
      await gui({action: 'reject', conversationId: thread.conversationId, planId: parsed.planId});
      outcome = {...plan, state: 'cancelled'};
    }
  } catch (error) {
    noteError(`plan:${parsed.planId}`, error);
    await interactionPrivate(interaction, '계획을 처리하지 못했어요. 잠시 후 다시 눌러 주세요.');
    return;
  }
  const card = state.cards[parsed.planId];
  if (card) card.state = outcome.state;
  const record = state.threads[interaction.channel_id];
  if (record) record.lastActivityAt = Date.now();
  saveState();
  await interactionFollowUp(interaction, core.planCardEdit(outcome)).catch(() => {});
}

async function handleTaskCommand(interaction) {
  const options = core.commandOptions(interaction);
  const text = typeof options.text === 'string' ? options.text.trim() : '';
  if (!text) {
    await interactionFollowUp(interaction, {content: '요청 내용이 필요해요.'}).catch(() => {});
    return;
  }
  const selection = core.selectionFromOptions(options);
  // Reject an unknown/disabled project before a starter message or thread exists.
  if (selection.project !== 'auto') {
    const projects = await ensureProjects();
    if (!core.enabledProject(projects, selection.project)) {
      const suggestions = core.projectSuggestions(projects, selection.project);
      const content = suggestions.length
        ? `프로젝트를 찾지 못했어요: ${selection.project}. 비슷한 프로젝트: ${suggestions.join(', ')}`
        : `프로젝트를 찾지 못했어요: ${selection.project}.`;
      await interactionFollowUp(interaction, {content}).catch(() => {});
      return;
    }
  }
  try {
    const starterId = await postMessage(config.channelId, text.slice(0, core.MAX_MESSAGE));
    const threadId = await openThread(starterId, text);
    const conversationId = `d-${starterId}`;
    state.threads[threadId] = newThread(conversationId);
    saveState();
    const started = await submit(conversationId, conversationId, text, selection);
    if (!started) {
      await postMessage(threadId, '요청을 접수하지 못했어요. 자동으로 다시 보내지 않아요. 대화를 확인해 주세요.').catch(() => {});
      await interactionFollowUp(interaction, {content: '요청을 접수하지 못했어요.'}).catch(() => {});
      return;
    }
    await interactionFollowUp(interaction, {content: `스레드에서 진행할게요: <#${threadId}>`}).catch(() => {});
  } catch (error) {
    noteError('task-command', error);
    await interactionFollowUp(interaction, {content: '요청을 시작하지 못했어요.'}).catch(() => {});
  }
}

async function handleStatusCommand(interaction) {
  try {
    const result = await gui({action: 'status'});
    await interactionFollowUp(interaction, {content: core.statusText(result)});
  } catch (error) {
    noteError('status-command', error);
    await interactionFollowUp(interaction, {content: '상태를 확인하지 못했어요.'}).catch(() => {});
  }
}

// ---- task controls: /cancel /pause /resume /peek (Dori D4/D5) ----

const taskCache = new Map();

async function threadTasks(conversationId, fresh = false) {
  const cached = taskCache.get(conversationId);
  if (!fresh && cached && Date.now() - cached.at < 60000) return cached.tasks;
  const synced = await gui({action: 'sync', conversationId, scope: conversationId});
  const tasks = Array.isArray(synced?.tasks) ? synced.tasks : [];
  taskCache.set(conversationId, {at: Date.now(), tasks});
  return tasks;
}

async function resolveThreadTask(interaction, requested) {
  const thread = core.trackedThread(config, state.threads, interaction.channel_id);
  if (!thread) return {error: '스레드 안에서만 쓸 수 있어요.'};
  let tasks;
  try {
    tasks = await threadTasks(thread.conversationId, true);
  } catch (error) {
    noteError(`tasks:${thread.conversationId}`, error);
    return {error: '작업 목록을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.'};
  }
  const choice = core.resolveTaskChoice(tasks, typeof requested === 'string' ? requested : '');
  if (choice.state === 'one') return {thread, taskId: choice.taskId};
  if (choice.state === 'none') return {error: '이 스레드에 진행 중인 작업이 없어요.'};
  if (choice.state === 'many') return {error: core.taskListText(tasks)};
  return {error: `작업을 찾지 못했어요: ${String(requested).slice(0, 80)}`};
}

async function handleControlCommand(interaction, name) {
  const options = core.commandOptions(interaction);
  const picked = await resolveThreadTask(interaction, options.task);
  if (picked.error) {
    await interactionFollowUp(interaction, {content: picked.error.slice(0, core.MAX_MESSAGE)}).catch(() => {});
    return;
  }
  const {thread, taskId} = picked;
  if (name === 'cancel') {
    let short = core.confirmKey();
    while (state.confirms[short]) short = core.confirmKey();
    state.confirms[short] = {conversationId: thread.conversationId, taskId, at: Date.now()};
    const keys = Object.keys(state.confirms);
    for (const key of keys.slice(0, Math.max(0, keys.length - 200))) delete state.confirms[key];
    saveState();
    await interactionFollowUp(interaction, core.confirmCard(taskId, short)).catch(() => {});
    return;
  }
  if (name === 'peek') {
    try {
      const out = await gui({action: 'peek', conversationId: thread.conversationId, taskId, tail: 40});
      await interactionFollowUp(interaction, {content: core.peekBlock(typeof out?.text === 'string' ? out.text : '')});
    } catch (error) {
      noteError(`peek:${taskId}`, error);
      await interactionFollowUp(interaction, {content: '로그를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.'}).catch(() => {});
    }
    return;
  }
  const op = name;
  try {
    await gui({action: 'control', conversationId: thread.conversationId, taskId, op, requestId: `d-${interaction.id}`});
  } catch (error) {
    noteError(`control:${taskId}`, error);
    await interactionFollowUp(interaction, {content: '요청을 접수하지 못했어요. 상태를 확인해 주세요.'}).catch(() => {});
    return;
  }
  const text = op === 'pause' ? `멈춤 요청을 접수했어요. 확인되면 알려드릴게요. (${taskId})`
    : `재개 요청을 접수했어요. (${taskId})`;
  const record = state.threads[interaction.channel_id];
  if (record) record.lastActivityAt = Date.now();
  await interactionFollowUp(interaction, {content: text}).catch(() => {});
}

// Local-only: clears the hold and revives the thread. It never resubmits the
// message that was dropped while the hold was active.
async function handleResolveCommand(interaction) {
  const record = core.trackedThread(config, state.threads, interaction.channel_id);
  if (!record) {
    await interactionEphemeral(interaction, '스레드 안에서만 쓸 수 있어요.').catch(() => {});
    return;
  }
  delete state.review[record.conversationId];
  record.lastActivityAt = Date.now();
  record.failures = 0;
  record.dormant = false;
  saveState();
  log('resolve', {conversationId: record.conversationId});
  await interactionEphemeral(interaction, '다시 열었어요. 이어서 메시지를 보내 주세요.').catch(() => {});
}

let projectsCache = [];
let projectsAt = 0;

function projectCache() {
  return projectsCache;
}

async function ensureProjects() {
  if (!projectsCache.length || Date.now() - projectsAt > 60000) await refreshProjects();
  return projectsCache;
}

async function handleAutocomplete(interaction) {
  const name = interaction.data?.name;
  const focused = (interaction.data?.options ?? []).find(option => option?.focused === true);
  const typed = typeof focused?.value === 'string' ? focused.value : '';
  if (core.CONTROL_COMMANDS.includes(name)) {
    const thread = core.trackedThread(config, state.threads, interaction.channel_id);
    let tasks = [];
    if (thread) {
      const cached = taskCache.get(thread.conversationId);
      if (cached && Date.now() - cached.at < 60000) tasks = cached.tasks;
      else threadTasks(thread.conversationId).catch(() => {});
    }
    await interactionCallback(interaction, {type: 8, data: {choices: core.taskChoices(tasks, typed)}});
    return;
  }
  const projects = projectCache();
  const choices = core.autocompleteChoices(projects, typed);
  // Answer inside the 3 s budget; a cold cache returns an empty list instead of waiting.
  await interactionCallback(interaction, {type: 8, data: {choices}});
  if (!projects.length) refreshProjects().catch(() => {});
}

async function handleInteraction(interaction) {
  if (!core.acceptInteraction(config, interaction, state.threads)) {
    const user = interaction?.member?.user ?? interaction?.user;
    const owner = user && config.ownerIds.includes(user.id);
    await interactionEphemeral(interaction, owner ? '이 채널에서는 쓸 수 없어요. 봇 채널이나 봇이 만든 스레드에서 써 주세요.' : '권한이 없어요.').catch(() => {});
    return;
  }
  if (interaction.type === 4) {
    await handleAutocomplete(interaction).catch(error => noteError('autocomplete', error));
    return;
  }
  if (seen('seenInteractions', interaction.id)) return;
  if (interaction.type === 3) {
    const parsed = core.parseCustomId(interaction.data?.custom_id);
    if (!parsed) {
      await interactionEphemeral(interaction, '오래된 버튼이라 처리할 수 없어요.').catch(() => {});
      return;
    }
    state.seenInteractions = core.remember(state.seenInteractions, interaction.id, 5000);
    saveState();
    // Deferred update acknowledges within the 3 s budget; the work follows.
    try {
      await interactionCallback(interaction, {type: 6});
    } catch (error) {
      noteError('button-ack', error);
      return;
    }
    queue(() => handleComponent(interaction, parsed));
    return;
  }
  if (interaction.type === 2) {
    const name = interaction.data?.name;
    state.seenInteractions = core.remember(state.seenInteractions, interaction.id, 5000);
    saveState();
    if (name === 'resolve') {
      // No Paseo call is needed, so answer ephemerally without deferring.
      handleResolveCommand(interaction).catch(error => noteError('resolve', error));
      return;
    }
    try {
      await interactionCallback(interaction, {type: 5, data: (name === 'status' || core.CONTROL_COMMANDS.includes(name)) ? {flags: 64} : {}});
    } catch (error) {
      noteError('command-ack', error);
      return;
    }
    queue(async () => {
      if (name === 'status') await handleStatusCommand(interaction);
      else if (name === 'task') await handleTaskCommand(interaction);
      else if (core.CONTROL_COMMANDS.includes(name)) await handleControlCommand(interaction, name);
      else await interactionFollowUp(interaction, {content: '알 수 없는 명령이에요.'}).catch(() => {});
    });
  }
}

let eventQueue = Promise.resolve();

// Events are serialized so dedup and per-conversation order stay deterministic;
// interaction ACKs happen before the work is queued.
function queue(task) {
  eventQueue = eventQueue.then(task).catch(error => noteError('queue', error));
}

// ---- outbound: manager replies, stage notices and plan cards ----

async function refreshProjects() {
  try {
    const result = await gui({action: 'status'});
    if (Array.isArray(result?.projects)) {
      projectsCache = result.projects;
      projectsAt = Date.now();
    }
  } catch (error) {
    noteError('projects', error);
  }
}

function touch(record) {
  record.lastActivityAt = Date.now();
}

async function deliver(threadId, record, synced) {
  const conversationId = record.conversationId;
  const messages = core.undelivered(synced?.messages, state.delivered[conversationId]);
  for (const message of messages) {
    const text = core.formatOutbound(message);
    if (!text.trim()) continue;
    const permission = message?.payload?.permission;
    const approval = message?.payload?.memoryApproval;
    const components = core.permissionComponents(permission) || core.memoryComponents(approval);
    const chunks = core.chunkText(text);
    let lastId = '';
    let lastChunk = '';
    // Chunk progress survives a failure mid-message, so a retry never reposts earlier chunks.
    const progressKey = `${conversationId}:${message.id}`;
    const already = Number(state.partial[progressKey]) || 0;
    for (const [index, chunk] of chunks.entries()) {
      if (index < already) continue;
      const last = index === chunks.length - 1;
      lastId = await postMessage(threadId, chunk, last ? components : undefined);
      if (last) lastChunk = chunk;
      else { state.partial[progressKey] = index + 1; saveState(); }
    }
    delete state.partial[progressKey];
    if (components && lastId && permission) {
      state.permissions[permission.pid] = {
        conversationId,
        taskId: permission.taskId,
        messageId: lastId,
        content: lastChunk.slice(0, core.MAX_MESSAGE),
      };
    }
    if (components && lastId && approval && core.MEMORY_KEY.test(approval.key)) {
      state.memory[approval.key] = {
        channelId: threadId,
        messageId: lastId,
        content: lastChunk.slice(0, core.MAX_MESSAGE),
        at: Date.now(),
      };
    }
    const resolved = message?.payload?.permissionResolved;
    if (resolved && typeof resolved.pid === 'string' && core.PERMIT_KEY.test(resolved.pid)) {
      const entry = state.permissions[resolved.pid];
      if (entry) {
        await editMessage(threadId, entry.messageId, core.permissionResolvedEdit(entry.content, text)).catch(() => {});
        delete state.permissions[resolved.pid];
      }
    }
    state.delivered[conversationId] = core.cappedAppend(state.delivered[conversationId], [message.id], 500);
    if (!core.isMemoryReview(conversationId)) touch(record);
    saveState();
  }
  for (const plan of Array.isArray(synced?.plans) ? synced.plans : []) {
    if (!plan?.id || !core.PLAN_ID.test(plan.id)) continue;
    const card = state.cards[plan.id];
    if (plan.state === 'pending' && !card) {
      const body = core.planCard(plan);
      const messageId = await postMessage(threadId, body.content, body.components);
      // The digest shown on the card is the one the 접수 button approves.
      state.cards[plan.id] = {conversationId, messageId, state: 'pending', digest: plan.digest ?? '', at: Date.now()};
      touch(record);
      saveState();
    } else if (card && plan.state !== 'pending' && card.state === 'pending') {
      await editMessage(threadId, card.messageId, core.planCardEdit(plan)).catch(error => {
        if (!/http-404/.test(String(error?.message))) throw error;  // a deleted card is simply done
      });
      card.state = plan.state;
      touch(record);
      saveState();
    }
  }
  // A pending card whose plan left the 10-plan window for a day is expired, not polled forever.
  const listed = new Set((Array.isArray(synced?.plans) ? synced.plans : []).map(plan => plan?.id));
  for (const [planId, card] of Object.entries(state.cards)) {
    if (card.conversationId === conversationId && card.state === 'pending' && !listed.has(planId)
        && Date.now() - (card.at || 0) > 86400000) {
      card.state = 'expired';
      saveState();
    }
  }
}

function pendingCard(conversationId) {
  return Object.values(state.cards).some(card => card.conversationId === conversationId && card.state === 'pending');
}

let outboundRunning = false;

async function outboundTick() {
  if (outboundRunning) return;
  outboundRunning = true;
  try {
    const now = Date.now();
    const entries = [];
    for (const [threadId, record] of Object.entries(state.threads)) {
      if (!core.isSnowflake(threadId) || record.parentId !== config.channelId) continue;
      // A needs-review hold blocks new input only; replies, cards and notices keep flowing.
      const tier = core.threadTier({...record, pendingCard: pendingCard(record.conversationId)}, record.sync, now);
      entries.push({id: threadId, tier, polledAt: record.polledAt});
    }
    for (const threadId of core.syncSelection(entries, now)) {
      const record = state.threads[threadId];
      if (!record) continue;
      record.polledAt = now;
      let synced;
      try {
        // scope keeps sync.tasks limited to this conversation for the tier check.
        synced = await gui({action: 'sync', conversationId: record.conversationId, scope: record.conversationId});
      } catch (error) {
        record.failures += 1;
        noteError(`sync:${record.conversationId}`, error);
        if (record.failures >= 3 && !record.dormant && !core.isMemoryReview(record.conversationId)) {
          record.dormant = true;
          log('sync-dormant', {conversationId: record.conversationId, failures: record.failures});
          await postMessage(threadId, '이 대화의 상태를 가져오지 못해 자동 갱신을 멈췄어요. 새 메시지를 보내면 다시 시도해요.').catch(() => {});
        }
        saveState();
        continue;
      }
      record.failures = 0;
      if (!synced || synced.configured === false) {
        saveState();
        continue;
      }
      taskCache.set(record.conversationId, {at: Date.now(), tasks: Array.isArray(synced.tasks) ? synced.tasks : []});
      record.sync = core.syncSummary(synced);
      // The manager is still working on a reply: keep "typing…" visible in the thread.
      if (['queued', 'prepared', 'waiting'].includes(synced.deliveryState) && !core.isMemoryReview(record.conversationId)) typing(threadId);
      // The review channel stays warm (60 s), never hot: no thread activity to track.
      if (core.isMemoryReview(record.conversationId)) record.lastActivityAt = now - core.HOT_MS - 1000;
      try {
        await deliver(threadId, record, synced);
      } catch (error) {
        noteError(`deliver:${record.conversationId}`, error);
        // 10003 Unknown Channel / 404: the thread was deleted; stop polling it.
        if (/http-404/.test(String(error?.message))) {
          record.dormant = true;
          log('thread-gone', {conversationId: record.conversationId});
        }
      }
      saveState();
    }
  } finally {
    outboundRunning = false;
  }
}

// ---- gateway connection ----

let socket = null;
let heartbeatTimer = null;
let ackTimer = null;
let acked = true;
let heartbeatMs = 0;
let sequence = null;
let savedSeq = null;
let sessionId = '';
let resumeUrl = '';
let reconnectAttempt = 0;
let reconnectTimer = null;
let stopped = false;

function setStatus(value) {
  status = value;
  writeHeartbeat(status);
}

function send(payload) {
  if (socket && socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function startHeartbeat(interval) {
  clearInterval(heartbeatTimer);
  clearTimeout(ackTimer);
  heartbeatMs = interval;
  const jitter = core.heartbeatInterval(interval, Math.random());
  heartbeatTimer = setTimeout(() => {
    heartbeatTimer = setInterval(() => beat(), interval);
    beat();
  }, jitter);
}

function abandonSocket(reason) {
  // Half-open TCP (sleep, Wi-Fi switch) may never deliver a close event: detach and reconnect now.
  const ws = socket;
  socket = null;
  log(reason);
  try { ws?.close(4000, reason); } catch {}
  scheduleReconnect();
}

function beat(requested = false) {
  if (!acked && !requested) {
    abandonSocket('zombie');
    return;
  }
  acked = false;
  send({op: 1, d: sequence});
  clearTimeout(ackTimer);
  ackTimer = setTimeout(() => {
    if (!acked) abandonSocket('heartbeat-ack-timeout');
  }, heartbeatMs + 5000);
}

async function identifyOrResume() {
  if (core.shouldResume(sessionId, sequence)) {
    send({op: 6, d: {token, session_id: sessionId, seq: sequence}});
  } else {
    send({op: 2, d: {token, intents: INTENTS, properties: {os: process.platform, browser: 'paseo-bot', device: 'paseo-bot'}}});
  }
}

function scheduleReconnect() {
  if (stopped || fatal) return;
  clearInterval(heartbeatTimer);
  clearTimeout(ackTimer);
  heartbeatTimer = null;
  clearTimeout(reconnectTimer);
  reconnectAttempt += 1;
  const delay = core.reconnectDelay(reconnectAttempt, Math.random());
  setStatus('connecting');
  log('reconnect', {delayMs: delay, attempt: reconnectAttempt});
  reconnectTimer = setTimeout(connect, delay);
}

function connect() {
  if (stopped || fatal) return;
  const base = core.shouldResume(sessionId, sequence) && resumeUrl ? resumeUrl : 'wss://gateway.discord.gg';
  const url = `${base.replace(/\/$/, '')}/?v=10&encoding=json`;
  setStatus('connecting');
  let ws;
  try {
    ws = new WebSocket(url);
  } catch (error) {
    log('connect-error', {error: String(error?.message ?? error)});
    scheduleReconnect();
    return;
  }
  socket = ws;
  acked = true;
  ws.addEventListener('message', event => {
    if (socket !== ws) return;  // a detached (zombie) socket can still emit late events
    let payload;
    try {
      payload = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'));
    } catch {
      return;
    }
    handlePayload(payload);
  });
  ws.addEventListener('close', event => {
    if (socket !== ws) return;  // already abandoned and reconnecting
    clearInterval(heartbeatTimer);
    clearTimeout(ackTimer);
    heartbeatTimer = null;
    socket = null;
    if (stopped) return;
    if (core.fatalClose(event.code)) {
      fatal = true;
      setStatus('error');
      log('fatal-close', {code: event.code});
      // 4: authentication/intents problem the owner must fix; the service waits longer before retrying.
      setTimeout(() => process.exit(4), 100);
      return;
    }
    if (event.code === 4007 || event.code === 4009) {
      // Invalid seq / session timed out: a resume would fail again.
      sessionId = '';
      sequence = null;
      state.gateway = {};
      saveState();
    }
    log('gateway-close', {code: event.code});
    scheduleReconnect();
  });
  ws.addEventListener('error', () => log('gateway-error'));
}

function handlePayload(payload) {
  const op = payload?.op;
  if (Number.isInteger(payload?.s)) {
    sequence = payload.s;
    state.gateway = {sessionId, seq: sequence, resumeUrl};
  }
  if (op === 10) {
    const interval = Number(payload.d?.heartbeat_interval);
    if (!Number.isFinite(interval) || interval <= 0) {
      log('hello-invalid');
      try { socket?.close(4000, 'hello'); } catch {}
      return;
    }
    startHeartbeat(interval);
    identifyOrResume();
    return;
  }
  if (op === 11) {
    acked = true;
    lastAckAt = Date.now();
    clearTimeout(ackTimer);
    return;
  }
  if (op === 1) {
    beat(true);  // server asked for a heartbeat now; not a missed ACK
    return;
  }
  if (op === 7) {
    log('reconnect-requested');
    try { socket?.close(4000, 'reconnect'); } catch {}
    return;
  }
  if (op === 9) {
    const resumable = payload.d === true && core.shouldResume(sessionId, sequence);
    log('invalid-session', {resumable});
    if (!resumable) {
      sessionId = '';
      sequence = null;
      state.gateway = {};
      saveState();
    }
    try { socket?.close(4000, 'invalid-session'); } catch {}
    return;
  }
  if (op !== 0) return;
  lastEventAt = Date.now();
  const type = payload.t;
  if (type === 'READY') {
    sessionId = payload.d?.session_id ?? '';
    resumeUrl = payload.d?.resume_gateway_url ?? '';
    appId = payload.d?.user?.id ?? appId;
    sequence = payload.d?.s ?? sequence;
    state.gateway = {sessionId, seq: sequence, resumeUrl};
    saveState();
    reconnectAttempt = 0;
    readyAt = Date.now();
    setStatus('connected');
    log('ready', {guilds: Array.isArray(payload.d?.guilds) ? payload.d.guilds.length : 0});
    if (appId) registerCommands().catch(error => noteError('commands', error));
    // A fresh session does not replay events from the downtime: fetch what the owner sent meanwhile.
    queue(() => catchUp());
    return;
  }
  if (type === 'RESUMED') {
    reconnectAttempt = 0;
    readyAt = Date.now();
    setStatus('connected');
    log('resumed');
    return;
  }
  if (type === 'MESSAGE_CREATE') {
    queue(() => handleMessage(payload.d));
    return;
  }
  if (type === 'INTERACTION_CREATE') {
    handleInteraction(payload.d).catch(error => noteError('interaction', error));
  }
}

let readyAt = 0;

async function catchUp() {
  // Channel plus threads active in the last day, oldest first, through the same accept/dedup path.
  const channels = [config.channelId, ...Object.entries(state.threads)
    .filter(([id, record]) => id !== config.channelId && !record.dormant && Date.now() - (record.lastActivityAt || 0) < 86400000)
    .map(([id]) => id)];
  let replayed = 0;
  for (const channelId of channels.slice(0, 20)) {
    const after = state.lastSeen[channelId];
    if (!after) continue;
    let messages;
    try {
      messages = await jsonRequest('GET', `/channels/${channelId}/messages?after=${after}&limit=50`);
    } catch (error) {
      noteError(`catchup:${channelId}`, error);
      continue;
    }
    if (!Array.isArray(messages)) continue;
    for (const message of messages.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))) {
      if (!message.guild_id) message.guild_id = config.guildId;  // REST message objects omit guild_id
      if (!message.channel_id) message.channel_id = channelId;
      await handleMessage(message);
      replayed += 1;
    }
  }
  if (replayed) log('catch-up', {messages: replayed});
}

async function registerCommands() {
  await jsonRequest('PUT', `/applications/${appId}/guilds/${config.guildId}/commands`, core.commandDefinitions());
  log('commands-registered');
}

// ---- start / stop ----

async function main() {
  stateDir = argState(process.argv.slice(2));
  try {
    token = await readToken();
  } catch {
    log('token-invalid');
    process.exit(3);
    return;
  }
  try {
    config = readConfig(stateDir);
  } catch (error) {
    const disabled = error.message === 'disabled';
    log('config-invalid', {disabled});
    process.exit(disabled ? 0 : 3);
    return;
  }
  try {
    state = loadState(stateDir);
  } catch {
    log('state-invalid');
    process.exit(3);
    return;
  }
  if (!state.threads[config.channelId]) {
    state.threads[config.channelId] = memoryReviewThread();
    saveState();
  }
  // One gateway per state directory: an orphaned second process would answer every message twice.
  const lockFile = path.join(stateDir, 'discord-gateway.lock');
  try {
    const other = Number(fs.readFileSync(lockFile, 'utf8').trim());
    if (Number.isInteger(other) && other > 0 && other !== process.pid) {
      try { process.kill(other, 0); log('already-running', {pid: other}); process.exit(5); return; } catch {}
    }
  } catch {}
  atomicWrite(lockFile, String(process.pid));
  process.on('exit', () => {
    try { if (fs.readFileSync(lockFile, 'utf8').trim() === String(process.pid)) fs.unlinkSync(lockFile); } catch {}
  });
  sessionId = state.gateway.sessionId ?? '';
  sequence = Number.isInteger(state.gateway.seq) ? state.gateway.seq : null;
  resumeUrl = state.gateway.resumeUrl ?? '';
  writeHeartbeat('connecting');
  const startedAt = Date.now();
  setInterval(() => {
    // Connected-looking but no READY/RESUMED for 10 minutes: let the supervisor restart a clean process.
    if (!readyAt && Date.now() - startedAt > 600000) { log('never-ready'); process.exit(1); }
    if (status !== 'connected' && readyAt && Date.now() - readyAt > 600000 && reconnectAttempt > 20) { log('stuck-reconnecting'); process.exit(1); }
    if (stateDirty) saveState();
    pruneBuckets();
    writeHeartbeat(status);
    if (Number.isInteger(sequence) && sequence !== savedSeq) {
      savedSeq = sequence;
      state.gateway = {sessionId, seq: sequence, resumeUrl};
      try { saveState(); } catch (error) { noteError('state-save', error); }
    }
  }, HEARTBEAT_MS);
  try {
    const me = await jsonRequest('GET', '/users/@me');
    if (core.isSnowflake(me?.id)) appId = me.id;
  } catch (error) {
    log('identity-unavailable');
  }
  if (appId) await registerCommands().catch(error => noteError('commands', error));
  await refreshProjects().catch(() => {});
  setInterval(() => { outboundTick().catch(error => noteError('outbound', error)); }, OUTBOUND_MS);
  setInterval(() => { refreshProjects().catch(() => {}); }, 300000);
  const shutdown = () => {
    stopped = true;
    clearInterval(heartbeatTimer);
    clearTimeout(ackTimer);
    clearTimeout(reconnectTimer);
    try { socket?.close(1000, 'shutdown'); } catch {}
    writeHeartbeat('connecting');
    setTimeout(() => process.exit(0), 100);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', error => log('uncaught', {error: String(error?.message ?? error)}));
  process.on('unhandledRejection', error => log('unhandled', {error: String(error?.message ?? error)}));
  connect();
}

main().catch(error => {
  log('fatal', {error: String(error?.message ?? error)});
  process.exit(1);
});
