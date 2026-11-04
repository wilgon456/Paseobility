// Pure Discord gateway logic: scope policy, rendering, chunking and protocol
// arithmetic. No I/O, no timers, no network: every function here is unit-testable.
export const SNOWFLAKE = /^\d{16,22}$/;
export const PLAN_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
export const MAX_MESSAGE = 2000;
export const TEXT_LIMIT = 12000;
export const ATTACHMENT_MAX_BYTES = 102400;
export const ATTACHMENT_HOSTS = Object.freeze(['cdn.discordapp.com', 'media.discordapp.net']);
export const ATTACHMENT_EXTS = Object.freeze(['.md', '.txt', '.json', '.log', '.csv', '.py', '.ts', '.js']);
export const MODELS = Object.freeze(['auto', 'sol', 'claude', 'go']);
export const EFFORTS = Object.freeze(['auto', 'low', 'medium', 'high']);
export const WORKFLOWS = Object.freeze(['auto', 'inspect', 'daily', 'verified']);
export const DEFAULT_SELECTION = Object.freeze({project: 'auto', model: 'auto', effort: 'auto', workflow: 'auto'});
export const FATAL_CLOSE_CODES = Object.freeze([4004, 4010, 4011, 4012, 4013, 4014]);
export const CONFIG_KEYS = Object.freeze(['version', 'enabled', 'guildId', 'channelId', 'ownerIds', 'python', 'secretName', 'node']);
// Outbound polling tiers and the per-tick budget (a tick runs every 3 s).
export const HOT_MS = 30 * 60 * 1000;
export const WARM_MS = 7 * 24 * 60 * 60 * 1000;
export const WARM_POLL_MS = 60 * 1000;
export const SYNC_CAP = 8;
export const TERMINAL_STATES = Object.freeze(['passed', 'failed', 'blocked', 'unknown', 'closed']);
export const PROMPT_PREVIEW = 300;
export const PROMPT_PREVIEW_MIN = 80;
export const PARTIAL_NOTE = '(일부 생략)';
export const HOLD_NOTICE = '이 대화는 확인이 필요해서 멈춰 있어요. /resolve 로 다시 열거나 채널에 새 메시지로 시작해 주세요.';

export function isSnowflake(value) {
  return typeof value === 'string' && SNOWFLAKE.test(value);
}

// ---- configuration and scope policy (Dori bridge/policy.ts semantics, fail closed) ----

export function parseConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (Object.keys(raw).some(key => !CONFIG_KEYS.includes(key))) return null;
  if (raw.version !== 1 || typeof raw.enabled !== 'boolean') return null;
  if (!isSnowflake(raw.guildId) || !isSnowflake(raw.channelId)) return null;
  if (!Array.isArray(raw.ownerIds) || raw.ownerIds.length === 0 || raw.ownerIds.some(id => !isSnowflake(id))) return null;
  if (typeof raw.python !== 'string' || !raw.python.trim() || raw.python.length > 500) return null;
  if (raw.secretName !== undefined && (typeof raw.secretName !== 'string' || !raw.secretName || raw.secretName.length > 200)) return null;
  if (raw.node !== undefined && (typeof raw.node !== 'string' || !raw.node.trim() || raw.node.length > 500)) return null;
  return {
    version: 1,
    enabled: raw.enabled,
    guildId: raw.guildId,
    channelId: raw.channelId,
    ownerIds: [...new Set(raw.ownerIds)],
    python: raw.python,
    secretName: raw.secretName,
    node: raw.node ?? 'node',
  };
}

export function trackedThread(config, threads, channelId) {
  if (!config || !threads || typeof threads !== 'object') return null;
  const record = threads[channelId];
  if (!record || typeof record !== 'object') return null;
  if (record.parentId !== config.channelId) return null;
  if (typeof record.conversationId !== 'string' || !record.conversationId) return null;
  return record;
}

export function inScopeChannel(config, threads, channelId) {
  return Boolean(config) && (channelId === config.channelId || Boolean(trackedThread(config, threads, channelId)));
}

export function acceptMessage(config, event, threads) {
  try {
    if (!config || config.enabled !== true) return false;
    if (!event || typeof event !== 'object') return false;
    if (event.guild_id !== config.guildId) return false;
    if (!inScopeChannel(config, threads, event.channel_id)) return false;
    if (event.webhook_id) return false;
    if (typeof event.id !== 'string' || !SNOWFLAKE.test(event.id)) return false;
    if (typeof event.content !== 'string') return false;
    // 0 DEFAULT and 19 REPLY are owner text; every other type is a system/join/thread notice.
    if (event.type !== undefined && event.type !== 0 && event.type !== 19) return false;
    const author = event.author;
    if (!author || typeof author !== 'object') return false;
    if (author.bot === true || author.system === true) return false;
    return config.ownerIds.includes(author.id);
  } catch {
    return false;
  }
}

