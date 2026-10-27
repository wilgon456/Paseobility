// Runs under the installed Paseo/Electron Node runtime. Never emits raw errors/config.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
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
async function main() {
  const {connectToDaemon}=await import(pathToFileURL(process.env.PASEO_MULTI_HOST_CLIENT_MODULE).href);
  const target=endpoint(req.host);
  client=await connectToDaemon({target:{kind:'endpoint',host:target},timeout:10000});
  stage='identity';
  const status=await client.getDaemonStatus({timeout:10000});
  if(status.serverId!==req.host.serverId) throw Error('identity');
  if(req.action==='discover') {
    const config=await client.getDaemonConfig();
    const projects=await client.listProjects();
    const agents=await inventory();
    return {serverId:status.serverId,version:status.version,profiles:profileRows(config.config ?? config),projects:projects.projects,busy:agents.filter(a=>!a.archivedAt && !['idle','closed','error'].includes(a.status)).length};
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
    const aliases={terra:['codex','gpt-6.1-terra'],sol:['codex','gpt-6.1-sol'],claude:['claude','claude-fable-5-1'],go:['opencode','opencode-go/glm-5.3-flash']};
    if(req.modelAlias) {
      const chosen=aliases[req.modelAlias];
      if(!chosen || p.provider!==chosen[0]) throw Error('profile unsupported');
      if(chosen[1]) p.model=chosen[1];
      if(req.effort && req.effort!=='auto') {
        if(!['low','medium','high'].includes(req.effort)) throw Error('profile unsupported');
        p.thinkingOptionId=req.effort;
      } else if(['terra','sol'].includes(req.modelAlias)) p.thinkingOptionId='high';
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
    const mode=p.modeId ?? entry.defaultModeId;
    if(mode && !entry.modes?.some(m=>m.id===mode))throw Error('unknown mode');
    const argv=['run','--no-wait','--json','--provider',p.provider,'--model',p.model,'--cwd',req.repo,'--title',req.title,'--label','paseo_bot_attempt='+req.attempt];
    if(p.thinkingOptionId)argv.push('--thinking',p.thinkingOptionId);
    // CLI/server creation otherwise chose "auto" on 0.13.1 even when the
    // configured provider default was auto-review. Preserve the actual default.
    if(mode)argv.push('--mode',mode);
    if(req.workspaceId)argv.push('--workspace',req.workspaceId);
    else if(req.branch)argv.push('--new-workspace','worktree','--worktree-mode','branch-off','--new-branch',req.branch,'--base',req.base);
    else argv.push('--new-workspace','local');
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
  const known=new Set(['identity','connection','profile','profile unsupported','provider unavailable','unknown mode','launch','launch outcome unknown','schema','receipt','workspace receipt']);
  // Fixed diagnostic vocabulary only. Never return raw transport/CLI messages.
  const reason=known.has(e?.message)?e.message.replaceAll(' ','-'):'operation';
  process.stdout.write(JSON.stringify({ok:false,stage,reason,error:'Paseo operation failed; inspect private configuration.'}));process.exitCode=1;
}
finally {await client?.close().catch(()=>{});}
