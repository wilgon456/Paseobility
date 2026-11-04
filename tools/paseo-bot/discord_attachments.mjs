import fs from 'node:fs';
import path from 'node:path';

export async function downloadAttachments(message,home,download=fetch) {
  let text=message.content || '';
  for(const a of (message.attachments || []).slice(0,10)) {
    try {
      const url=new URL(a.url);if(url.protocol!=='https:' || !['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname) || a.size>25*1024*1024)throw Error();
      const response=await download(url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error();
      const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>25*1024*1024)throw Error();
      const dir=path.join(home,'attachments',message.id);fs.mkdirSync(dir,{recursive:true});
      const name=path.basename(String(a.filename || 'attachment').replace(/[\\/]/g,'_'));const target=path.join(dir,name);fs.writeFileSync(target,bytes);
      text+=`\n첨부 파일 : ${target}`;
    }catch {text+=`\n첨부 파일을 가져오지 못했어요 : ${String(a.filename || '').slice(0,100)}`;}
  }
  return text;
}
