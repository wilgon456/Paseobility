import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const fileNonce=id=>createHash('sha256').update(`file:${id}`).digest('hex').slice(0,24);

export function discordFileForm(job) {
  const form=new FormData();
  form.append('payload_json',JSON.stringify({content:job.caption,nonce:fileNonce(job.id),enforce_nonce:true,allowed_mentions:{parse:[]}}));
  form.append('files[0]',new Blob([job.bytes]),job.name);
  return form;
}

// Agent-created file requests are sent by the gateway, which holds the Discord token.
export async function deliverFiles({home,threads,channelId,sendFile,sendError}) {
  const dir=path.join(home,'.relay-outbox');fs.mkdirSync(dir,{recursive:true});
  for(const name of fs.readdirSync(dir).filter(n=>/^[a-f0-9-]+\.json$/i.test(n)).sort()){
    const requestPath=path.join(dir,name);let job;
    try {job=JSON.parse(fs.readFileSync(requestPath,'utf8'));}catch {continue;}
    if(!job || typeof job.id!=='string' || typeof job.file!=='string' || typeof job.thread!=='string')continue;
    if(job.thread!==channelId && !threads[job.thread])continue;
    let bytes;
    try {
      const info=fs.statSync(job.file);if(!info.isFile() || info.size>25*1024*1024)throw Error('file unavailable');
      bytes=fs.readFileSync(job.file);
    }catch{
      await sendError(job.thread,'파일을 보내지 못했어요. 파일이 있는지와 크기를 확인해 주세요.',job.id);
      fs.unlinkSync(requestPath);continue;
    }
    try {await sendFile(job.thread,{id:job.id,name:path.basename(job.file),caption:String(job.caption || '').slice(0,1800),bytes});}
    catch(error){
      if(!/Discord HTTP 4(?!29)\d\d/.test(String(error?.message || '')))throw error;
      await sendError(job.thread,'Discord에서 파일을 받지 못했어요. 파일 크기나 채널 권한을 확인해 주세요.',job.id);
    }
    fs.unlinkSync(requestPath);
  }
}