export function acceptInteraction(config, interaction, threads) {
  try {
    if (!config || config.enabled !== true) return false;
    if (!interaction || typeof interaction !== 'object') return false;
    if (interaction.guild_id !== config.guildId) return false;
    if (!inScopeChannel(config, threads, interaction.channel_id)) return false;
    if (typeof interaction.id !== 'string' || !SNOWFLAKE.test(interaction.id)) return false;
    if (typeof interaction.token !== 'string' || !interaction.token) return false;
    if (interaction.type !== 2 && interaction.type !== 3 && interaction.type !== 4) return false;
    const user = interaction.member?.user ?? interaction.user;
    if (!user || typeof user !== 'object' || user.bot === true) return false;
    return config.ownerIds.includes(user.id);
  } catch {
    return false;
  }
}

// ---- custom ids: pb:<approve|reject>:<planId> ----

export function formatCustomId(action, planId) {
  if (!['approve', 'reject'].includes(action)) throw new Error('custom id action');
  if (typeof planId !== 'string' || !PLAN_ID.test(planId)) throw new Error('custom id plan');
  return `pb:${action}:${planId}`;
}

export function parseCustomId(value) {
  if (typeof value !== 'string' || value.length > 120) return null;
  const memory = parseMemoryId(value);
  if (memory) return memory;
  const permit = parsePermitId(value);
  if (permit) return permit;
  const confirm = parseConfirmId(value);
  if (confirm) return {action: 'confirm', short: confirm};
  const dismiss = parseDismissId(value);
  if (dismiss) return {action: 'dismiss', short: dismiss};
  const match = /^pb:(approve|reject):([a-zA-Z0-9][a-zA-Z0-9_.-]{0,79})$/.exec(value);
  return match ? {action: match[1], planId: match[2]} : null;
}

// ---- permission buttons: pb:pa:<pid> (allow) / pb:pd:<pid> (deny) ----

export const PERMIT_KEY = /^[a-z0-9]{12}$/;

export function formatPermitId(decision, pid) {
  if (!['allow', 'deny'].includes(decision)) throw new Error('permit decision');
  if (typeof pid !== 'string' || !PERMIT_KEY.test(pid)) throw new Error('permit key');
  return `pb:${decision === 'allow' ? 'pa' : 'pd'}:${pid}`;
}

export function parsePermitId(value) {
  if (typeof value !== 'string') return null;
  const match = /^pb:(pa|pd):([a-z0-9]{12})$/.exec(value);
  if (!match) return null;
  return {action: match[1] === 'pa' ? 'permit-allow' : 'permit-deny', pid: match[2]};
}

export function permissionComponents(permission) {
  if (!permission || typeof permission !== 'object') return null;
  const {taskId, pid} = permission;
  if (typeof taskId !== 'string' || !PLAN_ID.test(taskId)) return null;
  if (typeof pid !== 'string' || !PERMIT_KEY.test(pid)) return null;
  return [{
    type: 1,
    components: [
      {type: 2, style: 3, label: '허용', custom_id: formatPermitId('allow', pid)},
      {type: 2, style: 4, label: '거절', custom_id: formatPermitId('deny', pid)},
    ],
  }];
}

export function permissionEdit(content, decision) {
  const text = typeof content === 'string' ? content : '';
  const label = decision === 'allow' ? '허용했어요.' : '거절했어요.';
  return {content: `${text}\n\n${label}`.slice(0, MAX_MESSAGE), components: [], allowed_mentions: {parse: []}};
}

export function permissionResolvedEdit(content, notice) {
  const text = typeof content === 'string' ? content : '';
  const label = typeof notice === 'string' && notice.trim() ? notice.trim() : '권한 요청이 처리됐어요.';
  return {content: `${text}\n\n${label}`.slice(0, MAX_MESSAGE), components: [], allowed_mentions: {parse: []}};
}

// ---- curated-memory approval buttons: pb:ma:<key> (approve) / pb:mr:<key> (reject) ----

// The memory-review conversation is mapped to the channel itself, not a thread.
export const MEMORY_REVIEW = 'memory-review';
export const MEMORY_KEY = /^[a-z0-9]{12}$/;

