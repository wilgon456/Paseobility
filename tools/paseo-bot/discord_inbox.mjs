import * as core from './discord_core.mjs';

// Serialize live and replayed messages through the same handler. A fresh READY
// enqueues recovery before later gateway events, preventing cursor jumps.
export class DiscordInbox {
  constructor({config,relay,request,parentFor,attachments,typing=()=>{}}) {
    Object.assign(this,{config,relay,request,parentFor,attachments,typing});
    this.chain=Promise.resolve();this.pending=new Map();this.blocked=new Set();
  }
  enqueue(fn){const result=this.chain.then(fn,fn);this.chain=result.catch(()=>{});return result;}
  live(message){
    const key=message.channel_id;const ids=this.pending.get(key) || new Set();ids.add(message.id);this.pending.set(key,ids);
    return this.enqueue(async()=>{try{return await this.handle(message);}finally{ids.delete(message.id);if(!ids.size)this.pending.delete(key);}});
  }
  async createThread(id,name){
    try{return await this.request('POST',`/channels/${this.config.channelId}/messages/${id}/threads`,{name,auto_archive_duration:1440});}
    catch(error){
      // A retry after a lost acknowledgement can find the thread created from
      // the message. Discord assigns that thread the starter message ID.
      try{const thread=await this.request('GET',`/channels/${id}`);if(thread?.id===id && thread.parent_id===this.config.channelId)return thread;}catch{}
      throw error;
    }
  }
  async handle(message){
    const channel=message.channel_id;
    if(!core.SNOWFLAKE.test(message.id || '') || message.guild_id!==this.config.guildId)return;
    const parent=await this.parentFor(channel);
    if(channel!==this.config.channelId && parent!==this.config.channelId)return;
    if(this.blocked.has(channel))return;
    const last=this.relay.lastSeen[channel];if(last && BigInt(message.id)<=BigInt(last))return;
    if(core.acceptMessage(this.config,message,parent)){
      const text=await this.attachments(message);
      if(text.trim()){
        let destination=channel;
        try {
          destination=await core.conversationForMessage(this.config,message,text,(id,name)=>this.createThread(id,name));
          const starterSeen=destination!==channel && this.relay.lastSeen[destination] && BigInt(this.relay.lastSeen[destination])>=BigInt(message.id);
          if(!starterSeen){
            this.typing(destination);await this.relay.input(destination,text,message.id);
            if(destination!==channel)this.relay.markSeen(destination,message.id);
          }
        } catch(error){
          this.blocked.add(channel);
          await this.request('POST',`/channels/${destination}/messages`,{content:'메시지를 처리하지 못했어요. 연결을 확인한 뒤 다시 보내 주세요.',allowed_mentions:{parse:[]}}).catch(()=>{});
          throw error;
        }
      }
    }
    this.relay.markSeen(channel,message.id);
  }
  recover(){return this.enqueue(async()=>{
    this.blocked.clear();
    // Parent first: a missed starter may add a thread that also needs replay.
    const channels=[this.config.channelId];let failed=false;const active=new Set();
    try {const result=await this.request('GET',`/guilds/${this.config.guildId}/threads/active`);for(const t of result?.threads || [])if(t.parent_id===this.config.channelId && !t.thread_metadata?.archived)active.add(t.id);}catch{}
    for(let i=0;i<channels.length;i++){
      const channel=channels[i];
      try{await this.recoverChannel(channel);}catch{failed=true;}
      if(i===0)for(const [id,record] of Object.entries(this.relay.map))if((!record.archived || active.has(id)) && id!==channel && !channels.includes(id))channels.push(id);
    }
    if(failed)throw Error('Discord history recovery incomplete');
  });}
  async recoverChannel(channel){
    let cursor=this.relay.lastSeen[channel];
    if(!cursor){
      const latest=await this.request('GET',`/channels/${channel}/messages?limit=1`);
      const id=Array.isArray(latest) && core.SNOWFLAKE.test(latest[0]?.id || '')?latest[0].id:'0';
      const waiting=[...(this.pending.get(channel) || [])].filter(x=>core.SNOWFLAKE.test(x)).sort((a,b)=>BigInt(a)<BigInt(b)?-1:1)[0];
      cursor=waiting && BigInt(waiting)<=BigInt(id)?(BigInt(waiting)-1n).toString():id;
      this.relay.markSeen(channel,cursor);
    }
    for(;;){
      const rows=await this.request('GET',`/channels/${channel}/messages?after=${cursor}&limit=100`);
      if(!Array.isArray(rows))throw Error('Discord history unavailable');
      const messages=rows.filter(x=>core.SNOWFLAKE.test(x?.id || '') && BigInt(x.id)>BigInt(cursor)).sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
      if(!messages.length)return;
      for(const message of messages){message.guild_id ??=this.config.guildId;message.channel_id ??=channel;await this.handle(message);cursor=message.id;}
      if(rows.length<100)return;
    }
  }
}
