import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const bridge = fileURLToPath(new URL('./manager_bridge.mjs', import.meta.url));

// A fake daemon whose one agent lives in a JSON file, so each one-shot bridge process sees
// what the previous call did. Paseo collects an idle runtime as status "closed".
function fixture(t, agent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manager-bridge-test-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const stateFile = path.join(dir, 'agent.json');
  fs.writeFileSync(stateFile, JSON.stringify({agent: {id: 'm1', status: 'idle', archivedAt: null, labels: {paseo_bot_gui: 'session-1'}, ...agent}, calls: []}));
  fs.mkdirSync(path.join(dir, 'utils'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  const module = path.join(dir, 'utils/client.js');
  fs.writeFileSync(module, `import fs from 'node:fs';
const file = ${JSON.stringify(stateFile)};
const load = () => JSON.parse(fs.readFileSync(file, 'utf8'));
const save = (s) => fs.writeFileSync(file, JSON.stringify(s));
const record = (name, change) => { const s = load(); s.calls.push(name); if (change) change(s.agent); save(s); };
export async function connectToDaemon() { return {
  getDaemonStatus: async () => ({serverId: 'srv-fixture'}),
  fetchAgent: async () => ({agent: load().agent}),
  refreshAgent: async () => record('refresh', (a) => { if (a.status === 'closed') a.status = 'idle'; }),
  sendMessage: async () => record('send'),
  archiveAgent: async () => record('archive', (a) => { a.archivedAt = '2026-11-04T00:00:00Z'; }),
  updateAgent: async (id, update) => record('claim', (a) => { a.labels = update.labels; }),
  setAgentModel: async () => record('model'),
  setAgentThinkingOption: async () => record('thinking'),
  waitForFinish: async () => ({status: 'idle', lastMessage: ''}),
  close: async () => {},
}; }`);
  return {
    call(req) {
      const r = spawnSync(process.execPath, [bridge], {
        input: JSON.stringify({serverId: 'srv-fixture', session: 'session-1', agentId: 'm1', ...req}),
        env: {...process.env, PASEO_MULTI_HOST_CLIENT_MODULE: module}, encoding: 'utf8', timeout: 10000,
      });
      return JSON.parse(r.stdout);
    },
    state: () => JSON.parse(fs.readFileSync(stateFile, 'utf8')),
  };
}

test('a collected (closed) manager is reloaded before the message is sent', t => {
  const f = fixture(t, {status: 'closed'});
  assert.deepEqual(f.call({action: 'send', prompt: 'hello'}), {ok: true, result: {accepted: true}});
  assert.deepEqual(f.state().calls, ['refresh', 'send']);
});

test('tune and claim reload a collected manager first; a live one is not refreshed', t => {
  const f = fixture(t, {status: 'closed'});
  assert.equal(f.call({action: 'tune', model: 'gpt', thinking: 'high'}).ok, true);
  assert.deepEqual(f.state().calls, ['refresh', 'model', 'thinking']);
  const g = fixture(t, {status: 'closed', labels: {paseo_bot_gui: 'spare-1'}});
  assert.equal(g.call({action: 'claim', session: 'spare-1', to: 'session-2'}).ok, true);
  assert.deepEqual(g.state().calls, ['refresh', 'claim']);
  assert.equal(g.state().agent.labels.paseo_bot_gui, 'session-2');
  const h = fixture(t, {status: 'idle'});
  assert.equal(h.call({action: 'send', prompt: 'hello'}).ok, true);
  assert.deepEqual(h.state().calls, ['send']);
});

test('a collected manager is archived without reloading it', t => {
  const f = fixture(t, {status: 'closed'});
  assert.deepEqual(f.call({action: 'archive'}), {ok: true, result: {archived: true}});
  assert.deepEqual(f.state().calls, ['archive']);
});

test('a running manager is refused before anything is sent', t => {
  const f = fixture(t, {status: 'running'});
  assert.deepEqual(f.call({action: 'send', prompt: 'hello'}), {ok: false, refused: 'busy'});
  assert.deepEqual(f.call({action: 'archive'}), {ok: false, refused: 'busy'});
  assert.deepEqual(f.state().calls, []);
});

test('foreign or archived managers are refused and never refreshed', t => {
  const f = fixture(t, {status: 'closed', labels: {paseo_bot_gui: 'someone-else'}});
  assert.deepEqual(f.call({action: 'send', prompt: 'hello'}), {ok: false, refused: 'ownership'});
  const g = fixture(t, {status: 'closed', archivedAt: '2026-11-01T00:00:00Z'});
  assert.deepEqual(g.call({action: 'send', prompt: 'hello'}), {ok: false, refused: 'ownership'});
  assert.deepEqual([...f.state().calls, ...g.state().calls], []);
});

test('invalid claim targets are refused without touching the manager', t => {
  const f = fixture(t, {status: 'closed'});
  assert.deepEqual(f.call({action: 'claim', to: 'bad label;'}), {ok: false, refused: 'action'});
  assert.deepEqual(f.state().calls, []);
});
