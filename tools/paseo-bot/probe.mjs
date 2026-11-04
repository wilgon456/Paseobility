// Explicit integration probe. Creates real agents; uses a temporary local home and cleans up its workspace.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Relay,connect} from './relay.mjs'; import {conversationForMessage} from './discord_core.mjs';
const keep=setInterval(()=>{},1000), dir=fs.mkdtempSync(path.join(os.tmpdir(),'paseo-relay-probe-'));
const client=await connect(process.env.PASEO_MULTI_HOST_CLIENT_MODULE);const results=[],out=[];
let relay;const stateDir=path.join(dir,'state'),home=path.join(dir,'assistant'),source=path.dirname(fileURLToPath(import.meta.url));
const save=()=>fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(results,null,2),'utf8');
const make=()=>new Relay({client,stateDir,home,source,send:async(thread,text,meta)=>out.push({thread,text,meta,at:Date.now()})});
relay=make();await relay.readyHints;const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitDone(thread,start,options={}) {
  for(let n=0;n<180;n++){
    await relay.pollDue();let id=relay.map[thread]?.agentId;const a=(await client.fetchAgent({agentId:id}))?.agent;
    if(a && ['idle','closed','error'].includes(a.status)) {
      await wait(400);await relay.pollDue();id=relay.map[thread]?.agentId;
      const current=(await client.fetchAgent({agentId:id}))?.agent;
      const fresh=out.filter(x=>x.thread===thread&&x.at>=start);
      if(fresh.length && (!options.provider || current?.provider===options.provider) && (!options.match || fresh.some(x=>options.match.test(x.text))) && ['idle','closed','error'].includes(current?.status))return {ms:Date.now()-start,agentId:id,provider:current.provider,model:current.model,output:fresh.map(x=>x.text)};
    }
    await wait(2000);
  }
  return {ms:Date.now()-start,timeout:true,output:out.filter(x=>x.thread===thread&&x.at>=start).map(x=>x.text)};
}
async function ask(index,thread,text,options={}){const start=Date.now();await relay.input(thread,text,`probe-${index}-${Date.now()}`);const r=await waitDone(thread,start,options);results.push({index,...r});save();return r;}
try {
  await ask(1,'probe','lotto_numb 테스트 명령이 뭐야',{match:/npm test/});
  await ask(2,'probe','방금 거 한 줄로 요약해줘');
  await ask(3,'probe','디스코드 스레드를 지우면 세션은 어떻게 돼?',{match:/보관|아카이브/});
  await ask(4,'probe','opus 5.5로 lotto_numb README 맨 아래에 테스트 방법 한 줄 추가하는 계획만 세워줘, 파일은 바꾸지 마',{match:/npm test/});
  const sw=await ask(5,'probe','대화 모델을 sonnet으로 바꿔',{provider:'claude'});
  if(sw.provider==='claude') {const r=await ask('5-context','probe','아까 lotto_numb 테스트 명령 한 줄로 다시 알려줘');}
  const start6=Date.now(), msg={id:'111111111111111111',channel_id:'222222222222222222'}, fake=[];
  const thread=await conversationForMessage({channelId:msg.channel_id},msg,'테스트 대화',async(id,name)=>{fake.push({id,name});return {id:'333333333333333333'};});
  await relay.input(thread,'한 단어로 인사해 줘.');results.push({index:6,thread,createCalls:fake,...await waitDone(thread,start6)});save();
  const start7=Date.now(),oldLength=out.length;await relay.input('probe','10초 뒤에 RESTART_PROBE_OK 라고만 답해 줘.');
  for(const t of [...relay.watches.keys()])relay.unwatch(t);
  let agentId=relay.map.probe.agentId;
  for(let n=0;n<90;n++){const a=(await client.fetchAgent({agentId}))?.agent;if(a && ['idle','error','closed'].includes(a.status))break;await wait(2000);}
  relay=make();await relay.readyHints;await relay.baseline();await relay.poll('probe');await relay.poll('probe');
  results.push({index:7,ms:Date.now()-start7,delivered:out.slice(oldLength).filter(x=>x.thread==='probe').map(x=>x.text)});save();
  const prompt='MAC_MINI의 lotto_numb 기존 작업공간에서 작업자 한 명을 만들어 7 곱하기 8을 계산하게 해 줘. Paseo 네이티브 create_agent에 serverId와 notifyOnFinish를 지정하고 내 paseo_bot_thread 레이블을 전달해 줘. 완료 알림을 받은 뒤 새 사용자 메시지를 기다리지 말고 결과를 이 대화에 알려 줘. 작업자는 완료 후 아카이브해 줘.';
  results.push({index:8,...await (async()=>{const start=Date.now();await relay.input(thread,prompt);return waitDone(thread,start,{match:/56/});})()});save();
}catch(e){results.push({error:e.message,stack:e.stack});save();}
finally {
  const cleanup=[];for(const thread of Object.keys(relay.map)){try{await relay.closeThread(thread,true);cleanup.push({thread,ok:true});}catch(e){cleanup.push({thread,ok:false,error:e.message});}}
  try{const workspace=await relay.workspace();await client.archiveWorkspace(workspace.id);if(workspace.projectId)await client.removeProject(workspace.projectId);cleanup.push({workspace:workspace.id,project:workspace.projectId,ok:true});}catch(e){cleanup.push({workspace:null,ok:false,error:e.message});}
  results.push({cleanup});save();await client.close();clearInterval(keep);process.stdout.write(`Probe results: ${dir}\n`);
}
