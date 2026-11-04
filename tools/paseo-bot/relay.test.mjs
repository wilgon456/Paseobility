import {test} from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {Relay,loadMapping,writeMapping} from './relay.mjs'; import {acceptMessage,chunkText,conversationForMessage} from './discord_core.mjs';
import {DiscordInbox} from './discord_inbox.mjs';
import {downloadAttachments} from './discord_attachments.mjs';
import {deliverFiles,discordFileForm,fileNonce} from './outbound_files.mjs';
import {searchHistory} from './history.mjs';

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
    async sendMessage(...a){calls.push(['send',...a]);}, async refreshAgent(id){calls.push(['refresh',id]);agents[id].archivedAt=null;agents[id].status='idle';},
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
test('only the final assistant message from each turn is sent',async t=>{
  const f=fixture(t),id=await f.relay.input('t','one');
  f.entries[id]=[entry(1,'user','user_message'),entry(2,'checking'),entry(3,'tool','tool_call'),entry(4,'answer one'),entry(5,'next','user_message'),entry(6,'working'),entry(7,'answer two'),entry(8,'trailing tool','tool_call')];
  await f.relay.poll('t');await f.relay.poll('t');
  assert.deepEqual(f.output.map(x=>x[1]),['answer one','answer two']);assert.equal(f.relay.map.t.delivered,8);
});
test('proactive turns with distinct turn ids keep their final answers',async t=>{
  const f=fixture(t),id=await f.relay.input('t','one');
  f.entries[id]=[Object.assign(entry(1,'progress'),{turnId:'one'}),Object.assign(entry(2,'first'),{turnId:'one'}),Object.assign(entry(3,'progress'),{turnId:'two'}),Object.assign(entry(4,'second'),{turnId:'two'})];
  await f.relay.poll('t');assert.deepEqual(f.output.map(x=>x[1]),['first','second']);
});
test('a resting agent error is reported once and retry permits a new notice',async t=>{
  const f=fixture(t),id=await f.relay.input('t','one');f.agents[id].status='error';f.agents[id].error={message:'quota exceeded'};
  await f.relay.poll('t');await f.relay.poll('t');assert.equal(f.output.length,1);assert.match(f.output[0][1],/한도/);
  await f.relay.input('t','retry');assert.ok(f.calls.some(x=>Array.isArray(x)&&x[0]==='refresh'));
  f.agents[id].status='error';await f.relay.poll('t');assert.equal(f.output.length,2);assert.notEqual(f.output[0][2].seq,f.output[1][2].seq);
});
test('thread archive leaves running front and workers alive; delete archives them',async t=>{
  const f=fixture(t),id=await f.relay.input('t','one');f.agents[id].status='idle';
  f.agents.worker={id:'worker',status:'running',labels:{paseo_bot_thread:'t'}};
  await f.relay.closeThread('t');assert.equal(f.agents.worker.archivedAt,undefined);assert.equal(f.agents[id].archivedAt,undefined);assert.equal(f.relay.map.t.archived,undefined);
  f.agents.worker.status='idle';f.agents[id].status='running';await f.relay.closeThread('t');assert.ok(f.agents.worker.archivedAt);assert.equal(f.agents[id].archivedAt,undefined);
  await f.relay.closeThread('t',true);assert.ok(f.agents[id].archivedAt);assert.equal(f.relay.map.t,undefined);
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
test('active heartbeats keep their front agent available on thread archive',async t=>{
  const f=fixture(t),id=await f.relay.input('t','one');
  f.client.scheduleList=async()=>({schedules:[{id:'routine',status:'active',target:{type:'agent',agentId:id}}]});
  await f.relay.closeThread('t');assert.equal(f.agents[id].archivedAt,undefined);assert.equal(f.relay.map.t.archived,undefined);
});
test('provider replacement moves a heartbeat and preserves remaining runs',async t=>{
  const f=fixture(t),id=await f.relay.input('t','one'),deleted=[],created=[];
  fs.writeFileSync(path.join(f.dir,'home','ROUTINES.md'),'routine-old');
  f.client.scheduleList=async()=>({schedules:[{id:'routine-old',status:'active',target:{type:'agent',agentId:id}}]});
  f.client.scheduleInspect=async()=>({schedule:{id:'routine-old',name:'morning',prompt:'check',status:'active',cadence:{type:'cron',expression:'0 9 * * *',timezone:'Asia/Seoul'},maxRuns:3,runs:[{status:'succeeded'}]}});
  f.client.scheduleCreate=async input=>{created.push(input);return {schedule:{id:'routine-new'}};};f.client.scheduleDelete=async({id})=>deleted.push(id);
  writeMapping(path.join(f.dir,'home','.relay-requests','t.json'),{id:'r',provider:'claude',model:'claude-sonnet-5-5'});await f.relay.poll('t');
  assert.equal(created[0].target.agentId,f.relay.map.t.agentId);assert.equal(created[0].maxRuns,2);assert.deepEqual(deleted,['routine-old']);assert.equal(fs.readFileSync(path.join(f.dir,'home','ROUTINES.md'),'utf8'),'routine-new');
});
test('a quiet watchdog heartbeat never sends a Discord message',async t=>{
  const f=fixture(t),id=await f.relay.input('t','one');f.entries[id]=[entry(1,'\n\n***\n___\n\n__PASEO_BOT_WATCH_NOTHING__')];await f.relay.poll('t');
  assert.deepEqual(f.output,[]);assert.equal(f.relay.map.t.delivered,1);
});
test('assistant replies lose leading separators and surrounding whitespace',async t=>{
  const f=fixture(t),id=await f.relay.input('t','one');
  f.entries[id]=[
    Object.assign(entry(1,'\n\n---\n\n첫 번째 답변\n\n'),{turnId:'one'}),
    Object.assign(entry(2,'  ***  \r\n___\n---\n\n두 번째\n---\n본문  '),{turnId:'two'}),
    Object.assign(entry(3,'\n___\n***\n---\n  '),{turnId:'three'}),
    Object.assign(entry(4,'  ---제목은 유지  '),{turnId:'four'}),
  ];
  await f.relay.poll('t');await f.relay.poll('t');
  assert.deepEqual(f.output.map(x=>x[1]),['첫 번째 답변','두 번째\n---\n본문','---제목은 유지']);
  assert.equal(f.relay.map.t.delivered,4);
});
test('file requests deliver bytes to their thread and remain pending on transport failure',async t=>{
  const f=fixture(t),id=await f.relay.input('t','one');const file=path.join(f.dir,'picture.png');fs.writeFileSync(file,Buffer.from([1,2,3]));
  const dir=path.join(f.dir,'home','.relay-outbox');writeMapping(path.join(dir,'1234.json'),{id:'1234',thread:'t',file,caption:'hello'});
  const common={home:path.join(f.dir,'home'),threads:f.relay.map,channelId:'channel',sendError:async()=>{throw Error('unexpected');}};
  await assert.rejects(deliverFiles({...common,sendFile:async()=>{throw Error('network');}}));assert.ok(fs.existsSync(path.join(dir,'1234.json')));
  const delivered=[];await deliverFiles({...common,sendFile:async(thread,job)=>delivered.push({thread,...job})});
  assert.equal(delivered[0].thread,'t');assert.deepEqual(delivered[0].bytes,Buffer.from([1,2,3]));assert.ok(!fs.existsSync(path.join(dir,'1234.json')));
  const form=discordFileForm(delivered[0]);const payload=JSON.parse(form.get('payload_json'));
  assert.equal(payload.content,'hello');assert.equal(payload.nonce,fileNonce('1234'));assert.equal(form.get('files[0]').name,'picture.png');
  assert.deepEqual(Buffer.from(await form.get('files[0]').arrayBuffer()),Buffer.from([1,2,3]));
});
test('Discord media is downloaded to the assistant home before it is sent to the agent',async t=>{
  const f=fixture(t),home=path.join(f.dir,'home'),bytes=Buffer.from('audio');
  const message={id:'123',content:'',attachments:[{url:'https://cdn.discordapp.com/a/voice.ogg',filename:'voice.ogg',size:bytes.length}]};
  const text=await downloadAttachments(message,home,async()=>new Response(bytes));
  assert.match(text,/첨부 파일/);assert.deepEqual(fs.readFileSync(path.join(home,'attachments','123','voice.ogg')),bytes);
});
test('existing conversations receive updated tool guidance once',async t=>{
  const f=fixture(t),id=await f.relay.input('t','first');delete f.relay.map.t.guideVersion;
  await f.relay.input('t','voice');await f.relay.input('t','next');
  const sent=f.calls.filter(x=>Array.isArray(x)&&x[0]==='send'&&x[1]===id).map(x=>x[2]);
  assert.match(sent[0],/^voice[\s\S]*AGENTS\.md/);assert.equal(sent[1],'next');
  assert.equal(loadMapping(path.join(f.dir,'threads.json')).t.guideVersion,1);
});
test('history search finds matching archived thread content',async()=>{
  const client={async fetchAgents(){return {entries:[{agent:{id:'a',title:'old',archivedAt:'y',labels:{paseo_bot_thread:'thread'}}},{agent:{id:'b',labels:{}}}],pageInfo:{hasMore:false}};},async fetchAgentTimeline(){return {entries:[{timestamp:'2026-11-04',item:{type:'user_message',text:'전에 설정한 명령은?'}},{timestamp:'2026-11-04',item:{type:'assistant_message',text:'npm test'}}]};}};
  const rows=await searchHistory(client,{query:'설정한',all:true});assert.equal(rows.length,1);assert.equal(rows[0].thread,'thread');assert.equal(rows[0].context,'npm test');
});
test('top-level message creates its own thread and filtering and splitting work',async()=>{
  const c={enabled:true,guildId:'1',channelId:'2',ownerIds:['3']};const m={id:'123456789012345678',guild_id:'1',channel_id:'2',author:{id:'3'},content:'hello'};
  assert.equal(acceptMessage(c,m,null),true);assert.equal(acceptMessage(c,{...m,author:{id:'9'}},null),false);
  const calls=[];const thread=await conversationForMessage(c,m,m.content,async(...args)=>{calls.push(args);return {id:'222222222222222222'};});
  assert.equal(thread,'222222222222222222');assert.deepEqual(calls,[[m.id,'hello']]);
  const text='hello '.repeat(800)+'😀';assert.equal(chunkText(text).join(''),text);assert.ok(chunkText(text).every(x=>x.length<=2000));
});
test('READY history recovery replays missed owner messages in order through the normal handler',async t=>{
  const f=fixture(t),channel='111111111111111111',thread='222222222222222222',newThread='333333333333333333',owner='444444444444444444';
  const cfg={enabled:true,guildId:'555555555555555555',channelId:channel,ownerIds:[owner]};
  const id=await f.relay.input(thread,'before');f.relay.markSeen(channel,'100000000000000001');f.relay.markSeen(thread,'100000000000000002');
  const calls=[],rows={
    [channel]:[{id:'100000000000000005',channel_id:channel,guild_id:cfg.guildId,author:{id:owner},content:'new thread'}, {id:'100000000000000003',channel_id:channel,guild_id:cfg.guildId,author:{id:'999999999999999999'},content:'ignored'}],
    [thread]:[{id:'100000000000000008',channel_id:thread,author:{id:owner},content:'second'}, {id:'100000000000000006',channel_id:thread,author:{id:owner},content:'first'}],
    [newThread]:[],
  };
  const request=async(method,url,body)=>{calls.push([method,url]);if(method==='POST')return {id:newThread};const match=url.match(/^\/channels\/(\d+)\/messages\?after=(\d+)&limit=100$/);if(!match)throw Error(url);return (rows[match[1]] || []).filter(x=>BigInt(x.id)>BigInt(match[2])).reverse();};
  const makeInbox=()=>new DiscordInbox({config:cfg,relay:f.relay,request,parentFor:async c=>c===channel?null:channel,attachments:async m=>m.content});
  const inbox=makeInbox();await inbox.recover();
  const sends=f.calls.filter(x=>Array.isArray(x)&&x[0]==='send'&&x[1]===id).map(x=>x[2]);assert.deepEqual(sends,['first','second']);
  assert.ok(f.relay.map[newThread]);assert.equal(f.relay.lastSeen[channel],'100000000000000005');assert.equal(f.relay.lastSeen[thread],'100000000000000008');
  const before=f.calls.length;await makeInbox().recover();await inbox.live({...rows[thread][0],guild_id:cfg.guildId});assert.equal(f.calls.length,before);
  assert.ok(calls.some(x=>x[0]==='POST'&&x[1].includes('/threads')));
});
test('history recovery paginates past 100 messages without skipping earlier owners',async t=>{
  const f=fixture(t),channel='111111111111111111',thread='222222222222222222',owner='444444444444444444';
  const cfg={enabled:true,guildId:'555555555555555555',channelId:channel,ownerIds:[owner]},id=await f.relay.input(thread,'before');
  f.relay.markSeen(channel,'100000000000000000');f.relay.markSeen(thread,'100000000000000000');
  const rows=Array.from({length:205},(_,i)=>({id:(100000000000000001n+BigInt(i)).toString(),channel_id:thread,author:{id:owner},content:`message ${i}`}));
  const request=async(method,url)=>{const m=url.match(/^\/channels\/(\d+)\/messages\?after=(\d+)&limit=100$/);if(!m)throw Error(url);return m[1]===channel?[]:rows.filter(x=>BigInt(x.id)>BigInt(m[2])).slice(0,100).reverse();};
  await new DiscordInbox({config:cfg,relay:f.relay,request,parentFor:async c=>c===channel?null:channel,attachments:async m=>m.content}).recover();
  const sends=f.calls.filter(x=>Array.isArray(x)&&x[0]==='send'&&x[1]===id);assert.equal(sends.length,205);assert.equal(sends[0][2],'message 0');assert.equal(sends.at(-1)[2],'message 204');
});
test('an event received while the first READY baseline is loading is not skipped',async t=>{
  const f=fixture(t),channel='111111111111111111',thread='222222222222222222',owner='444444444444444444',id='100000000000000123';
  const cfg={enabled:true,guildId:'555555555555555555',channelId:channel,ownerIds:[owner]},agent=await f.relay.input(thread,'before');f.relay.markSeen(channel,'100000000000000000');
  let release,started;const waiting=new Promise(r=>release=r), ready=new Promise(r=>started=r);
  const msg={id,channel_id:thread,guild_id:cfg.guildId,author:{id:owner},content:'live'};
  const request=async(method,url)=>{if(url.includes(`${channel}/messages?after=`))return [];if(url.endsWith('/messages?limit=1')){started();await waiting;return [msg];}if(url.includes(`${thread}/messages?after=`))return [msg];throw Error(url);};
  const inbox=new DiscordInbox({config:cfg,relay:f.relay,request,parentFor:async c=>c===channel?null:channel,attachments:async m=>m.content});
  const recovery=inbox.recover();await ready;const live=inbox.live(msg);release();await recovery;await live;
  assert.deepEqual(f.calls.filter(x=>Array.isArray(x)&&x[0]==='send'&&x[1]===agent).map(x=>x[2]),['live']);
});
test('a previously archived thread reopened while offline is recovered',async t=>{
  const f=fixture(t),channel='111111111111111111',thread='222222222222222222',owner='444444444444444444';
  const cfg={enabled:true,guildId:'555555555555555555',channelId:channel,ownerIds:[owner]},agent=await f.relay.input(thread,'before');
  f.relay.markSeen(channel,'100000000000000000');f.relay.markSeen(thread,'100000000000000000');await f.relay.closeThread(thread);
  const message={id:'100000000000000001',channel_id:thread,author:{id:owner},content:'reopened'};
  const request=async(method,url)=>{if(url.endsWith('/threads/active'))return {threads:[{id:thread,parent_id:channel,thread_metadata:{archived:false}}]};if(url.includes(`${channel}/messages?after=`))return [];if(url.includes(`${thread}/messages?after=`))return [message];throw Error(url);};
  await new DiscordInbox({config:cfg,relay:f.relay,request,parentFor:async c=>c===channel?null:channel,attachments:async m=>m.content}).recover();
  assert.ok(f.calls.some(x=>Array.isArray(x)&&x[0]==='send'&&x[1]===agent&&x[2]==='reopened'));assert.equal(f.relay.map[thread].archived,undefined);
});
