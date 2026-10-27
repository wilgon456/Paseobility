// Runs under the installed Paseo/Electron Node runtime. Never emits raw errors/config.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
const req = JSON.parse(fs.readFileSync(0, 'utf8'));
let client;
let stage='connect';
function endpoint(h) {
  if (h.endpoint) return h.endpoint;
  const r = h.connections?.find(c => c.type === 'relay');
  if (r?.daemonPublicKeyB64 && r.relayEndpoint) return 'https://app.paseo.sh/#offer=' + Buffer.from(JSON.stringify({v:2,serverId:h.serverId,daemonPublicKeyB64:r.daemonPublicKeyB64,relay:{endpoint:r.relayEndpoint,useTls:r.useTls ?? true}})).toString('base64url');
  const d = h.connections?.find(c => c.type === 'directTcp');
  if (!d?.endpoint) throw Error('connection');
  const u = new URL(d.endpoint.includes('://') ? d.endpoint : 'tcp://' + d.endpoint);
  if (d.password) u.searchParams.set('password',d.password);
  if (d.useTls) u.searchParams.set('ssl','true');
  return u.toString().replace(/\/(?=\?|$)/,'');
}
async function inventory() {
  const entries = [], seen = new Set(); let cursor;
  for (let i=0;i<50;i++) {
    const r = await client.fetchAgents({includeBackground:true,page:{limit:200,...(cursor?{cursor}:{})},timeout:10000});
    if (!Array.isArray(r.entries) || typeof r.pageInfo?.hasMore !== 'boolean') throw Error('schema');
    entries.push(...r.entries.map(x=>x.agent));
    if (!r.pageInfo.hasMore) return entries;
    cursor=r.pageInfo.nextCursor;
    if (!cursor || seen.has(cursor)) throw Error('pagination');
    seen.add(cursor);
  }
  throw Error('pagination');
}
function profileRows(config) {
  const rows=config.agentProfiles ?? config.profiles;
  if (!Array.isArray(rows)) throw Error('profiles schema');
  return rows.map(p=>Object.fromEntries(['id','name','provider','model','modeId','thinkingOptionId','featureValues','notes'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])));
}
function samePath(a,b) {
  if(typeof a!=='string'||typeof b!=='string')return false;
  if(/^[A-Za-z]:[\\/]|^\\\\/.test(a))return path.win32.normalize(a).toLowerCase()===path.win32.normalize(b).toLowerCase();
  return a===b;
}
function insidePath(child,parent) {
  const windows=/^[A-Za-z]:[\\/]|^\\\\/.test(parent);
  const impl=windows?path.win32:path.posix;
  let a=impl.normalize(child),b=impl.normalize(parent);
  if(windows){a=a.toLowerCase();b=b.toLowerCase();}
  const relative=impl.relative(b,a);
  return relative==='' || (relative!=='..' && !relative.startsWith('..'+impl.sep) && !impl.isAbsolute(relative));
}
async function anyWorkspaceReferences(worktree) {
  let cursor;const seen=new Set();
  for(let i=0;i<50;i++) {
    const page=await client.fetchWorkspaces({filter:{includeBackground:true},page:{limit:200,...(cursor?{cursor}:{})}});
    if(!Array.isArray(page.entries) || typeof page.pageInfo?.hasMore!=='boolean')throw Error('schema');
    for(const w of page.entries) {
      if(typeof w.workspaceDirectory!=='string')throw Error('schema');
      if(insidePath(w.workspaceDirectory,worktree))return true;
    }
    if(!page.pageInfo.hasMore)return false;
    cursor=page.pageInfo.nextCursor;
    if(!cursor || seen.has(cursor))throw Error('schema');
    seen.add(cursor);
  }
  throw Error('schema');
}
async function ownedWorkspace() {
  stage='cleanup-workspace';
  const listed=await client.fetchWorkspaces({filter:{query:req.workspaceId,includeBackground:true},page:{limit:200}});
  const w=listed.entries?.find(x=>x.id===req.workspaceId);
  if(!w || w.projectId!==req.projectId || w.workspaceKind!=='worktree' || !samePath(w.workspaceDirectory,req.worktree))throw Error('ownership');
  const allowed=new Map((req.runs ?? []).map(r=>[r.agentId,r.attempt]));
  stage='cleanup-agents';
  const active=(await inventory()).filter(a=>!a.archivedAt && a.workspaceId===req.workspaceId);
  if(active.some(a=>!allowed.has(a.id) || allowed.get(a.id)!==a.labels?.paseo_bot_attempt))throw Error('ownership');
  stage='cleanup-terminals';
  const terminals=await client.listTerminals(undefined,undefined,{workspaceId:req.workspaceId});
  if(terminals?.error || !Array.isArray(terminals?.terminals) || terminals.terminals.length)throw Error('ownership');
  for(const a of active) {
    if(!['idle','error','closed'].includes(a.status)) {
      await client.cancelAgent(a.id);
      let current;
      for(let i=0;i<25;i++) {
        current=(await client.fetchAgent({agentId:a.id,timeout:10000}))?.agent;
        if(current && ['idle','error','closed'].includes(current.status))break;
        await new Promise(resolve=>setTimeout(resolve,200));
      }
      if(!current || !['idle','error','closed'].includes(current.status))throw Error('ownership');
    }
  }
}
async function remoteHelper(workspaceId,cwd,request) {
  stage='cleanup-helper';
  const source=fs.readFileSync(new URL('./cleanup_remote.py',import.meta.url),'utf8');
  const windows=/^[A-Za-z]:[\\/]|^\\\\/.test(cwd);
  const name='paseo-bot-cleanup-'+randomUUID();
  const created=await client.createTerminal(cwd,name,undefined,{workspaceId,command:windows?'python':'python3',args:['-c',source,JSON.stringify(request)],size:{cols:400,rows:40}});
  const id=created?.terminal?.id;
  if(created?.error || !id)throw Error('cleanup terminal create');
  let result;
  try {
    for(let i=0;i<160;i++) {
      await new Promise(resolve=>setTimeout(resolve,200));
      const capture=await client.captureTerminal(id,{stripAnsi:true,start:0});
      if(capture?.error || !Array.isArray(capture?.lines))throw Error('cleanup terminal capture');
      if(capture.lines.some(x=>x.includes('PASEO_BOT_CLEANUP_ERROR')))throw Error('cleanup helper error');
      const lines=capture.lines.filter(x=>x.startsWith('PASEO_BOT_CLEANUP='));
      if(lines.length===1) { result=JSON.parse(lines[0].slice('PASEO_BOT_CLEANUP='.length)); break; }
    }
    if(!result)throw Error('cleanup terminal timeout');
  } finally {
    const closed=await client.killTerminal(id);
    if(closed?.error)throw Error('cleanup terminal close');
  }
  return result;
}
async function main() {
  const {connectToDaemon}=await import(pathToFileURL(process.env.PASEO_MULTI_HOST_CLIENT_MODULE).href);
  const target=endpoint(req.host);
  client=await connectToDaemon({target:{kind:'endpoint',host:target},timeout:10000});
  stage='identity';
  // Identity comes from the connected server-info handshake. The optional
  // daemon status RPC also probes providers and can block unrelated operations.
  const status=client.getLastServerInfoMessage();
  if(status.serverId!==req.host.serverId) throw Error('identity');
  if(req.action==='discover') {
    const config=await client.getDaemonConfig();
    const projects=await client.listProjects();
    const agents=await inventory();
    return {serverId:status.serverId,version:status.version,profiles:profileRows(config.config ?? config),projects:projects.projects,busy:agents.filter(a=>!a.archivedAt && !['idle','closed','error'].includes(a.status)).length};
  }
  if(req.action==='open-project') {
    // openProject is the daemon's find-or-create operation. It reuses the
    // directory workspace and its project; it does not create a workspace for
    // every caller as workspace.create with a directory source does.
    const opened=await client.openProject(req.repo);
    const w=opened?.workspace;
    if(opened?.error || !w?.id || !w?.projectId || !w?.workspaceDirectory)
      throw Error('project receipt');
    return {projectId:w.projectId,workspaceId:w.id,cwd:w.workspaceDirectory};
  }
  if(req.action==='create-workspace') {
    // The durable task id is also the daemon idempotency key, so a lost
    // acknowledgement can be retried without allocating another worktree.
    if(status.features?.workspaceRequestReceipts!==true)throw Error('workspace receipt');
    const created=await client.createWorkspace({
      idempotencyKey:req.key,
      source:{kind:'worktree',cwd:req.repo,projectId:req.projectId,action:'branch-off',branchName:req.branch,baseBranch:req.base},
      title:req.title,
    });
    const w=created?.workspace;
    if(created?.error || !w?.id || w.projectId!==req.projectId || !w.workspaceDirectory || w.workspaceKind!=='worktree')
      throw Error('workspace receipt');
    return {workspaceId:w.id,cwd:w.workspaceDirectory};
  }
  if(req.action==='snapshot-workspace') {
    await ownedWorkspace();
    const filename='.paseo-bot-evidence-'+randomUUID()+'.patch';
    const receipt=await remoteHelper(req.workspaceId,req.worktree,{action:'snapshot',worktree:req.worktree,file:filename,base:req.base});
    if(receipt.file!==filename || !Number.isSafeInteger(receipt.size) || receipt.size<0 || receipt.size>64*1024*1024 || !/^[a-f0-9]{64}$/.test(receipt.sha256))throw Error('cleanup receipt');
    stage='cleanup-transfer';
    const data=await client.readFile(req.worktree,filename,undefined,64*1024*1024+1,30000);
    const bytes=Buffer.from(data.bytes);
    if(bytes.length!==receipt.size || createHash('sha256').update(bytes).digest('hex')!==receipt.sha256)throw Error('cleanup receipt');
    return {patch:bytes.toString('base64'),size:receipt.size,sha256:receipt.sha256,remoteFile:filename};
  }
  if(req.action==='archive-workspace') {
    await ownedWorkspace();
    const verified=await remoteHelper(req.workspaceId,req.worktree,{action:'verify',worktree:req.worktree,file:req.remoteFile,base:req.base,sha256:req.sha256});
    if(verified?.verified!==true)throw Error('cleanup receipt');
    await ownedWorkspace();
    const archived=await client.archiveWorkspace(req.workspaceId);
    if(archived?.error || !archived?.archivedAt)throw Error('cleanup receipt');
    return {archivedAt:archived.archivedAt};
  }
  if(req.action==='finish-workspace') {
    if(await anyWorkspaceReferences(req.worktree))return {worktreeRemoved:false,branch:'not-checked'};
    return remoteHelper(req.preflightWorkspaceId,req.repo,{action:'finish',repo:req.repo,worktree:req.worktree,branch:req.branch});
  }
  if(req.action==='recover') {
    return {agents:(await inventory()).filter(a=>!a.archivedAt && a.labels?.paseo_bot_attempt===req.attempt).map(a=>({agentId:a.id,workspaceId:a.workspaceId,cwd:a.cwd}))};
  }
  if(req.action==='observe') {
    const current=await client.fetchAgent({agentId:req.agentId,timeout:10000});
    if(!current?.agent || current.agent.labels?.paseo_bot_attempt!==req.attempt) throw Error('ownership');
    const r=await client.waitForFinish(req.agentId,1000);
    const final = r.status === 'error' ? await client.fetchAgent({agentId:req.agentId,timeout:10000}) : current;
    if(!final?.agent || final.agent.labels?.paseo_bot_attempt!==req.attempt || final.agent.workspaceId!==current.agent.workspaceId || final.agent.cwd!==current.agent.cwd) throw Error('ownership');
    const lastError = final.agent.lastError ?? r.final?.lastError ?? r.error;
    const error = typeof lastError === 'string' ? lastError : (typeof lastError?.message === 'string' ? lastError.message : '');
    const quota = /(?:rate[ _-]?limit|usage limit|quota exceeded|insufficient.quota|too many requests|\b429\b|credit balance|out of credits)/i.test(error);
    const unavailable = /(?:model.{0,60}(?:not found|not available|unsupported|does not exist)|(?:unknown|invalid) model)/i.test(error);
    return {status:r.status,message:r.lastMessage ?? '',errorKind:final.agent.status === 'error' ? (quota?'quota':unavailable?'model-unavailable':'other') : '',workspaceId:current.agent.workspaceId,cwd:current.agent.cwd};
  }
  if(req.action==='repair') {
    const current=await client.fetchAgent({agentId:req.agentId,timeout:10000});
    if(current?.agent?.labels?.paseo_bot_attempt!==req.attempt || current.agent.status!=='idle')throw Error('repair ownership/state');
    await client.sendMessage(req.agentId,req.prompt);
    return {accepted:true};
  }
  if(req.action==='launch') {
    stage='profile';
    const c=await client.getDaemonConfig();
    const matches=profileRows(c.config ?? c).filter(p=>p.name===req.profile);
    if(matches.length!==1) throw Error('profile');
    const p={...matches[0]};
    const aliases={sol:['codex','gpt-6.1-sol'],claude:['claude','claude-opus-5-5'],go:['opencode','opencode-go/deepseek-v4.1-flash']};
    if(req.modelAlias) {
      const chosen=aliases[req.modelAlias];
      if(!chosen || p.provider!==chosen[0]) throw Error('profile unsupported');
      if(chosen[1]) p.model=chosen[1];
      if(req.effort && req.effort!=='auto') {
        if(!['low','medium','high'].includes(req.effort)) throw Error('profile unsupported');
        // DeepSeek Flash exposes only low/high/max thinking; medium maps up rather than failing launch.
        p.thinkingOptionId=req.modelAlias==='go' && req.effort==='medium' ? 'high' : req.effort;
      } else if(req.modelAlias==='sol') p.thinkingOptionId='high';
    }
    // CLI has no feature flags. Refuse rather than silently drop configured values.
    if(!p.provider || !p.model || Object.keys(p.featureValues ?? {}).length) throw Error('profile unsupported');
    let entry;
    // A fresh cwd can initially publish an incomplete provider snapshot while
    // discovery warms. Only repeat this read-only probe, never agent creation.
    for(let probe=0;probe<5;probe++) {
      const providers=await client.getProvidersSnapshot({cwd:req.repo});
      entry=providers.entries?.find(e=>e.provider===p.provider);
      if(entry?.enabled===false || (entry?.enabled && entry.status==='ready'))break;
      if(probe<4)await new Promise(resolve=>setTimeout(resolve,400*(probe+1)));
    }
    if(!entry?.enabled || entry.status!=='ready')throw Error('provider unavailable');
    // Bot agents run permissive by default; an explicit valid profile mode wins.
    const permissive={codex:'full-access',claude:'bypassPermissions',opencode:'build'}[p.provider];
    const mode=p.modeId ?? (entry.modes?.some(m=>m.id===permissive) ? permissive : entry.defaultModeId);
    if(mode && !entry.modes?.some(m=>m.id===mode))throw Error('unknown mode');
    const argv=['run','--no-wait','--json','--provider',p.provider,'--model',p.model,'--cwd',req.repo,'--title',req.title,'--label','paseo_bot_attempt='+req.attempt];
    if(p.thinkingOptionId)argv.push('--thinking',p.thinkingOptionId);
    // CLI/server creation otherwise chose "auto" on 0.13.1 even when the
    // configured provider default was auto-review. Preserve the actual default.
    if(mode)argv.push('--mode',mode);
    if(!req.workspaceId)throw Error('workspace receipt');
    argv.push('--workspace',req.workspaceId);
    argv.push('--',req.prompt);
    const env={...process.env,PASEO_HOST:target};
    // Prevent inherited caller workspace/parent and conflicting home on a remote target.
    for(const key of ['PASEO_HOME','PASEO_AGENT_ID','PASEO_WORKSPACE_ID'])delete env[key];
    const module=process.env.PASEO_MULTI_HOST_CLIENT_MODULE;
    const cli=path.join(path.dirname(path.dirname(module)),'index.js');
    const prefix=JSON.parse(process.env.PASEO_BOT_RUNTIME_PREFIX ?? '[]');
    stage='cli';
    const raw=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[...prefix,cli,...argv],{env,stdio:['ignore','pipe','pipe']});
      let out='';const timer=setTimeout(()=>{child.kill();reject(Error('launch outcome unknown'));},45000);
      child.stdout.on('data',b=>{out+=b;if(out.length>1000000)child.kill();});
      child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(Error('launch'));});
      child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(Error('launch'));else {try{resolve(JSON.parse(out));}catch{reject(Error('schema'));}}});
    });
    stage='receipt';
    const a=raw.data ?? raw;
    if(!a.agentId)throw Error('receipt');
    const fetched=await client.fetchAgent({agentId:a.agentId});
    if(!fetched?.agent?.workspaceId)throw Error('workspace receipt');
    return {agentId:a.agentId,workspaceId:fetched.agent.workspaceId,cwd:a.cwd,profile:req.profile,provider:p.provider,model:p.model,modeId:mode,thinkingOptionId:p.thinkingOptionId};
  }
  throw Error('action');
}
try {process.stdout.write(JSON.stringify({ok:true,result:await main()}));}
catch(e) {
  const known=new Set(['identity','connection','profile','profile unsupported','provider unavailable','unknown mode','launch','launch outcome unknown','schema','receipt','workspace receipt','ownership','cleanup terminal create','cleanup terminal capture','cleanup helper error','cleanup terminal timeout','cleanup terminal close','cleanup receipt']);
  // Fixed diagnostic vocabulary only. Never return raw transport/CLI messages.
  const reason=known.has(e?.message)?e.message.replaceAll(' ','-'):'operation';
  process.stdout.write(JSON.stringify({ok:false,stage,reason,error:'Paseo operation failed; inspect private configuration.'}));process.exitCode=1;
}
finally {await client?.close().catch(()=>{});}
