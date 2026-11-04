import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

export function writeMapping(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const tmp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), {mode:0o600});
  for (let i=0;;i++) {
    try { fs.renameSync(tmp,file); return; }
    catch(e) {
      if(i===5 || !['EPERM','EACCES','EBUSY'].includes(e.code)) { try { fs.unlinkSync(tmp); } catch {} throw e; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50*(i+1));
    }
  }
}
export function loadState(file) {
  try {
    const value=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
    if(!value || typeof value!=='object' || Array.isArray(value))throw Error('invalid mapping');
    const versioned=value.version===2 && value.threads && typeof value.threads==='object';
    const threads=Object.fromEntries(Object.entries(versioned?value.threads:value).map(([thread,v])=>{
      if(typeof v==='string') return [thread,{agentId:v,delivered:0}];
      if(!v || typeof v.agentId!=='string' || !Number.isSafeInteger(v.delivered) || v.delivered<0)throw Error('invalid mapping');
      return [thread,v];
    }));
    const lastSeen=versioned && value.lastSeen && typeof value.lastSeen==='object' && !Array.isArray(value.lastSeen)?value.lastSeen:{};
    return {threads,lastSeen};
  } catch(e) { if(e.code==='ENOENT')return {threads:{},lastSeen:{}};throw e; }
}
export function loadMapping(file) { return loadState(file).threads; }
export function prepareHome(home,source,projectsFile=path.join(os.homedir(),'.config/paseo-bot/projects.json')) {
  fs.mkdirSync(home,{recursive:true});
  const guidance=fs.readFileSync(new URL('./FRONT_AGENT.md',import.meta.url),'utf8').replaceAll('{{SOURCE}}',source).replaceAll('{{HOME}}',home);
  for(const name of ['AGENTS.md','CLAUDE.md'])fs.writeFileSync(path.join(home,name),guidance,'utf8');
  const preferences=path.join(home,'PREFERENCES.md'); if(!fs.existsSync(preferences))fs.writeFileSync(preferences,'# Preferences\n','utf8');
  try {
    const data=JSON.parse(fs.readFileSync(projectsFile,'utf8').replace(/^\uFEFF/,''));
    const lines=['# Project location hints','', 'These are hints; verify the location before making changes.',''];
    for(const project of data.projects || []) for(const target of project.targets || []) {
      if(target.enabled!==false && project.id && target.machine && target.repo) lines.push(`- ${project.id} | ${target.machine} | ${target.repo}`);
    }
    fs.writeFileSync(path.join(home,'PROJECT_HINTS.md'),lines.join('\n')+'\n','utf8');
  } catch(e) { if(e.code!=='ENOENT') throw e; }
}
export async function connect(modulePath,home=process.env.PASEO_HOME || path.join(os.homedir(),'.paseo')) {
  if(!modulePath)throw Error('Paseo client module unavailable');
  const {connectToDaemon}=await import(pathToFileURL(modulePath).href);
  return connectToDaemon({target:{kind:'instance',home},timeout:10000});
}
export async function routedClient(origin,serverId) {
  const base=path.resolve(path.dirname(process.env.PASEO_MULTI_HOST_CLIENT_MODULE),'../../../client/dist');
  const {DaemonClient}=await import(pathToFileURL(path.join(base,'daemon-client.js')).href);
  const {createHostChannelTransport}=await import(pathToFileURL(path.join(base,'hosts/index.js')).href);
  const scope=randomUUID(), route=await origin.openHostRoute(serverId,scope);
  const client=new DaemonClient({url:'ws://routed-host/ws',clientId:scope,transportFactory:createHostChannelTransport(origin,serverId,scope,route),reconnect:{enabled:false}});
  try { await client.connect(); return client; } catch(e) { await client.close().catch(()=>{});throw e; }
}
const resting = status => ['idle','closed','error'].includes(status);
export class Relay {
  constructor({client,stateDir,home,source,config={},send,typing=()=>{},remoteClient=routedClient}) {
    this.client=client; this.file=path.join(stateDir,'threads.json'); const state=loadState(this.file);this.map=state.threads;this.lastSeen=state.lastSeen;
    this.home=home; this.source=source; this.config={provider:'codex',model:'gpt-6.1-terra',thinking:'high',mode:'full-access',...config};
    this.sendOutput=send; this.typing=typing; this.remoteClient=remoteClient; this.chains=new Map(); this.watches=new Map(); this.next=new Map(); this.versions=new Map();
    this.workspacePromise=null; this.requests=path.join(home,'.relay-requests');
    prepareHome(home,source,config.projectsFile); fs.mkdirSync(this.requests,{recursive:true});
    this.readyHints=this.refreshHints().catch(()=>{});
  }
  async refreshHints() {
    if(typeof this.client.listHosts!=='function')return;
    const file=path.join(this.home,'PROJECT_HINTS.md');if(!fs.existsSync(file))return;
    const directory=await this.client.listHosts();
    const hosts=(directory.hosts || []).filter(h=>h.enabled && h.status==='online' && h.serverId);
    const results=await Promise.allSettled(hosts.map(async host=>{
      const remote=await this.remoteClient(this.client,host.serverId);let cursor;const entries=[];
      try {do {const page=await remote.fetchWorkspaces({filter:{includeBackground:true},page:{limit:200,...(cursor?{cursor}:{})}});entries.push(...page.entries);cursor=page.pageInfo?.hasMore?page.pageInfo.nextCursor:null;}while(cursor);}
      finally {await remote.close().catch(()=>{});}
      return {host,entries};
    }));
    const snapshots=results.filter(x=>x.status==='fulfilled').map(x=>x.value);
    const lines=fs.readFileSync(file,'utf8').split('\n').map(line=>{
      const parts=line.match(/^- (.*?) \| (.*?) \| (.*)$/);if(!parts)return line;
      const found=snapshots.find(x=>x.host.label.toLowerCase()===parts[2].toLowerCase());if(!found)return line;
      const ws=found.entries.find(x=>x.workspaceDirectory===parts[3]);
      return ws?`${line} | workspace ${ws.id} | server ${found.host.serverId}`:line;
    });
    fs.writeFileSync(file,lines.join('\n'),'utf8');
  }
  persist(){writeMapping(this.file,{version:2,threads:this.map,lastSeen:this.lastSeen});}
  markSeen(channel,id){if(!this.lastSeen[channel] || BigInt(id)>BigInt(this.lastSeen[channel])){this.lastSeen[channel]=id;this.persist();}}
  serial(thread,fn){const previous=this.chains.get(thread)||Promise.resolve();const result=previous.catch(()=>{}).then(fn);this.chains.set(thread,result);result.finally(()=>{if(this.chains.get(thread)===result)this.chains.delete(thread);}).catch(()=>{});return result;}
  async workspace() {
    if(!this.workspacePromise)this.workspacePromise=this.client.openProject(this.home).then(r=>{if(r.error || !r.workspace?.id)throw Error('assistant workspace unavailable');return r.workspace;}).catch(e=>{this.workspacePromise=null;throw e;});
    return this.workspacePromise;
  }
  watch(thread) {
    if(this.watches.has(thread) || !this.map[thread] || typeof this.client.subscribeAgentTimeline!=='function')return;
    const wake=()=>{this.versions.set(thread,(this.versions.get(thread)||0)+1);this.next.set(thread,0);};
    const stop=this.client.subscribeAgentTimeline(this.map[thread].agentId,wake);
    this.watches.set(thread,typeof stop==='function'?stop:()=>stop?.unsubscribe?.());
  }
  unwatch(thread){try{this.watches.get(thread)?.();}catch{} this.watches.delete(thread);this.next.delete(thread);}
  reconnect(client){for(const thread of [...this.watches.keys()])this.unwatch(thread);this.client=client;this.workspacePromise=null;for(const [thread,r] of Object.entries(this.map))if(!r.archived){this.watch(thread);this.next.set(thread,0);}}
  async create(thread,text) {
    const workspace=await this.workspace();
    const agent=await this.client.createAgent({provider:this.config.provider,model:this.config.model,thinkingOptionId:this.config.thinking,modeId:this.config.mode,cwd:this.home,workspaceId:workspace.id,title:'Discord conversation',initialPrompt:text,env:{PASEO_BOT_ASSISTANT_HOME:this.home},labels:{paseo_bot_thread:thread}});
    this.map[thread]={agentId:agent.id,delivered:0};this.persist();this.watch(thread);this.next.set(thread,0);return agent.id;
  }
  async input(thread,text,messageId=randomUUID()) {
    return this.serial(thread,async()=>{
      let record=this.map[thread];
      if(!record)return this.create(thread,text);
      let agent=(await this.client.fetchAgent({agentId:record.agentId}))?.agent;
      if(!agent){this.unwatch(thread);delete this.map[thread];this.persist();return this.create(thread,text);}
      if(agent.archivedAt || agent.status==='closed' || agent.status==='error')await this.client.refreshAgent(record.agentId);
      delete record.archived;delete record.lastError;record.errorGeneration=(record.errorGeneration || 0)+1;this.persist();this.watch(thread);this.next.set(thread,0);
      await this.client.sendMessage(record.agentId,text,{messageId,activeTurnBehavior:'steer'});
      return record.agentId;
    });
  }
  async timeline(id,cursor) {
    let page=await this.client.fetchAgentTimeline(id,{direction:cursor?'after':'tail',...(cursor?{cursor}:{}),limit:0,projection:'projected',timeout:10000});
    if(page.staleCursor || page.gap)page=await this.client.fetchAgentTimeline(id,{direction:'tail',limit:0,projection:'projected',timeout:10000});
    return page;
  }
  async baseline() {for(const [thread,r] of Object.entries(this.map))if(!r.archived){this.watch(thread);this.next.set(thread,0);}}
  async pollDue(){await Promise.all(Object.keys(this.map).filter(t=>!this.map[t].archived && Date.now()>=(this.next.get(t)||0)).map(t=>this.poll(t)));}
  async poll(thread){return this.serial(thread,async()=>{
    const record=this.map[thread];if(!record || record.archived)return;
    const version=this.versions.get(thread)||0;
    const agent=(await this.client.fetchAgent({agentId:record.agentId}))?.agent;
    if(!agent){this.unwatch(thread);this.next.set(thread,Date.now()+60000);return;}
    if(agent.archivedAt){record.archived=true;this.persist();this.unwatch(thread);return;}
    for(const p of agent.pendingPermissions || [])if(p.id)await this.client.respondToPermission(agent.id,p.id,{behavior:'allow'});
    if(!resting(agent.status)){this.typing(thread);this.next.set(thread,Date.now()+2000);return;}
    const page=await this.timeline(agent.id,record.scan);
    const entries=page.entries || [];
    let pending=null,turn=null,scanned=record.delivered;
    const flush=async()=>{if(!pending)return;await this.sendOutput(thread,pending.item.text,{agentId:agent.id,seq:pending.seqEnd});record.delivered=Math.max(record.delivered,pending.seqEnd);this.persist();pending=null;};
    for(const entry of entries){
      if(!Number.isSafeInteger(entry.seqEnd) || entry.seqEnd<=record.delivered)continue;
      if(entry.item?.type==='user_message' || (entry.turnId && turn && entry.turnId!==turn))await flush();
      if(entry.turnId)turn=entry.turnId;
      if(entry.item?.type==='assistant_message' && entry.item.text?.trim())pending=entry;
      scanned=Math.max(scanned,entry.seqEnd);
    }
    await flush();
    if(Number.isSafeInteger(page.endCursor?.seq))scanned=Math.max(scanned,page.endCursor.seq);
    if(scanned>record.delivered){record.delivered=scanned;this.persist();}
    if(agent.status==='error'){
      const reason=errorReason(agent,entries); const fingerprint=JSON.stringify([agent.id,record.errorGeneration || 0]);
      if(record.lastError!==fingerprint){await this.sendOutput(thread,reason,{agentId:agent.id,seq:`error-${agent.id}-${record.errorGeneration || 0}`});record.lastError=fingerprint;this.persist();}
    } else if(record.lastError){delete record.lastError;record.errorGeneration=(record.errorGeneration || 0)+1;this.persist();}
    if(page.endCursor){record.scan=page.endCursor;this.persist();}
    await this.applySwitch(thread,agent);
    if(this.map[thread]===record && (this.versions.get(thread)||0)===version)this.next.set(thread,Date.now()+60000);
  });}
  async applySwitch(thread,agent) {
    const file=path.join(this.requests,`${thread}.json`);let request;
    try {request=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return;throw e;}
    if(!request.provider || !request.model)throw Error('invalid model request');
    if(request.provider===agent.provider){
      await this.client.setAgentModel(agent.id,request.model);
      if(request.thinking)await this.client.setAgentThinkingOption(agent.id,request.thinking);
      fs.unlinkSync(file);await this.sendOutput(thread,`대화 모델을 ${request.model}로 바꿨어요.`,{agentId:agent.id,seq:`switch-${request.id}`});return;
    }
    const history=await this.client.fetchAgentTimeline(agent.id,{direction:'tail',limit:80,projection:'projected',timeout:10000});
    const transcript=(history.entries || []).filter(e=>['assistant_message','user_message'].includes(e.item?.type) && typeof e.item.text==='string').slice(-30).map(e=>`${e.item.type}: ${e.item.text.slice(0,4000)}`).join('\n\n').slice(-24000);
    const preferences=fs.readFileSync(path.join(this.home,'PREFERENCES.md'),'utf8').slice(0,12000);
    const initialPrompt=`You are the successor for this Discord conversation. Continue naturally using the history and preferences below. Your provider/model have already changed. Reply briefly in Korean that the conversation model has changed. Do not reveal the handoff.\n\nPreferences:\n${preferences}\n\nRecent conversation:\n${transcript}`;
    const replacement=await this.client.createAgent({provider:request.provider,model:request.model,thinkingOptionId:request.thinking || undefined,modeId:request.provider==='claude'?'bypassPermissions':request.provider==='codex'?'full-access':undefined,cwd:this.home,workspaceId:agent.workspaceId,title:agent.title || 'Discord conversation',initialPrompt,env:{PASEO_BOT_ASSISTANT_HOME:this.home},labels:{...agent.labels,paseo_bot_thread:thread}});
    this.unwatch(thread);this.map[thread]={agentId:replacement.id,delivered:0};this.persist();fs.unlinkSync(file);this.watch(thread);this.next.set(thread,0);
    await this.client.archiveAgent(agent.id);
  }
  async closeThread(thread,deleted=false){return this.serial(thread,async()=>{
    const record=this.map[thread];if(!record)return;
    const clients=[this.client];
    try {
      const hosts=await this.client.listHosts?.();
      for(const host of hosts?.hosts || [])if(host.enabled && host.status==='online' && host.serverId){try{clients.push(await this.remoteClient(this.client,host.serverId));}catch{}}
      let runningWorker=false;
      for(const c of clients){try {let cursor;do{const page=await c.fetchAgents({includeBackground:true,page:{limit:200,...(cursor?{cursor}:{})}});
        for(const e of page.entries || []){const a=e.agent;if(a?.id!==record.agentId && !a?.archivedAt && a?.labels?.paseo_bot_thread===thread){if(deleted || resting(a.status))await c.archiveAgent(a.id);else runningWorker=true;}}
        cursor=page.pageInfo?.hasMore?page.pageInfo.nextCursor:null;
      }while(cursor);}catch(e){if(c===this.client)throw e;process.stderr.write('remote worker cleanup failed\n');}}
      const front=(await this.client.fetchAgent({agentId:record.agentId}))?.agent;
      if(front && !front.archivedAt && (deleted || (resting(front.status) && !runningWorker)))await this.client.archiveAgent(record.agentId);
      if(deleted){this.unwatch(thread);delete this.map[thread];delete this.lastSeen[thread];}
      else if(!front || front.archivedAt || (resting(front.status) && !runningWorker)){this.unwatch(thread);record.archived=true;}
      this.persist();
    } finally {for(const c of clients.slice(1))await c.close().catch(()=>{});}
  });}
}
function errorReason(agent,entries=[]){
  const errors=entries.filter(e=>/error|failure/i.test(e.item?.type || '')).map(e=>e.item);
  const details=[agent.error,agent.lastError,agent.statusReason,agent.errorMessage,agent.runtimeInfo?.error,...errors].map(x=>typeof x==='string'?x:JSON.stringify(x ?? '')).join(' ').toLowerCase();
  if(/quota|usage limit|insufficient|credit|한도|잔액/.test(details))return '사용 한도에 도달해 답변을 마치지 못했어요. 한도를 확인한 뒤 다시 보내 주세요.';
  if(/rate.?limit|too many requests|429|요청 제한/.test(details))return '요청이 너무 많아 답변을 마치지 못했어요. 잠시 후 다시 보내 주세요.';
  if(/auth|unauthor|forbidden|credential|401|403|인증/.test(details))return '모델 연결 인증에 문제가 있어요. 연결 상태를 확인한 뒤 다시 보내 주세요.';
  if(/network|connect|timeout|연결/.test(details))return '모델 연결이 끊겨 답변을 마치지 못했어요. 잠시 후 다시 보내 주세요.';
  if(/model|unavailable|not found|unsupported|모델/.test(details))return '선택한 모델을 사용할 수 없어 답변을 마치지 못했어요. 모델을 확인한 뒤 다시 보내 주세요.';
  if(/crash|process|exit|종료/.test(details))return '에이전트 실행이 중단돼 답변을 마치지 못했어요. 다시 보내 주세요.';
  return '에이전트가 오류로 멈췄어요. 잠시 후 다시 보내 주세요.';
}
