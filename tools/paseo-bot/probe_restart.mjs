// Separate-process integration probe for delivery after relay downtime.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {Relay,connect} from './relay.mjs';
const [phase,dir]=process.argv.slice(2);if(!['start','resume','finish'].includes(phase)||!dir)throw Error('phase and test directory required');
const keep=setInterval(()=>{},1000),client=await connect(process.env.PASEO_MULTI_HOST_CLIENT_MODULE);
const outputFile=path.join(dir,'out.json'),stateDir=path.join(dir,'state'),home=path.join(dir,'home');let sent=[];
try{sent=JSON.parse(fs.readFileSync(outputFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const relay=new Relay({client,stateDir,home,source:path.dirname(fileURLToPath(import.meta.url)),send:async(_,text)=>{sent.push(text);fs.writeFileSync(outputFile,JSON.stringify(sent));}});
try {
  await relay.readyHints;
  if(phase==='start')await relay.input('restart-probe','10초 뒤에 RESTART_PROCESS_OK 라고만 답해 줘.');
  if(phase==='resume'){
    await relay.baseline();const id=relay.map['restart-probe'].agentId;
    for(let i=0;i<90;i++){const a=(await client.fetchAgent({agentId:id}))?.agent;if(a && ['idle','error','closed'].includes(a.status)){await relay.poll('restart-probe');break;}await new Promise(r=>setTimeout(r,1000));}
  }
  if(phase==='finish'){
    await relay.closeThread('restart-probe',true);const workspace=await relay.workspace();await client.archiveWorkspace(workspace.id);if(workspace.projectId)await client.removeProject(workspace.projectId);
  }
}finally {for(const t of [...relay.watches.keys()])relay.unwatch(t);await client.close();clearInterval(keep);}
