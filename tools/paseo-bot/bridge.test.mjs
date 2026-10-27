import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const bridge=fileURLToPath(new URL('./bridge.mjs',import.meta.url));
function fixture(t,{wrongIdentity=false,features=false,noMode=false,warming=false,errorText='',agentStatus='idle'}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bot-bridge-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'utils'));
 const module=path.join(dir,'utils/client.js');
 fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
 fs.writeFileSync(module,`let probes=0;export async function connectToDaemon(){return {
 getDaemonStatus:async()=>({serverId:${JSON.stringify(wrongIdentity?'wrong':'srv-fixture')},version:'0.13.1'}),
 getDaemonConfig:async()=>({config:{agentProfiles:[{name:'gpt-task',provider:'codex',model:'fixture-model',thinkingOptionId:'high',${noMode?'':"modeId:'read-only',"}featureValues:${features?'{fast_mode:true}':'{}'},notes:'Fixture profile'}]}}),
 getProvidersSnapshot:async()=>({entries:[{provider:'codex',enabled:true,status:${warming?"(++probes>2?'ready':'loading')":"'ready'"},defaultModeId:'auto-review',modes:[{id:'read-only'},{id:'auto-review'}]}]}),
 listProjects:async()=>({projects:[{projectRootPath:'/repo',projectDisplayName:'fixture'}]}),
 fetchAgents:async()=>({entries:[{agent:{id:'owned',labels:{paseo_bot_attempt:'attempt'},workspaceId:'w1',cwd:'/worktree',status:'idle'}}],pageInfo:{hasMore:false}}),
 fetchAgent:async()=>({agent:{id:'owned',status:${JSON.stringify(agentStatus)},lastError:${JSON.stringify(errorText)},labels:{paseo_bot_attempt:'attempt'},workspaceId:'w1',cwd:'/worktree'}}),
 sendMessage:async()=>({accepted:true}),
 waitForFinish:async()=>({status:${JSON.stringify(agentStatus)},lastMessage:'PASEO_BOT_RESULT={"verdict":"pass"}'}),close:async()=>{}
 }};`);
 fs.writeFileSync(path.join(dir,'index.js'),`import fs from 'node:fs';fs.writeFileSync(process.env.ARGV_FILE,JSON.stringify({argv:process.argv.slice(2),host:process.env.PASEO_HOST,home:process.env.PASEO_HOME,caller:process.env.PASEO_AGENT_ID,workspace:process.env.PASEO_WORKSPACE_ID}));console.log(JSON.stringify({agentId:'owned',cwd:'/worktree'}));`);
 return {dir,call(req){
  const r=spawnSync(process.execPath,[bridge],{input:JSON.stringify({host:{endpoint:'tcp://fixture.invalid:1234?password=DO_NOT_PRINT_SECRET',serverId:'srv-fixture'},...req}),env:{...process.env,PASEO_MULTI_HOST_CLIENT_MODULE:module,PASEO_HOME:'conflicting-home',PASEO_AGENT_ID:'parent',PASEO_WORKSPACE_ID:'parent-workspace',ARGV_FILE:path.join(dir,'argv.json')},encoding:'utf8',timeout:5000});
  assert.ok(!r.stdout.includes('DO_NOT_PRINT_SECRET'));
  return JSON.parse(r.stdout);
 }};
}
test('host identity mismatch fails closed without connection data',t=>{
 const f=fixture(t,{wrongIdentity:true});assert.equal(f.call({action:'discover'}).ok,false);
});
test('fresh daemon profiles and connected projects are selected',t=>{
 const f=fixture(t);const r=f.call({action:'discover'});assert.equal(r.ok,true);assert.equal(r.result.profiles[0].model,'fixture-model');assert.equal(r.result.projects.length,1);
});
test('CLI materializes profile, uses worktree, no caller or conflicting home',t=>{
 const f=fixture(t);const r=f.call({action:'launch',profile:'gpt-task',repo:'/repo',title:'fixture',attempt:'attempt',prompt:'literal $(not-a-shell) prompt',branch:'paseo-bot/test',base:'a'.repeat(40)});
 assert.equal(r.ok,true);const a=JSON.parse(fs.readFileSync(path.join(f.dir,'argv.json')));
 for(const flag of ['--no-wait','--provider','--model','--thinking','--mode','--new-workspace','--new-branch','--base','--label'])assert.ok(a.argv.includes(flag));
 assert.equal(a.home,undefined);assert.equal(a.caller,undefined);assert.equal(a.workspace,undefined);assert.equal(a.argv.at(-1),'literal $(not-a-shell) prompt');assert.equal(r.result.workspaceId,'w1');
});
test('unsupported profile features cannot be silently dropped',t=>{
 const f=fixture(t,{features:true});assert.equal(f.call({action:'launch',profile:'gpt-task'}).ok,false);assert.equal(fs.existsSync(path.join(f.dir,'argv.json')),false);
});
test('recovery adopts only attempt label and observation verifies ownership',t=>{
 const f=fixture(t);assert.equal(f.call({action:'recover',attempt:'attempt'}).result.agents.length,1);assert.equal(f.call({action:'recover',attempt:'different'}).result.agents.length,0);assert.equal(f.call({action:'observe',agentId:'owned',attempt:'different'}).ok,false);assert.equal(f.call({action:'observe',agentId:'owned',attempt:'attempt'}).result.status,'idle');
});

