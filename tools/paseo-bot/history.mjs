// Search Paseo's own agent timelines. No separate conversation database.
import fs from 'node:fs';
import {connect} from './relay.mjs';

export async function searchHistory(client,{query,limit=8,all=false}={}) {
  const needle=String(query || '').trim().toLocaleLowerCase();
  if(!needle)throw Error('A search query is required');
  const matches=[];let cursor;
  do {
    const page=await client.fetchAgents({filter:{includeArchived:true,includeBackground:true},page:{limit:200,...(cursor?{cursor}:{})}});
    for(const entry of page.entries || []){
      const a=entry.agent,thread=a?.labels?.paseo_bot_thread;
      if(!thread)continue;
      const history=await client.fetchAgentTimeline(a.id,{direction:'tail',limit:all?0:120,projection:'projected'});
      const items=(history.entries || []).filter(e=>['user_message','assistant_message'].includes(e.item?.type) && typeof e.item.text==='string');
      for(let i=0;i<items.length;i++)if(items[i].item.text.toLocaleLowerCase().includes(needle)){
        matches.push({thread,agentId:a.id,title:a.title || '',timestamp:items[i].timestamp || '',role:items[i].item.type,text:items[i].item.text.slice(0,1200),context:items[i+1]?.item?.text?.slice(0,800) || ''});
      }
    }
    cursor=page.pageInfo?.hasMore?page.pageInfo.nextCursor:null;
  }while(cursor);
  return matches.sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,Math.max(1,Math.min(Number(limit)||8,30)));
}

if(process.argv.includes('--run')){
  const request=JSON.parse(fs.readFileSync(0,'utf8'));const client=await connect(process.env.PASEO_MULTI_HOST_CLIENT_MODULE);
  try {process.stdout.write(JSON.stringify({ok:true,matches:await searchHistory(client,request)}));}
  catch(e){process.stdout.write(JSON.stringify({ok:false,error:String(e.message)}));process.exitCode=1;}
  finally {await client.close().catch(()=>{});}
}