export function isMemoryReview(conversationId) {
  return conversationId === MEMORY_REVIEW;
}

export function formatMemoryId(action, key) {
  if (!['approve', 'reject'].includes(action)) throw new Error('memory action');
  if (typeof key !== 'string' || !MEMORY_KEY.test(key)) throw new Error('memory key');
  return `pb:${action === 'approve' ? 'ma' : 'mr'}:${key}`;
}

export function parseMemoryId(value) {
  if (typeof value !== 'string') return null;
  const match = /^pb:(ma|mr):([a-z0-9]{12})$/.exec(value);
  if (!match) return null;
  return {action: match[1] === 'ma' ? 'memory-approve' : 'memory-reject', key: match[2]};
}

export function memoryComponents(approval) {
  const value = approval && typeof approval === 'object' && approval.memoryApproval
    ? approval.memoryApproval
    : approval;
  if (!value || typeof value !== 'object') return null;
  const {key} = value;
  if (typeof key !== 'string' || !MEMORY_KEY.test(key)) return null;
  return [{
    type: 1,
    components: [
      {type: 2, style: 3, label: '승인', custom_id: formatMemoryId('approve', key)},
      {type: 2, style: 4, label: '거절', custom_id: formatMemoryId('reject', key)},
    ],
  }];
}

export function memoryEdit(content, decision) {
  const text = typeof content === 'string' ? content : '';
  const label = decision === 'approve' ? '기억 변경을 승인했어요.' : '기억 변경을 거절했어요.';
  return {content: `${text}\n\n${label}`.slice(0, MAX_MESSAGE), components: [], allowed_mentions: {parse: []}};
}

// ---- owner control custom ids: pb:cc:<12-char key> (confirm) / pb:cx:<key> (dismiss) ----

export const CONFIRM_KEY = /^[A-Za-z0-9]{12}$/;

export function formatConfirmId(short) {
  if (typeof short !== 'string' || !CONFIRM_KEY.test(short)) throw new Error('confirm id');
  return `pb:cc:${short}`;
}

export function parseConfirmId(value) {
  if (typeof value !== 'string') return null;
  const match = /^pb:cc:([A-Za-z0-9]{12})$/.exec(value);
  return match ? match[1] : null;
}

export function formatDismissId(short) {
  if (typeof short !== 'string' || !CONFIRM_KEY.test(short)) throw new Error('dismiss id');
  return `pb:cx:${short}`;
}

export function parseDismissId(value) {
  if (typeof value !== 'string') return null;
  const match = /^pb:cx:([A-Za-z0-9]{12})$/.exec(value);
  return match ? match[1] : null;
}

export function confirmKey(random = Math.random) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 12; i += 1) out += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  return out;
}

export function confirmCard(taskId, short) {
  const id = typeof taskId === 'string' && PLAN_ID.test(taskId) ? taskId : String(taskId ?? '').slice(0, 80);
  return {
    content: `작업 ${id}을(를) 취소할까요?`,
    components: [{
      type: 1,
      components: [
        {type: 2, style: 4, label: '취소 확정', custom_id: formatConfirmId(short)},
        {type: 2, style: 2, label: '그만두기', custom_id: formatDismissId(short)},
      ],
    }],
    allowed_mentions: {parse: []},
  };
}

// ---- task control helpers (Dori D4/D5) ----

export const CONTROL_COMMANDS = Object.freeze(['cancel', 'pause', 'resume', 'peek']);
export const PEEK_LIMIT = 1900;

export function resolveTaskChoice(tasks, requested) {
  const active = (Array.isArray(tasks) ? tasks : []).filter(task =>
    task && typeof task.id === 'string' && task.id && !TERMINAL_STATES.includes(task.state));
  const wanted = typeof requested === 'string' ? requested.trim() : '';
  if (wanted) {
    const hit = active.find(task => task.id === wanted);
    return hit ? {taskId: hit.id, state: 'one'} : {taskId: '', state: 'missing'};
  }
  if (active.length === 1) return {taskId: active[0].id, state: 'one'};
  if (!active.length) return {taskId: '', state: 'none'};
  return {taskId: '', state: 'many'};
}