test('absent profile mode materializes live configured provider default',t=>{
 const f=fixture(t,{noMode:true});const r=f.call({action:'launch',profile:'gpt-task',repo:'/repo',title:'fixture',attempt:'attempt',prompt:'read fixture',workspaceId:'w1'});
 assert.equal(r.ok,true);const a=JSON.parse(fs.readFileSync(path.join(f.dir,'argv.json')));assert.equal(a.argv[a.argv.indexOf('--mode')+1],'auto-review');assert.equal(r.result.modeId,'auto-review');
});
test('format correction targets only an owned idle agent',t=>{
 const f=fixture(t);assert.equal(f.call({action:'repair',agentId:'owned',attempt:'attempt',prompt:'complete the JSON receipt read-only'}).ok,true);assert.equal(f.call({action:'repair',agentId:'owned',attempt:'other',prompt:'invalid'}).ok,false);
});

test('fresh provider snapshots warm before any launch side effect',t=>{
 const f=fixture(t,{warming:true});const r=f.call({action:'launch',profile:'gpt-task',repo:'/repo',title:'warming',attempt:'attempt',prompt:'read fixture',workspaceId:'w1'});assert.equal(r.ok,true);assert.equal(r.result.provider,'codex');
});

test('only terminal provider error yields a redacted limit classification',t=>{
 for(const [error,expected] of [['HTTP 429 rate limit exceeded','quota'],['model gpt-6.1-terra not available','model-unavailable'],['network timeout','other']]){
  const f=fixture(t,{errorText:error,agentStatus:'error'}); const r=f.call({action:'observe',agentId:'owned',attempt:'attempt'});
  assert.equal(r.result.errorKind,expected); assert.ok(!JSON.stringify(r).includes(error));
 }
 const f=fixture(t,{errorText:'rate limit exceeded',agentStatus:'idle'});
 assert.equal(f.call({action:'observe',agentId:'owned',attempt:'attempt'}).result.errorKind,'');
});
test('model aliases are fixed and unknown providers cannot reach the CLI',t=>{
 const f=fixture(t);const req={action:'launch',profile:'gpt-task',repo:'/repo',title:'fixture',attempt:'attempt',prompt:'fixture',workspaceId:'w1'};
 assert.equal(f.call({...req,modelAlias:'terra',effort:'auto'}).ok,true);
 const a=JSON.parse(fs.readFileSync(path.join(f.dir,'argv.json'))).argv;
 assert.equal(a[a.indexOf('--model')+1],'gpt-6.1-terra');
 assert.equal(a[a.indexOf('--thinking')+1],'high');
 assert.equal(f.call({...req,modelAlias:'commandcode',effort:'high'}).ok,false);
 assert.equal(f.call({...req,modelAlias:'go',effort:'high'}).ok,false);
});
