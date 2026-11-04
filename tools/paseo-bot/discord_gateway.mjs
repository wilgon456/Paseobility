#!/usr/bin/env node
// Token is read once from stdin; it never crosses argv, environment, or disk.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as core from './discord_core.mjs';
import {Relay, connect, writeMapping} from './relay.mjs';
import {DiscordInbox} from './discord_inbox.mjs';
import {downloadAttachments} from './discord_attachments.mjs';
import {deliverFiles,discordFileForm,fileNonce} from './outbound_files.mjs';
const API = 'https://discord.com/api/v10', DIR = path.dirname(fileURLToPath(import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stateIndex = process.argv.indexOf('--state');
if (stateIndex < 0 || !process.argv[stateIndex + 1]) throw Error('state required');
const stateDir = path.resolve(process.argv[stateIndex + 1]);
const config = core.parseConfig(JSON.parse(fs.readFileSync(path.join(stateDir, 'discord.json'), 'utf8').replace(/^\uFEFF/, '')));
if (!config?.enabled) throw Error('Discord configuration invalid or disabled');
let raw = ''; for await (const part of process.stdin) { raw += part; if (raw.length > 4096) throw Error('invalid token'); }
const token = JSON.parse(raw).token; raw = ''; if (typeof token !== 'string' || !token || /\s/.test(token)) throw Error('invalid token');
let botConfig = {}; try { botConfig = JSON.parse(fs.readFileSync(path.join(stateDir, 'relay.json'), 'utf8').replace(/^\uFEFF/, '')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const home = path.resolve(botConfig.home || path.join(stateDir, 'assistant'));
const source = path.resolve(botConfig.source || DIR);
let client = await connect(process.env.PASEO_MULTI_HOST_CLIENT_MODULE);
let status = 'connecting', lastEventAt = 0, lastAckAt = 0, socket, sessionId = '', resumeUrl = '', seq = null, acked = true, heartbeat, reconnectTimer, appId = '', stopped = false, attempts = 0;
const parents = new Map(), typingAt = new Map(), buckets = new Map(); let globalUntil = 0;
function log(event, data = {}) { process.stderr.write(JSON.stringify({time: new Date().toISOString(), event, ...data}) + '\n'); }
function health() { try { writeMapping(path.join(stateDir, 'discord-gateway.json'), {pid: process.pid, lastTickAt: Date.now()/1000, lastEventAt:lastEventAt/1000, lastAckAt:lastAckAt/1000, status}); } catch { log('health-write-failed'); } }
async function request(method, route, body, auth = true) {
  const key = `${method} ${route.replace(/\/\d{16,22}/g, '/:id').replace(/(webhooks|interactions)\/[^/]+\/[^/]+/, '$1/:id/:token')}`;
  for (let i=0; i<6; i++) {
    await sleep(Math.max(0, globalUntil-Date.now(), (buckets.get(key)||0)-Date.now()));
    let res;
    const multipart=body instanceof FormData;
    try { res = await fetch(API+route, {method, headers: {...(auth ? {authorization:`Bot ${token}`} : {}), ...(body === undefined || multipart ? {} : {'content-type':'application/json'})}, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000)}); }
    catch { if (i < 2) { await sleep(1000*(i+1)); continue; } throw Error('Discord network'); }
    if (res.status === 429) { const data = await res.json().catch(()=>({})); const delay = Math.max(1000, Number(data.retry_after || res.headers.get('retry-after') || 1)*1000); if(data.global)globalUntil=Date.now()+delay;else buckets.set(key,Date.now()+delay); continue; }
    if (res.status >= 500 && i < 2) { await sleep(1000*(i+1)); continue; }
    if (!res.ok) throw Error(`Discord HTTP ${res.status}`);
    return res.status === 204 ? null : res.json().catch(()=>null);
  }
  throw Error('Discord rate limit');
}
function typing(channel) { if(Date.now()-(typingAt.get(channel)||0)<8000)return; typingAt.set(channel,Date.now()); request('POST',`/channels/${channel}/typing`).catch(()=>{}); }
const relay = new Relay({client,stateDir,home,source,config:botConfig,typing,send:async(channel,text,delivery)=>{
  const chunks=core.chunkText(text);
  for(let i=0;i<chunks.length;i++){
    const nonce=createHash('sha256').update(`${channel}:${delivery.agentId}:${delivery.seq}:${i}`).digest('hex').slice(0,24);
    await request('POST',`/channels/${channel}/messages`,{content:chunks[i],nonce,enforce_nonce:true,allowed_mentions:{parse:[]}});
  }
}});
let reconnectingClient;
async function recoverClient() {
  if (!reconnectingClient) reconnectingClient = (async () => {
    const next = await connect(process.env.PASEO_MULTI_HOST_CLIENT_MODULE);
    const previous = client; client = next; relay.reconnect(next);
    await previous.close().catch(() => {});
  })().finally(() => { reconnectingClient = null; });
  return reconnectingClient;
}
async function parentFor(channel) {
  if(channel===config.channelId)return null;
  if(!parents.has(channel)) { const info=await request('GET',`/channels/${channel}`); parents.set(channel, info?.parent_id || null); }
  return parents.get(channel);
}
async function attachments(message) {
  return downloadAttachments(message,home);
}
const inbox=new DiscordInbox({config,relay,request,parentFor,attachments,typing});
let historyRetry=null;
function recoverHistory(){
  clearTimeout(historyRetry);historyRetry=null;
  inbox.recover().catch(()=>{log('history-recovery-failed');if(!stopped)historyRetry=setTimeout(recoverHistory,10000);});
}
async function handleInteraction(i) {
  const parent=await parentFor(i.channel_id);
  if(!core.acceptInteraction(config,i,parent) || i.data?.name !== 'ask')return;
  if(i.channel_id===config.channelId){await request('POST',`/interactions/${i.id}/${i.token}/callback`,{type:4,data:{content:'채널에 메시지를 보내면 새 스레드를 만들어요.',flags:64}},false);return;}
  await request('POST',`/interactions/${i.id}/${i.token}/callback`,{type:4,data:{content:'확인할게요.',flags:64}},false);
  const text=i.data.options?.find(x=>x.name==='message')?.value; if(text)await relay.input(i.channel_id,text,i.id);
}
async function threadEvent(type,d) {
  if(d.guild_id && d.guild_id!==config.guildId)return;
  const parent=d.parent_id || parents.get(d.id); if(parent!==config.channelId && !relay.map[d.id])return;
  if(d.parent_id)parents.set(d.id,d.parent_id);
  if(type==='THREAD_DELETE') { await relay.closeThread(d.id,true); parents.delete(d.id); }
  else if(type==='THREAD_UPDATE' && (d.thread_metadata?.archived || d.thread_metadata?.locked)) await relay.closeThread(d.id);
}
function send(payload) { if(socket?.readyState===1)socket.send(JSON.stringify(payload)); }
function reconnect() { if(stopped)return; clearInterval(heartbeat);clearTimeout(reconnectTimer);status='connecting';health();reconnectTimer=setTimeout(open,Math.min(60000,1000*2**Math.min(attempts++,6))); }
function open() {
  if(stopped)return;
  const ws=new WebSocket(`${(sessionId && resumeUrl ? resumeUrl : 'wss://gateway.discord.gg').replace(/\/$/,'')}/?v=10&encoding=json`); socket=ws; acked=true;
  ws.addEventListener('message', e=>{ if(socket!==ws)return; let p;try{p=JSON.parse(typeof e.data==='string'?e.data:Buffer.from(e.data).toString('utf8'));}catch{return;} if(Number.isInteger(p.s))seq=p.s;
    if(p.op===10) {clearInterval(heartbeat); const interval=p.d.heartbeat_interval; const beat=()=>{if(!acked){ws.close(4000,'heartbeat');return;}acked=false;send({op:1,d:seq});}; setTimeout(()=>{beat();heartbeat=setInterval(beat,interval);},Math.random()*interval); if(sessionId && seq!==null)send({op:6,d:{token,session_id:sessionId,seq}}); else send({op:2,d:{token,intents:33281,properties:{os:process.platform,browser:'paseo-bot',device:'paseo-bot'}}});return;}
    if(p.op===11){acked=true;lastAckAt=Date.now();return;} if(p.op===1){send({op:1,d:seq});return;} if(p.op===7){ws.close(4000,'reconnect');return;} if(p.op===9){if(!p.d){sessionId='';seq=null;}ws.close(4000,'session');return;} if(p.op!==0)return;
    lastEventAt=Date.now(); const d=p.d;
    if(p.t==='READY'){sessionId=d.session_id;resumeUrl=d.resume_gateway_url;appId=d.user.id;attempts=0;status='connected';health();recoverHistory();request('PUT',`/applications/${appId}/guilds/${config.guildId}/commands`,core.commandDefinitions()).catch(()=>log('commands-failed'));}
    else if(p.t==='RESUMED'){attempts=0;status='connected';health();}
    else if(p.t==='MESSAGE_CREATE')inbox.live(d).catch(()=>{log('message-failed');recoverClient().catch(()=>{}).finally(recoverHistory);});
    else if(p.t==='INTERACTION_CREATE')handleInteraction(d).catch(()=>log('interaction-failed'));
    else if(['THREAD_CREATE','THREAD_UPDATE','THREAD_DELETE'].includes(p.t))threadEvent(p.t,d).catch(()=>log('thread-event-failed'));
  });
  ws.addEventListener('close', e=>{if(socket!==ws || stopped)return;if([4004,4010,4011,4012,4013,4014].includes(e.code)){status='error';health();process.exit(4);}if([4007,4009].includes(e.code)){sessionId='';seq=null;}reconnect();});
  ws.addEventListener('error',()=>log('gateway-error'));
}
await relay.readyHints; await relay.baseline(); open(); health(); const healthTimer=setInterval(health,5000);
let polling=false;const pollTimer=setInterval(async()=>{if(polling)return;polling=true;try{await relay.pollDue();}catch{log('poll-failed');await recoverClient().catch(()=>log('client-reconnect-failed'));}finally{polling=false;}},2000);
let sendingFiles=false;const fileTimer=setInterval(async()=>{if(sendingFiles || status!=='connected')return;sendingFiles=true;try{
  await deliverFiles({home,threads:relay.map,channelId:config.channelId,
    sendFile:async(channel,job)=>request('POST',`/channels/${channel}/messages`,discordFileForm(job)),
    sendError:async(channel,text,id)=>request('POST',`/channels/${channel}/messages`,{content:text,nonce:fileNonce(id),enforce_nonce:true,allowed_mentions:{parse:[]}})});
}catch{log('file-delivery-failed');}finally{sendingFiles=false;}},2000);
async function shutdown(){stopped=true;clearInterval(heartbeat);clearInterval(healthTimer);clearInterval(pollTimer);clearInterval(fileTimer);clearTimeout(reconnectTimer);clearTimeout(historyRetry);socket?.close();await client.close().catch(()=>{});process.exit(0);}
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