export function taskChoices(tasks, typed, limit = 25) {
  const prefix = typeof typed === 'string' ? typed.trim().toLowerCase() : '';
  const out = [];
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task || typeof task.id !== 'string' || !task.id) continue;
    if (TERMINAL_STATES.includes(task.state)) continue;
    if (prefix && !task.id.toLowerCase().startsWith(prefix)) continue;
    const project = typeof task.project === 'string' ? task.project.slice(0, 40) : '';
    const name = `${task.id.slice(0, 50)} · ${project} · ${String(task.state ?? '')}`.slice(0, 100);
    out.push({name, value: task.id.slice(0, 80)});
    if (out.length >= Math.max(0, limit)) break;
  }
  return out;
}

export function taskListText(tasks, limit = 10) {
  const active = (Array.isArray(tasks) ? tasks : []).filter(task =>
    task && typeof task.id === 'string' && !TERMINAL_STATES.includes(task.state));
  if (!active.length) return '이 스레드에 진행 중인 작업이 없어요.';
  return ['어떤 작업일까요? `task` 값으로 골라 주세요.', ...active.slice(0, limit).map(task =>
    `- ${task.id} · ${task.project ?? ''} · ${task.state ?? ''}`)].join('\n');
}

// A fenced block that keeps the newest lines inside Discord's 2000-character message.
export function peekBlock(text, limit = PEEK_LIMIT) {
  const size = Number.isInteger(limit) && limit >= 100 ? Math.min(limit, MAX_MESSAGE) : PEEK_LIMIT;
  const value = (typeof text === 'string' ? text : '').replace(/\s+$/, '');
  const body = value.split('```').join('``');
  const max = size - 8; // opening and closing fences plus newlines
  let kept = body;
  if (body.length > max) {
    kept = body.slice(body.length - max);
    const cut = kept.indexOf('\n');
    if (cut >= 0) kept = kept.slice(cut + 1);
  }
  return ('```\n' + kept + '\n```').slice(0, size);
}

// ---- text ----

export function threadName(text) {
  const line = (typeof text === 'string' ? text : '').replace(/\s+/g, ' ').trim();
  return (line || 'Paseo 봇 작업').slice(0, 80);
}

export function chunkText(text, limit = MAX_MESSAGE) {
  if (!Number.isInteger(limit) || limit < 100) throw new Error('chunk limit');
  const value = typeof text === 'string' ? text : '';
  if (!value) return [];
  const chunks = [];
  let rest = value;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit - 1);
    if (cut <= 0) {
      cut = limit;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
      continue;
    }
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut + 1);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// ---- plan cards ----

export function modelLabel(task) {
  const alias = typeof task?.model === 'string' && task.model ? task.model : 'auto';
  const resolved = typeof task?.resolvedModel === 'string' ? task.resolvedModel : '';
  if (alias === 'auto') return resolved ? `모델 ${resolved}` : '모델 자동';
  return `모델 ${alias}`;
}

