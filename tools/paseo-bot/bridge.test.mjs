import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const bridge=fileURLToPath(new URL('./bridge.mjs',import.meta.url));
function fixture(t,{wrongIdentity=false,features=false,noMode=false,warming=false,errorText='',agentStatus='idle',sibling=false,fullAccess=false}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bot-bridge-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'utils'));
 const module=path.join(dir,'utils/client.js');
 fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
 fs.writeFileSync(module,`import {createHash} from 'node:crypto';let probes=0,remote;export async function connectToDaemon(){return {
 getDaemonStatus:async()=>({serverId:${JSON.stringify(wrongIdentity?'wrong':'srv-fixture')},version:'0.13.1'}),
 getLastServerInfoMessage:()=>({serverId:${JSON.stringify(wrongIdentity?'wrong':'srv-fixture')},version:'0.13.1',features:{workspaceRequestReceipts:true}}),
 getDaemonConfig:async()=>({config:{agentProfiles:[{name:'gpt-task',provider:'codex',model:'fixture-model',thinkingOptionId:'high',${noMode?'':"modeId:'read-only',"}featureValues:${features?'{fast_mode:true}':'{}'},notes:'Fixture profile'},{name:'refactor-bulk',provider:'opencode',model:'fixture-go',featureValues:{}}]}}),
 getProvidersSnapshot:async()=>({entries:[{provider:'codex',enabled:true,status:${warming?"(++probes>2?'ready':'loading')":"'ready'"},defaultModeId:'auto-review',modes:[{id:'read-only'},{id:'auto-review'}${fullAccess?",{id:'full-access'}":''}]},{provider:'opencode',enabled:true,status:'ready',modes:[]}]}),
 listProjects:async()=>({projects:[{projectRootPath:'/repo',projectDisplayName:'fixture'}]}),
 openProject:async()=>({workspace:{id:'local1',projectId:'project1',workspaceDirectory:'/repo'}}),
 createWorkspace:async(x)=>({workspace:{id:'w1',projectId:x.source.projectId,workspaceDirectory:'/worktree',workspaceKind:'worktree'}}),
 fetchWorkspaces:async(o)=>({entries:o.filter?.query?[{id:'w1',projectId:'project1',workspaceDirectory:'/worktree',workspaceKind:'worktree'}]:${sibling?"[{id:'other',workspaceDirectory:'/worktree/subdir'}]":'[]'},pageInfo:{hasMore:false}}),
 listTerminals:async()=>({terminals:[]}),
 createTerminal:async(cwd,name,requestId,opts)=>{remote=JSON.parse(opts.args.at(-1));return {terminal:{id:'owned-terminal'}}},
 captureTerminal:async()=>{const bytes=Buffer.from('fixture patch');const result=remote.action==='snapshot'?{file:remote.file,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}:remote.action==='verify'?{verified:true}:{worktreeRemoved:true,branch:'deleted'};return {lines:['PASEO_BOT_CLEANUP='+JSON.stringify(result)]}},
 killTerminal:async()=>({}),readFile:async()=>({bytes:Buffer.from('fixture patch')}),archiveWorkspace:async()=>({archivedAt:'2026-01-01T00:00:00Z'}),
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
test('CLI materializes profile, uses existing workspace, no caller or conflicting home',t=>{
 const f=fixture(t);const r=f.call({action:'launch',profile:'gpt-task',repo:'/repo',title:'fixture',attempt:'attempt',prompt:'literal $(not-a-shell) prompt',workspaceId:'w1'});
 assert.equal(r.ok,true);const a=JSON.parse(fs.readFileSync(path.join(f.dir,'argv.json')));
 for(const flag of ['--no-wait','--provider','--model','--thinking','--mode','--workspace','--label'])assert.ok(a.argv.includes(flag));
 assert.ok(!a.argv.includes('--new-workspace'));
 assert.equal(a.home,undefined);assert.equal(a.caller,undefined);assert.equal(a.workspace,undefined);assert.equal(a.argv.at(-1),'literal $(not-a-shell) prompt');assert.equal(r.result.workspaceId,'w1');
});
test('opens a reusable project and explicitly creates a worktree in it',t=>{
 const f=fixture(t);
 assert.deepEqual(f.call({action:'open-project',repo:'/repo'}).result,{projectId:'project1',workspaceId:'local1',cwd:'/repo'});
 const result=f.call({action:'create-workspace',repo:'/repo',projectId:'project1',branch:'paseo-bot/test',base:'a'.repeat(40),key:'paseo-bot:fixture',title:'fixture'});
 assert.deepEqual(result.result,{workspaceId:'w1',cwd:'/worktree'});
});
test('snapshot, verification and archive require ownership and preserve exact patch bytes',t=>{
 const f=fixture(t), common={repo:'/repo',projectId:'project1',workspaceId:'w1',worktree:'/worktree',runs:[{agentId:'owned',attempt:'attempt'}],base:'a'.repeat(40)};
 const snap=f.call({action:'snapshot-workspace',...common});
 assert.equal(snap.ok,true);assert.equal(Buffer.from(snap.result.patch,'base64').toString(),'fixture patch');
 const archive=f.call({action:'archive-workspace',...common,sha256:snap.result.sha256,remoteFile:snap.result.remoteFile});
 assert.equal(archive.ok,true);
 assert.equal(f.call({action:'archive-workspace',...common,runs:[],sha256:snap.result.sha256,remoteFile:snap.result.remoteFile}).ok,false);
 assert.equal(f.call({action:'finish-workspace',repo:'/repo',worktree:'/worktree',branch:'paseo-bot/test',preflightWorkspaceId:'local1'}).result.branch,'deleted');
});
test('cleanup refuses fallback removal while another workspace references the tree',t=>{
 const f=fixture(t,{sibling:true});
 assert.deepEqual(f.call({action:'finish-workspace',repo:'/repo',worktree:'/worktree',branch:'paseo-bot/test',preflightWorkspaceId:'local1'}).result,{worktreeRemoved:false,branch:'not-checked'});
});
test('unsupported profile features cannot be silently dropped',t=>{
 const f=fixture(t,{features:true});assert.equal(f.call({action:'launch',profile:'gpt-task'}).ok,false);assert.equal(fs.existsSync(path.join(f.dir,'argv.json')),false);
});
test('recovery adopts only attempt label and observation verifies ownership',t=>{
 const f=fixture(t);assert.equal(f.call({action:'recover',attempt:'attempt'}).result.agents.length,1);assert.equal(f.call({action:'recover',attempt:'different'}).result.agents.length,0);assert.equal(f.call({action:'observe',agentId:'owned',attempt:'different'}).ok,false);assert.equal(f.call({action:'observe',agentId:'owned',attempt:'attempt'}).result.status,'idle');
});

test('absent profile mode prefers the provider permissive mode when offered',t=>{
 const f=fixture(t,{noMode:true,fullAccess:true});const r=f.call({action:'launch',profile:'gpt-task',repo:'/repo',title:'fixture',attempt:'attempt',prompt:'read fixture',workspaceId:'w1'});
 assert.equal(r.ok,true);const a=JSON.parse(fs.readFileSync(path.join(f.dir,'argv.json')));assert.equal(a.argv[a.argv.indexOf('--mode')+1],'full-access');assert.equal(r.result.modeId,'full-access');
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
 for(const [error,expected] of [['HTTP 429 rate limit exceeded','quota'],['model gpt-6.1-sol not available','model-unavailable'],['network timeout','other']]){
  const f=fixture(t,{errorText:error,agentStatus:'error'}); const r=f.call({action:'observe',agentId:'owned',attempt:'attempt'});
  assert.equal(r.result.errorKind,expected); assert.ok(!JSON.stringify(r).includes(error));
 }
 const f=fixture(t,{errorText:'rate limit exceeded',agentStatus:'idle'});
 assert.equal(f.call({action:'observe',agentId:'owned',attempt:'attempt'}).result.errorKind,'');
});
test('model aliases are fixed and unknown providers cannot reach the CLI',t=>{
 const f=fixture(t);const req={action:'launch',profile:'gpt-task',repo:'/repo',title:'fixture',attempt:'attempt',prompt:'fixture',workspaceId:'w1'};
 assert.equal(f.call({...req,modelAlias:'sol',effort:'auto'}).ok,true);
 const a=JSON.parse(fs.readFileSync(path.join(f.dir,'argv.json'))).argv;
 assert.equal(a[a.indexOf('--model')+1],'gpt-6.1-sol');
 assert.equal(a[a.indexOf('--thinking')+1],'high');
 assert.equal(f.call({...req,modelAlias:'terra',effort:'auto'}).ok,false);
 assert.equal(f.call({...req,modelAlias:'commandcode',effort:'high'}).ok,false);
 assert.equal(f.call({...req,modelAlias:'go',effort:'high'}).ok,false);
 assert.equal(f.call({...req,profile:'refactor-bulk',modelAlias:'go',effort:'medium'}).ok,true);
 const g=JSON.parse(fs.readFileSync(path.join(f.dir,'argv.json'))).argv;
 assert.equal(g[g.indexOf('--model')+1],'opencode-go/deepseek-v4.1-flash');
 assert.equal(g[g.indexOf('--thinking')+1],'high');
});
