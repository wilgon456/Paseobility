import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Relay, loadMapping} from './relay.mjs';
import {acceptMessage, chunkText} from './discord_core.mjs';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-'));
  let agents = {}, calls = [], output = [];
  const client = {
    async createWorkspace() { calls.push('workspace'); return {workspace: {id: 'w'}}; },
    async createAgent(options) { calls.push(['create', options]); agents.a = {id:'a', workspaceId:'w', status:'idle'}; return agents.a; },
    async fetchAgent({agentId}) { return {agent: agents[agentId]}; },
    async fetchAgents() { return {entries:Object.values(agents).map(agent=>({agent})),pageInfo:{hasMore:false}}; },
    async sendMessage(id, text, options) { calls.push(['send', id, text, options]); },
    async refreshAgent(id) { calls.push(['refresh', id]); agents[id].archivedAt = null; },
    async archiveAgent(id) { calls.push(['archive', id]); agents[id].archivedAt = 1; },
    async archiveWorkspace(id) { calls.push(['archiveWorkspace', id]); },
    async respondToPermission(...args) { calls.push(['permission', ...args]); },
    async setAgentModel(...args) { calls.push(['model', ...args]); },
    async setAgentThinkingOption(...args) { calls.push(['thinking', ...args]); },
  };
  const relay = new Relay({client, stateDir:dir, home:path.join(dir, 'home'), source:dir, send:async (...x)=>output.push(x)});
  relay.timeline = async () => [];
  return {dir, calls, agents, relay, output};
}
test('one conversation maps to one agent and follow-ups are steered', async t => {
  const f=fixture(); t.after(()=>fs.rmSync(f.dir,{recursive:true,force:true}));
  await f.relay.input('t', 'one', 'm1'); await f.relay.input('t', 'two', 'm2');
  assert.deepEqual(loadMapping(path.join(f.dir,'threads.json')), {t:'a'});
  assert.equal(f.calls.filter(x=>Array.isArray(x) && x[0]==='create').length,1);
  assert.deepEqual(f.calls.at(-1), ['send','a','two',{messageId:'m2',activeTurnBehavior:'steer'}]);
  assert.equal(f.calls[1][1].modeId,'full-access');
});
test('archive retains mapping; a message refreshes it; deletion archives workspace', async t => {
  const f=fixture(); t.after(()=>fs.rmSync(f.dir,{recursive:true,force:true}));
  await f.relay.input('t','one'); f.agents.worker = {id:'worker',labels:{paseo_bot_thread:'t'}}; await f.relay.closeThread('t');
  assert.ok(f.calls.some(x=>Array.isArray(x) && x[0]==='archive' && x[1]==='worker'));
  assert.equal(f.relay.map.t,'a'); await f.relay.input('t','again');
  assert.ok(f.calls.some(x=>Array.isArray(x) && x[0]==='refresh'));
  await f.relay.closeThread('t',true); assert.deepEqual(f.relay.map,{});
  assert.ok(f.calls.some(x=>Array.isArray(x) && x[0]==='archiveWorkspace'));
});
test('unsolicited assistant output is relayed once; permissions are allowed', async t => {
  const f=fixture(); t.after(()=>fs.rmSync(f.dir,{recursive:true,force:true}));
  await f.relay.input('t','one'); f.agents.a.pendingPermissions=[{id:'p'}];
  f.relay.timeline = async () => [{id:'1',type:'assistant_message',text:'answer'}];
  await f.relay.poll('t'); await f.relay.poll('t');
  assert.deepEqual(f.output,[['t','answer']]); assert.ok(f.calls.some(x=>Array.isArray(x) && x[0]==='permission'));
});
test('model and thinking changes use the daemon client', async t => {
  const f=fixture(); t.after(()=>fs.rmSync(f.dir,{recursive:true,force:true}));
  await f.relay.switchModel('a','model','high');
  assert.deepEqual(f.calls,[['model','a','model'],['thinking','a','high']]);
});
test('Discord filtering and splitting preserve content', () => {
  const c={enabled:true,guildId:'1',channelId:'2',ownerIds:['3']};
  const m={id:'123456789012345678',guild_id:'1',channel_id:'4',author:{id:'3'},content:'x'};
  assert.equal(acceptMessage(c,m,'2'),true); assert.equal(acceptMessage(c,{...m,author:{id:'9'}},'2'),false);
  assert.equal(acceptMessage(c,m,'5'),false);
  const text='hello '.repeat(800)+'😀'; const parts=chunkText(text);
  assert.ok(parts.every(x=>x.length<=2000)); assert.equal(parts.join(''),text);
});
