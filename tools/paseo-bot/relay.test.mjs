import {test} from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {Relay,loadMapping,writeMapping} from './relay.mjs'; import {acceptMessage,chunkText,conversationForMessage} from './discord_core.mjs';

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const agents={}, calls=[], output=[], entries={}; let watchers={}, count=0;
  const client={
    async openProject(){calls.push('workspace');return {workspace:{id:'w'}};},
    async createAgent(options){const id=`a${++count}`;calls.push(['create',options]);agents[id]={id,provider:options.provider,workspaceId:'w',status:'idle',labels:options.labels};entries[id]=[];return agents[id];},
    async fetchAgent({agentId}){return agents[agentId]?{agent:agents[agentId]}:null;},
    async fetchAgents(){return {entries:Object.values(agents).map(agent=>({agent})),pageInfo:{hasMore:false}};},
    async fetchAgentTimeline(id,options){const rows=entries[id].filter(e=>!options.cursor || e.seqEnd>options.cursor.seq);return {entries:rows,endCursor:rows.length?{epoch:'epoch',seq:rows.at(-1).seqEnd}:options.cursor};},
    subscribeAgentTimeline(id,cb){watchers[id]=cb;return ()=>delete watchers[id];},
    async sendMessage(...a){calls.push(['send',...a]);}, async refreshAgent(id){calls.push(['refresh',id]);agents[id].archivedAt=null;},
    async archiveAgent(id){calls.push(['archive',id]);agents[id].archivedAt=1;},
    async setAgentModel(...a){calls.push(['model',...a]);}, async setAgentThinkingOption(...a){calls.push(['thinking',...a]);},
    async respondToPermission(...a){calls.push(['permission',...a]);},
  };
  const make=()=>new Relay({client,stateDir:dir,home:path.join(dir,'home'),source:dir,send:async (...x)=>output.push(x)});
  return {dir,client,agents,calls,output,entries,watchers,make,relay:make()};
}
const entry=(n,text,type='assistant_message')=>({seqStart:n,seqEnd:n,item:{type,text,messageId:`m${n}`}});
test('one agent per thread shares one workspace and missing agents are recreated',async t=>{
  const f=fixture(t);await Promise.all([f.relay.input('t1','one'),f.relay.input('t2','two')]);
  assert.equal(f.calls.filter(x=>x==='workspace').length,1);assert.notEqual(f.relay.map.t1.agentId,f.relay.map.t2.agentId);
  const old=f.relay.map.t1.agentId;delete f.agents[old];await f.relay.input('t1','again');assert.notEqual(f.relay.map.t1.agentId,old);
});
test('restart delivers only undelivered timeline entries and migration preserves agent',async t=>{
  const f=fixture(t);writeMapping(path.join(f.dir,'old.json'),{t:'legacy'});assert.equal(loadMapping(path.join(f.dir,'old.json')).t.agentId,'legacy');
  const id=await f.relay.input('t','question');f.entries[id]=[entry(1,'first')];await f.relay.poll('t');
  f.entries[id].push(entry(2,'while stopped'));const restarted=f.make();await restarted.baseline();await restarted.poll('t');await restarted.poll('t');
  assert.deepEqual(f.output.map(x=>x[1]),['first','while stopped']);assert.equal(loadMapping(path.join(f.dir,'threads.json')).t.delivered,2);
});
test('different provider creates successor with context; same provider updates in place',async t=>{
  const f=fixture(t);const id=await f.relay.input('t','question');f.entries[id]=[entry(1,'earlier','user_message'),entry(2,'npm test')];
  writeMapping(path.join(f.dir,'home','.relay-requests','t.json'),{id:'r',provider:'claude',model:'claude-sonnet-5-5'});
  await f.relay.poll('t');const newId=f.relay.map.t.agentId;assert.notEqual(newId,id);assert.equal(f.agents[newId].provider,'claude');
  assert.match(f.calls.filter(x=>Array.isArray(x)&&x[0]==='create').at(-1)[1].initialPrompt,/npm test/);assert.ok(f.agents[id].archivedAt);
  writeMapping(path.join(f.dir,'home','.relay-requests','t.json'),{id:'r2',provider:'claude',model:'other',thinking:'high'});await f.relay.poll('t');
  assert.ok(f.calls.some(x=>Array.isArray(x)&&x[0]==='model'&&x[2]==='other'));assert.equal(f.relay.map.t.agentId,newId);
});
test('archive stops polling, resumes same agent, deletion keeps shared workspace',async t=>{
  const f=fixture(t);const id=await f.relay.input('t','one');await f.relay.closeThread('t');assert.equal(f.relay.map.t.archived,true);
  await f.relay.pollDue();await f.relay.input('t','again');assert.equal(f.relay.map.t.agentId,id);assert.ok(f.calls.some(x=>Array.isArray(x)&&x[0]==='refresh'));
  await f.relay.closeThread('t',true);assert.equal(f.relay.map.t,undefined);assert.ok(!f.calls.some(x=>Array.isArray(x)&&x[0]==='archiveWorkspace'));
});
test('subscription wakes an idle thread for proactive output',async t=>{
  const f=fixture(t);const id=await f.relay.input('t','one');await f.relay.poll('t');assert.ok(f.relay.next.get('t')>Date.now()+30000);
  f.entries[id]=[entry(1,'worker done')];f.watchers[id]();await f.relay.pollDue();assert.equal(f.output[0][1],'worker done');
});
test('thread close archives matching workers on an online native host',async t=>{
  const f=fixture(t), archived=[];
  f.client.listHosts=async()=>({hosts:[{serverId:'remote',enabled:true,status:'online'}]});
  f.relay.remoteClient=async()=>({async fetchAgents(){return {entries:[{agent:{id:'worker',labels:{paseo_bot_thread:'t'}}},{agent:{id:'other',labels:{paseo_bot_thread:'other'}}}],pageInfo:{hasMore:false}};},async archiveAgent(id){archived.push(id);},async close(){}});
  await f.relay.input('t','one');await f.relay.closeThread('t',true);assert.deepEqual(archived,['worker']);
});
test('top-level message creates its own thread and filtering and splitting work',async()=>{
  const c={enabled:true,guildId:'1',channelId:'2',ownerIds:['3']};const m={id:'123456789012345678',guild_id:'1',channel_id:'2',author:{id:'3'},content:'hello'};
  assert.equal(acceptMessage(c,m,null),true);assert.equal(acceptMessage(c,{...m,author:{id:'9'}},null),false);
  const calls=[];const thread=await conversationForMessage(c,m,m.content,async(...args)=>{calls.push(args);return {id:'222222222222222222'};});
  assert.equal(thread,'222222222222222222');assert.deepEqual(calls,[[m.id,'hello']]);
  const text='hello '.repeat(800)+'😀';assert.equal(chunkText(text).join(''),text);assert.ok(chunkText(text).every(x=>x.length<=2000));
});