export function promptPreview(task, limit = PROMPT_PREVIEW) {
  const size = Number.isInteger(limit) && limit > 0 ? limit : PROMPT_PREVIEW;
  const text = (typeof task?.prompt === 'string' ? task.prompt : '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > size ? text.slice(0, size) + '…' : text;
}

function planLines(plan, previewLimit) {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  // Phone-first: title, one meta line, the request as a quote. Internal routing reasons stay out.
  const lines = [tasks.length > 1 ? `**작업 계획 · ${tasks.length}개**` : '**작업 계획**'];
  tasks.forEach((task, index) => {
    if (!task || typeof task !== 'object') return;
    const title = typeof task.title === 'string' && task.title.trim() ? task.title.trim().slice(0, 200) : '작업';
    lines.push('', tasks.length > 1 ? `**${index + 1}. ${title}**` : `**${title}**`);
    const bits = [task.project ?? '?'];
    bits.push({inspect: '확인만', daily: '일반 변경', verified: '중요 변경'}[task.workflow ?? 'verified'] ?? String(task.workflow));
    if (typeof task.machine === 'string' && task.machine) bits.push(task.machine);
    bits.push(modelLabel(task));
    lines.push(bits.join(' · '));
    const preview = promptPreview(task, previewLimit);
    if (preview) lines.push('> ' + preview);
    if (Array.isArray(task.dependsOn) && task.dependsOn.length) {
      const dependencies = task.dependsOn.filter(value => Number.isInteger(value) && value >= 0).map(value => value + 1);
      if (dependencies.length) lines.push('먼저 끝낼 작업: ' + dependencies.join(', '));
    }
  });
  return lines;
}

export function planSummary(plan) {
  let text = planLines(plan, PROMPT_PREVIEW).join('\n');
  if (text.length <= MAX_MESSAGE) return text;
  // Too long: shrink every preview proportionally, never below PROMPT_PREVIEW_MIN,
  // and say that the card was shortened.
  const marker = '\n' + PARTIAL_NOTE;
  let limit = PROMPT_PREVIEW;
  while (limit > PROMPT_PREVIEW_MIN) {
    limit = Math.max(PROMPT_PREVIEW_MIN, Math.floor(limit * MAX_MESSAGE / Math.max(1, text.length)));
    text = planLines(plan, limit).join('\n') + marker;
    if (text.length <= MAX_MESSAGE) return text;
  }
  return text.length <= MAX_MESSAGE ? text : text.slice(0, MAX_MESSAGE - marker.length) + marker;
}

export function planCard(plan) {
  if (!plan || typeof plan !== 'object' || typeof plan.id !== 'string' || !PLAN_ID.test(plan.id)) throw new Error('plan');
  return {
    content: planSummary(plan).slice(0, MAX_MESSAGE),
    components: [{
      type: 1,
      components: [
        {type: 2, style: 3, label: '접수', custom_id: formatCustomId('approve', plan.id)},
        {type: 2, style: 4, label: '거절', custom_id: formatCustomId('reject', plan.id)},
      ],
    }],
    allowed_mentions: {parse: []},
  };
}

export const OUTCOMES = Object.freeze({
  approved: '접수했어요. 작업을 시작할게요.',
  cancelled: '거절했어요. 바꿀 내용을 대화로 알려주세요.',
  rejected: '거절했어요.',
  superseded: '새 계획으로 바뀌었어요.',
});

export function planOutcome(plan) {
  const state = typeof plan?.state === 'string' ? plan.state : '';
  const label = OUTCOMES[state] ?? '이 계획은 더 이상 진행할 수 없어요.';
  return `${planSummary(plan).slice(0, MAX_MESSAGE - 200)}\n\n${label}`.slice(0, MAX_MESSAGE);
}

export function planCardEdit(plan) {
  return {content: planOutcome(plan), components: [], allowed_mentions: {parse: []}};
}

// ---- outbound diff ----

const PR_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/;

export function formatOutbound(message) {
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  const prefix = message?.role === 'system' && message?.payload?.answer !== true ? '• ' : '';
  const body = prefix + text;
  const prUrl = typeof message?.payload?.prUrl === 'string' && PR_URL.test(message.payload.prUrl) ? message.payload.prUrl : '';
  return prUrl && !body.includes(prUrl) ? `${body}\n${prUrl}` : body;
}

export function undelivered(messages, delivered) {
  const seen = new Set(Array.isArray(delivered) ? delivered : []);
  return (Array.isArray(messages) ? messages : []).filter(message => message
    && typeof message.id === 'string'
    && !seen.has(message.id)
    && (message.role === 'assistant' || message.role === 'system')
    && typeof message.text === 'string'
    && message.text.trim().length > 0);
}


export function cappedAppend(list, ids, cap = 500) {
  const current = Array.isArray(list) ? list : [];
  const incoming = (Array.isArray(ids) ? ids : []).filter(id => !current.includes(id));
  const out = [...current, ...incoming];
  return out.length > cap ? out.slice(out.length - cap) : out;
}

export function remember(list, id, cap = 5000) {
  if (typeof id !== 'string' || !id) return Array.isArray(list) ? list : [];
  const current = Array.isArray(list) ? list : [];
  if (current.includes(id)) return current;
  const out = [...current, id];
  return out.length > cap ? out.slice(out.length - cap) : out;
}

// ---- activity tiers ----

// The only fields the tier decision needs from a `sync` result, kept in
// discord-state.json so an idle thread is not synced just to re-learn them.
export function syncSummary(synced) {
  const tasks = Array.isArray(synced?.tasks) ? synced.tasks : null;
  const plans = Array.isArray(synced?.plans) ? synced.plans : null;
  return {
    deliveryState: typeof synced?.deliveryState === 'string' ? synced.deliveryState : '',
    // A stored summary has no arrays left, so its own flags survive a reload.
    activeTasks: tasks ? tasks.some(task => task && !TERMINAL_STATES.includes(task.state)) : synced?.activeTasks === true,
    pendingPlans: plans ? plans.some(plan => plan?.state === 'pending') : synced?.pendingPlans === true,
  };
}

function syncedBusy(synced) {
  if (!synced || typeof synced !== 'object') return false;
  if (typeof synced.deliveryState === 'string' && synced.deliveryState) return true;
  if (synced.pendingPlans === true || synced.activeTasks === true) return true;
  if (Array.isArray(synced.plans) && synced.plans.some(plan => plan?.state === 'pending')) return true;
  return Array.isArray(synced.tasks) && synced.tasks.some(task => task && !TERMINAL_STATES.includes(task.state));
}

// hot: pending card, pending delivery, non-terminal task, or activity < 30 min.
// warm: activity < 7 days. dormant: nothing to poll until a new message arrives.
export function threadTier(record, synced, now = Date.now()) {
  const at = Number(record?.lastActivityAt);
  const current = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  if (record?.dormant === true) return 'dormant';
  if (record?.pendingCard === true || syncedBusy(synced)) return 'hot';
  if (!Number.isFinite(at) || at <= 0) return 'dormant';
  const idle = current - at;
  if (idle <= HOT_MS) return 'hot';
  if (idle <= WARM_MS) return 'warm';
  return 'dormant';
}

// Pick at most `cap` conversations for this tick: every hot thread, then the
// warm threads that are due (60 s) by oldest poll. The rest wait a tick.
export function syncSelection(entries, now = Date.now(), cap = SYNC_CAP) {
  const limit = Math.max(0, Math.floor(Number(cap) || 0));
  const current = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const list = (Array.isArray(entries) ? entries : []).filter(entry => entry && typeof entry.id === 'string');
  // Least recently polled first, so more than `cap` hot threads still all get turns.
  const hot = list.filter(entry => entry.tier === 'hot').sort((a, b) => (Number(a.polledAt) || 0) - (Number(b.polledAt) || 0));
  const warm = list.filter(entry => entry.tier === 'warm'
    && current - (Number(entry.polledAt) || 0) >= WARM_POLL_MS);
  warm.sort((a, b) => (Number(a.polledAt) || 0) - (Number(b.polledAt) || 0));
  return [...hot, ...warm].slice(0, limit).map(entry => entry.id);
}

// ---- review hold ----

// The notice is posted at most once per hold; /resolve starts a fresh hold.
export function holdNotice(review) {
  if (!review || typeof review !== 'object' || review.notice === true) return '';
  return HOLD_NOTICE;
}

// ---- attachments ----

export function attachmentHostOk(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ATTACHMENT_HOSTS.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function attachmentFetchable(attachment) {
  if (!attachment || typeof attachment !== 'object') return false;
  if (!attachmentHostOk(attachment.url)) return false;
  if (!Number.isInteger(attachment.size) || attachment.size < 0 || attachment.size > ATTACHMENT_MAX_BYTES) return false;
  const type = typeof attachment.content_type === 'string' ? attachment.content_type.toLowerCase() : '';
  if (type.startsWith('text/')) return true;
  const name = typeof attachment.filename === 'string' ? attachment.filename.toLowerCase() : '';
  return ATTACHMENT_EXTS.some(ext => name.endsWith(ext));
}

export function attachmentSkip(filename, size) {
  const name = String(filename ?? '첨부').slice(0, 200);
  return `\n[첨부 생략: ${name}, ${Number.isInteger(size) ? size : 0}]`;
}

export function appendAttachment(text, attachment, content) {
  const base = typeof text === 'string' ? text : '';
  const name = String(attachment?.filename ?? '첨부').slice(0, 200);
  const note = attachmentSkip(name, attachment?.size);
  // The skip note also fits: gui_state refuses anything above 12000 characters.
  const withNote = () => (base.length + note.length <= TEXT_LIMIT
    ? base + note
    : base.slice(0, Math.max(0, TEXT_LIMIT - note.length)) + note);
  if (typeof content !== 'string') return withNote();
  const candidate = `${base}\n\n[첨부 ${name}]\n${content}`;
  return candidate.length <= TEXT_LIMIT ? candidate : withNote();
}

// ---- gateway state machine ----

export function fatalClose(code) {
  return FATAL_CLOSE_CODES.includes(Number(code));
}

export function heartbeatInterval(interval, random) {
  const value = Number(interval);
  if (!Number.isFinite(value) || value <= 0) throw new Error('heartbeat interval');
  const jitter = Number.isFinite(Number(random)) ? Math.min(0.999999, Math.max(0, Number(random))) : 0;
  return Math.floor(value * jitter);
}

export function shouldResume(sessionId, seq) {
  return typeof sessionId === 'string' && sessionId.length > 0 && Number.isInteger(seq) && seq >= 0;
}

export function reconnectDelay(attempt, random = 0) {
  const step = Math.max(1, Math.floor(Number(attempt) || 1));
  const base = Math.min(60000, 1000 * 2 ** (step - 1));
  const jitter = Number.isFinite(Number(random)) ? Math.min(0.999999, Math.max(0, Number(random))) : 0;
  return Math.min(60000, Math.floor(base * (0.5 + 0.5 * jitter)));
}

// ---- REST rate limits ----

export function headerValue(headers, name) {
  if (!headers) return undefined;
  try {
    if (typeof headers.get === 'function') {
      const value = headers.get(name);
      if (value !== null && value !== undefined) return value;
    }
  } catch {
    return undefined;
  }
  const lower = name.toLowerCase();
  const entries = typeof headers.entries === 'function' ? headers.entries() : Object.entries(headers);
  for (const [key, value] of entries) {
    if (String(key).toLowerCase() === lower) return value;
  }
  return undefined;
}

export function rateLimitWait({status = 200, headers = {}, body = {}} = {}) {
  const candidates = [
    Number(body?.retry_after),
    Number(headerValue(headers, 'x-ratelimit-reset-after')),
    Number(headerValue(headers, 'retry-after')),
  ];
  for (const value of candidates) {
    if (Number.isFinite(value) && value >= 0) return Math.ceil(value * 1000);
  }
  // An unexplained 429 still waits; anything else does not.
  return Number(status) === 429 ? 1000 : 0;
}

export function rateLimitExhausted(headers) {
  const remaining = Number(headerValue(headers, 'x-ratelimit-remaining'));
  return Number.isFinite(remaining) && remaining <= 0;
}

export function isGlobalLimit(headers) {
  return String(headerValue(headers, 'x-ratelimit-global') ?? '').toLowerCase() === 'true';
}

// ---- slash commands ----

const TASK_OPTION = Object.freeze({type: 3, name: 'task', description: '작업 ID (비우면 이 스레드의 작업)', required: false, autocomplete: true});

export const COMMANDS = Object.freeze([
  {
    name: 'task',
    description: 'Paseo 봇에게 작업을 요청해요.',
    type: 1,
    options: [
      {type: 3, name: 'text', description: '요청 내용', required: true},
      {type: 3, name: 'project', description: '프로젝트 ID (비우면 자동)', required: false, autocomplete: true},
      {type: 3, name: 'model', description: '모델', required: false, choices: [
        {name: '자동', value: 'auto'}, {name: 'sol', value: 'sol'}, {name: 'claude', value: 'claude'}, {name: 'go', value: 'go'},
      ]},
      {type: 3, name: 'effort', description: '노력 수준', required: false, choices: [
        {name: '자동', value: 'auto'}, {name: '낮음', value: 'low'}, {name: '보통', value: 'medium'}, {name: '높음', value: 'high'},
      ]},
      {type: 3, name: 'workflow', description: '진행 방식 (비우면 자동)', required: false, choices: [
        {name: '자동', value: 'auto'}, {name: '확인만 (읽기 전용, 바로 시작)', value: 'inspect'},
        {name: '일반 변경 (자체 확인)', value: 'daily'}, {name: '중요 변경 (독립 검토)', value: 'verified'},
      ]},
    ],
  },
  {name: 'status', description: '봇 상태를 확인해요.', type: 1, options: []},
  {name: 'cancel', description: '진행 중인 작업을 취소해요.', type: 1, options: [TASK_OPTION]},
  {name: 'pause', description: '작업을 잠시 멈춰요.', type: 1, options: [TASK_OPTION]},
  {name: 'resume', description: '멈춘 작업을 다시 시작해요.', type: 1, options: [TASK_OPTION]},
  {name: 'peek', description: '작업 에이전트의 최근 로그를 봐요.', type: 1, options: [TASK_OPTION]},
  {name: 'resolve', description: '확인이 필요한 대화를 다시 열어요.', type: 1, options: []},
  {name: 'manager', description: '대화 관리자 모델을 보거나 바꿔요.', type: 1, options: [
    {type: 3, name: 'use', description: '바꿀 관리자 (비우면 현재 설정을 보여줘요)', required: false, choices: [
      {name: 'Codex', value: 'codex'}, {name: 'Claude', value: 'claude'},
    ]},
  ]},
]);

const MANAGER_LABELS = Object.freeze({codex: 'Codex', claude: 'Claude'});

// Owner-facing summary of the active manager profile (from gui_api action 'manager').
export function managerText(result, switched = false) {
  const source = result && typeof result === 'object' ? result : {};
  const name = typeof source.profile === 'string' ? source.profile : '';
  const label = MANAGER_LABELS[name] ?? (name || String(source.provider ?? ''));
  const tier = spec => (spec && typeof spec === 'object' ? `${spec.model} ${spec.thinking}` : '?');
  const lines = [];
  if (switched) {
    lines.push(source.changed === false
      ? `이미 ${label} 관리자를 쓰고 있어요.`
      : `관리자를 ${label}(으)로 바꿨어요. 각 스레드는 다음 메시지부터 새 관리자로 이어가요(최근 대화를 넘겨줘요).`);
  } else {
    lines.push(`관리자: ${label}`);
  }
  lines.push(`잡담·질문: ${tier(source.chat)}`, `작업 계획: ${tier(source.plan)}`);
  return lines.join('\n');
}

export function commandDefinitions() {
  return JSON.parse(JSON.stringify(COMMANDS));
}

export function commandOptions(interaction) {
  const out = {};
  for (const option of interaction?.data?.options ?? []) {
    if (option && typeof option.name === 'string') out[option.name] = option.value;
  }
  return out;
}

export function selectionFromOptions(options) {
  const source = options && typeof options === 'object' ? options : {};
  const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
  const project = typeof source.project === 'string' && PLAN_ID.test(source.project) ? source.project : 'auto';
  return {
    project,
    model: pick(source.model, MODELS, 'auto'),
    effort: pick(source.effort, EFFORTS, 'auto'),
    workflow: pick(source.workflow, WORKFLOWS, 'auto'),
  };
}

export function autocompleteChoices(projects, typed, limit = 25) {
  const prefix = typeof typed === 'string' ? typed.trim().toLowerCase() : '';
  const out = [];
  for (const entry of Array.isArray(projects) ? projects : []) {
    const id = typeof entry === 'string' ? entry : entry?.id;
    if (typeof id !== 'string' || !id) continue;
    if (entry && typeof entry === 'object' && entry.enabled === false) continue;
    if (prefix && !id.toLowerCase().startsWith(prefix)) continue;
    out.push({name: id.slice(0, 100), value: id});
    if (out.length >= limit) break;
  }
  return out;
}

export function enabledProject(projects, id) {
  if (typeof id !== 'string' || !id) return false;
  return (Array.isArray(projects) ? projects : []).some(entry => {
    const value = typeof entry === 'string' ? entry : entry?.id;
    if (value !== id) return false;
    return !(entry && typeof entry === 'object' && entry.enabled === false);
  });
}

// Up to five enabled projects that look like the mistyped id: prefix matches
// first, then substring matches, in the order the cached list gives them.
export function projectSuggestions(projects, typed, limit = 5) {
  const needle = typeof typed === 'string' ? typed.trim().toLowerCase() : '';
  if (!needle) return [];
  const prefix = [];
  const contains = [];
  for (const entry of Array.isArray(projects) ? projects : []) {
    const id = typeof entry === 'string' ? entry : entry?.id;
    if (typeof id !== 'string' || !id) continue;
    if (entry && typeof entry === 'object' && entry.enabled === false) continue;
    const lower = id.toLowerCase();
    if (lower === needle) continue;
    if (lower.startsWith(needle)) prefix.push(id);
    else if (lower.includes(needle)) contains.push(id);
  }
  return [...prefix, ...contains].slice(0, Math.max(0, limit));
}

export function statusText(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const queue = source.queue && typeof source.queue === 'object' ? source.queue : {};
  const label = {queued: '대기', held: '보류', running: '진행', paused: '멈춤', 'waiting-permission': '승인 대기', passed: '완료',
    failed: '실패', blocked: '멈춰 있음', unknown: '확인 필요', closed: '닫힘', cleaning: '정리', ready: '준비', dispatching: '시작 중'};
  const queueText = Object.entries(queue).map(([state, count]) => `${label[state] ?? state} ${count}`).join(', ') || '없음';
  const tasks = Array.isArray(source.tasks) ? source.tasks : [];
  const running = ['dispatching', 'running', 'waiting-permission', 'repairing'];
  const active = tasks.filter(task => running.includes(task?.state)).length;
  return [
    `상태: ${source.healthy ? '정상' : '확인 필요'}`,
    `작업 접수: ${source.acceptsTasks ? '가능' : '불가'}`,
    `대기열: ${queueText}`,
    `진행 중: ${active}`,
  ].join('\n');
}
