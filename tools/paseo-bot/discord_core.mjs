export const MAX_MESSAGE = 2000;
export const SNOWFLAKE = /^\d{16,22}$/;
export function parseConfig(raw) {
  if (!raw || raw.version !== 1 || typeof raw.enabled !== 'boolean' || !SNOWFLAKE.test(raw.guildId || '') || !SNOWFLAKE.test(raw.channelId || '') || !Array.isArray(raw.ownerIds) || !raw.ownerIds.length || raw.ownerIds.some(x => !SNOWFLAKE.test(x))) return null;
  return raw;
}
export function acceptMessage(config, event, parentId) {
  return !!(config?.enabled && event?.guild_id === config.guildId && (event.channel_id === config.channelId || parentId === config.channelId) && SNOWFLAKE.test(event.id || '') && [0, 19, undefined].includes(event.type) && !event.webhook_id && !event.author?.bot && !event.author?.system && config.ownerIds.includes(event.author?.id));
}
export function acceptInteraction(config, event, parentId) {
  return !!(config?.enabled && event?.guild_id === config.guildId && (event.channel_id === config.channelId || parentId === config.channelId) && config.ownerIds.includes(event.member?.user?.id) && !event.member?.user?.bot);
}
export async function conversationForMessage(config, message, text, createThread) {
  if(message.channel_id!==config.channelId)return message.channel_id;
  const name=String(text || '새 대화').replace(/\s+/g,' ').trim().slice(0,90) || '새 대화';
  const thread=await createThread(message.id,name);
  if(!SNOWFLAKE.test(thread?.id || ''))throw Error('Discord thread creation failed');
  return thread.id;
}
export function chunkText(text, limit = MAX_MESSAGE) {
  const result = []; let rest = String(text);
  while (rest.length > limit) {
    let n = rest.lastIndexOf('\n', limit); if (n < limit / 2) n = rest.lastIndexOf(' ', limit);
    if (n < limit / 2) n = limit;
    if (n > 0 && /[\uD800-\uDBFF]/.test(rest[n - 1]) && /[\uDC00-\uDFFF]/.test(rest[n])) n--;
    result.push(rest.slice(0, n)); rest = rest.slice(n);
  }
  if (rest) result.push(rest); return result;
}
export function commandDefinitions() { return [{name: 'ask', description: 'Paseo 에이전트에게 메시지 보내기', type: 1, options: [{type: 3, name: 'message', description: '메시지', required: true}]}]; }
