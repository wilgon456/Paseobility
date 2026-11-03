// Offline contracts for the Discord gateway core. No network, no child processes.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from './discord_core.mjs';

const GUILD = '111111111111111111';
const CHANNEL = '222222222222222222';
const OWNER = '333333333333333333';
const MESSAGE = '444444444444444444';
const THREAD = '555555555555555555';
const RAW = {version: 1, enabled: true, guildId: GUILD, channelId: CHANNEL, ownerIds: [OWNER], python: '/venv/bin/python'};

function config(overrides = {}) {
  return c.parseConfig({...RAW, ...overrides});
}

function message(overrides = {}) {
  return {id: MESSAGE, guild_id: GUILD, channel_id: CHANNEL, type: 0, content: 'hello', author: {id: OWNER}, ...overrides};
}

const THREADS = {[THREAD]: {conversationId: 'd-' + MESSAGE, parentId: CHANNEL}};

test('config validation fails closed on malformed or unknown fields', () => {
  const valid = config();
  assert.equal(valid.enabled, true);
  assert.equal(valid.node, 'node');
  assert.deepEqual(valid.ownerIds, [OWNER]);
  for (const bad of [null, [], 'config', {...RAW, version: 2}, {...RAW, enabled: 'yes'}, {...RAW, guildId: '123'},
    {...RAW, channelId: 5}, {...RAW, ownerIds: []}, {...RAW, ownerIds: ['999']}, {...RAW, ownerIds: 'owner'},
    {...RAW, python: ''}, {...RAW, secretName: ''}, {...RAW, extra: true}, {...RAW, node: ''}]) {
    assert.equal(c.parseConfig(bad), null, JSON.stringify(bad));
  }
  // An invalid config closes the scope even when a caller forgets to check it.
  assert.equal(c.acceptMessage(null, message(), THREADS), false);
  assert.equal(c.acceptMessage(config({enabled: false}), message(), THREADS), false);
});

test('scope policy accepts only the owner in the configured channel', () => {
  const cfg = config();
  assert.equal(c.acceptMessage(cfg, message(), THREADS), true);
  assert.equal(c.acceptMessage(cfg, message({author: {id: OWNER, bot: true}}), THREADS), false);
  assert.equal(c.acceptMessage(cfg, message({author: {id: OWNER, system: true}}), THREADS), false);
  assert.equal(c.acceptMessage(cfg, message({author: {id: '999999999999999999'}}), THREADS), false);
  assert.equal(c.acceptMessage(cfg, message({author: null}), THREADS), false);
  assert.equal(c.acceptMessage(cfg, message({guild_id: '999999999999999999'}), THREADS), false);
  assert.equal(c.acceptMessage(cfg, message({channel_id: '999999999999999999'}), THREADS), false);
  assert.equal(c.acceptMessage(cfg, message({webhook_id: '999999999999999999'}), THREADS), false);
  assert.equal(c.acceptMessage(cfg, message({type: 7}), THREADS), false);
  assert.equal(c.acceptMessage(cfg, message({type: 19}), THREADS), true);  // mobile replies are owner text
  assert.equal(c.acceptMessage(cfg, message({id: '42'}), THREADS), false);
  assert.equal(c.acceptMessage(cfg, message({content: undefined}), THREADS), false);
});

test('only threads this service created under the channel are in scope', () => {
  const cfg = config();
  assert.equal(c.acceptMessage(cfg, message({channel_id: THREAD}), THREADS), true);
  assert.equal(c.acceptMessage(cfg, message({channel_id: THREAD}), {}), false, 'foreign thread');
  const foreignParent = {[THREAD]: {conversationId: 'd-x', parentId: '999999999999999999'}};
  assert.equal(c.acceptMessage(cfg, message({channel_id: THREAD}), foreignParent), false, 'foreign parent');
  const noConversation = {[THREAD]: {parentId: CHANNEL}};
  assert.equal(c.acceptMessage(cfg, message({channel_id: THREAD}), noConversation), false);
  assert.equal(c.inScopeChannel(cfg, THREADS, CHANNEL), true);
  assert.equal(c.inScopeChannel(cfg, THREADS, THREAD), true);
});

test('interactions are limited to the owner, guild and an owned thread', () => {
  const cfg = config();
  const interaction = (overrides = {}) => ({id: MESSAGE, token: 'token', type: 3, guild_id: GUILD, channel_id: THREAD,
    member: {user: {id: OWNER}}, data: {custom_id: 'pb:approve:plan-1'}, ...overrides});
  assert.equal(c.acceptInteraction(cfg, interaction(), THREADS), true);
  assert.equal(c.acceptInteraction(cfg, interaction({member: {user: {id: '999999999999999999'}}}), THREADS), false);
  assert.equal(c.acceptInteraction(cfg, interaction({member: {user: {id: OWNER, bot: true}}}), THREADS), false);
  assert.equal(c.acceptInteraction(cfg, interaction({guild_id: '999999999999999999'}), THREADS), false);
  assert.equal(c.acceptInteraction(cfg, interaction({channel_id: CHANNEL}), THREADS), true, 'channel commands');
  assert.equal(c.acceptInteraction(cfg, interaction({channel_id: '999999999999999999'}), THREADS), false);
  assert.equal(c.acceptInteraction(cfg, interaction({token: ''}), THREADS), false);
  assert.equal(c.acceptInteraction(cfg, interaction({type: 7}), THREADS), false);
  assert.equal(c.acceptInteraction(cfg, interaction(), {}), false);
  assert.equal(c.acceptInteraction(null, interaction(), THREADS), false);
});

test('custom ids round-trip and reject malformed values', () => {
  assert.equal(c.formatCustomId('approve', 'plan-1'), 'pb:approve:plan-1');
  assert.equal(c.formatCustomId('reject', 'plan_2'), 'pb:reject:plan_2');
  assert.deepEqual(c.parseCustomId('pb:approve:plan-1'), {action: 'approve', planId: 'plan-1'});
  assert.deepEqual(c.parseCustomId('pb:reject:plan-2'), {action: 'reject', planId: 'plan-2'});
  for (const bad of ['', 'pb:approve:', 'pb:accept:plan-1', 'pb:approve:../plan', 'PB:approve:plan-1',
    'pb:approve:plan 1', 'pb:approve:plan-1:extra', ':approve:plan-1', 'pb:approve:-plan', 'x'.repeat(200), null, 7]) {
    assert.equal(c.parseCustomId(bad), null, String(bad));
  }
  assert.throws(() => c.formatCustomId('delete', 'plan-1'));
  assert.throws(() => c.formatCustomId('approve', '-bad'));
  assert.throws(() => c.formatCustomId('approve', 'x'.repeat(81)));
});

test('chunking keeps every message under the limit at line boundaries', () => {
  assert.deepEqual(c.chunkText(''), []);
  assert.deepEqual(c.chunkText('x'.repeat(2000)), ['x'.repeat(2000)]);
  const lines = Array.from({length: 400}, (_, i) => `line ${i} ` + 'y'.repeat(10));
  const text = lines.join('\n');
  const chunks = c.chunkText(text);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 2000, String(chunk.length));
  assert.equal(chunks.join('\n'), text);
  const hard = c.chunkText('z'.repeat(4500));
  assert.deepEqual(hard.map(chunk => chunk.length), [2000, 2000, 500]);
  assert.throws(() => c.chunkText('x', 10));
});

test('plan cards render tasks with approve and reject buttons', () => {
  const plan = {
    id: 'plan-1', digest: 'digest', state: 'pending',
    tasks: [{project: 'paseo', machine: 'VAX_COM', model: 'auto', resolvedModel: 'sol', modelReason: '일반 작업 기본 모델',
      workflow: 'daily', title: '버튼 수정', prompt: 'p'}],
  };
  const card = c.planCard(plan);
  assert.deepEqual(card.components, [{type: 1, components: [
    {type: 2, style: 3, label: '접수', custom_id: 'pb:approve:plan-1'},
    {type: 2, style: 4, label: '거절', custom_id: 'pb:reject:plan-1'},
  ]}]);
  for (const needed of ['paseo', 'VAX_COM', '모델 auto (sol)', '일반 변경', '일반 작업 기본 모델', '버튼 수정']) {
    assert.ok(card.content.includes(needed), needed);
  }
  assert.deepEqual(card.allowed_mentions, {parse: []});
  assert.ok(card.content.length <= 2000);
  assert.throws(() => c.planCard({id: '../bad'}));
  const closed = c.planCardEdit({...plan, state: 'approved'});
  assert.deepEqual(closed.components, []);
  assert.ok(closed.content.includes('접수했어요'));
  assert.ok(c.planCardEdit({...plan, state: 'cancelled'}).content.includes('거절했어요'));
  assert.ok(c.planCardEdit({...plan, state: 'superseded'}).content.includes('새 계획'));
  assert.ok(c.planCardEdit({...plan, state: 'weird'}).content.includes('더 이상'));
});

test('plan cards preview prompts, dependencies and stay inside 2000 characters', () => {
  const base = {project: 'paseo', model: 'auto', resolvedModel: 'sol', workflow: 'daily', title: '작업'};
  const long = c.planCard({id: 'plan-preview', tasks: [{...base, prompt: 'a'.repeat(400)}]});
  assert.ok(long.content.includes('   요청: ' + 'a'.repeat(300) + '…'));
  assert.ok(!long.content.includes('a'.repeat(301)));
  const short = c.planCard({id: 'plan-short', tasks: [{...base, prompt: '짧은 요청'}]});
  assert.ok(short.content.includes('   요청: 짧은 요청'));
  assert.ok(!short.content.includes('요청: 짧은 요청…'));
  const multiline = c.planCard({id: 'plan-lines', tasks: [{...base, prompt: 'first\nsecond\r\nthird\tfourth'}]});
  assert.ok(multiline.content.includes('   요청: first second third fourth'));
  const deps = c.planCard({id: 'plan-deps', tasks: [{...base, prompt: 'p'}, {...base, prompt: 'q', dependsOn: [0]}]});
  assert.ok(deps.content.includes('   선행: 1'));
  assert.ok(!deps.content.includes('   선행: 0'));
  const noPrompt = c.planCard({id: 'plan-empty', tasks: [{...base, prompt: '   '}]});
  assert.ok(!noPrompt.content.includes('요청:'));
  const many = c.planCard({id: 'plan-many', tasks: Array.from({length: 12}, (_, i) => ({
    ...base, title: 'task ' + i, modelReason: '기본', prompt: 'p'.repeat(600),
  }))});
  assert.ok(many.content.length <= 2000, String(many.content.length));
  assert.ok(many.content.endsWith('(일부 생략)'));
  assert.ok(many.content.includes('   요청: ' + 'p'.repeat(80)));
});

test('activity tiers are hot, warm or dormant from activity and sync state', () => {
  const now = Date.UTC(2026, 0, 1);
  const minute = 60 * 1000;
  assert.equal(c.threadTier({lastActivityAt: now - minute}, null, now), 'hot');
  assert.equal(c.threadTier({lastActivityAt: now - 31 * minute}, null, now), 'warm');
  assert.equal(c.threadTier({lastActivityAt: now - 8 * 24 * 60 * minute}, null, now), 'dormant');
  assert.equal(c.threadTier({lastActivityAt: now - 31 * minute}, {deliveryState: 'waiting'}, now), 'hot');
  assert.equal(c.threadTier({lastActivityAt: now - 8 * 24 * 60 * minute}, {tasks: [{state: 'running'}]}, now), 'hot');
  assert.equal(c.threadTier({lastActivityAt: now - 8 * 24 * 60 * minute}, {tasks: [{state: 'passed'}]}, now), 'dormant');
  assert.equal(c.threadTier({lastActivityAt: now - 8 * 24 * 60 * minute}, {plans: [{state: 'pending'}]}, now), 'hot');
  assert.equal(c.threadTier({lastActivityAt: now - 8 * 24 * 60 * minute}, {plans: [{state: 'approved'}]}, now), 'dormant');
  assert.equal(c.threadTier({lastActivityAt: now - 8 * 24 * 60 * minute}, {activeTasks: true}, now), 'hot');
  assert.equal(c.threadTier({lastActivityAt: now - 8 * 24 * 60 * minute}, {pendingPlans: true}, now), 'hot');
  assert.equal(c.threadTier({lastActivityAt: now - minute, pendingCard: true}, null, now), 'hot');
  assert.equal(c.threadTier({lastActivityAt: now - minute, dormant: true}, null, now), 'dormant');
  assert.equal(c.threadTier({}, null, now), 'dormant');
  assert.equal(c.threadTier(null, null, now), 'dormant');
  // A stored summary keeps only what the next tier decision needs.
  assert.deepEqual(c.syncSummary({deliveryState: '', tasks: [{state: 'queued'}, {state: 'passed'}], plans: [{state: 'pending'}]}),
    {deliveryState: '', activeTasks: true, pendingPlans: true});
  assert.deepEqual(c.syncSummary(null), {deliveryState: '', activeTasks: false, pendingPlans: false});
  // Reloading a stored summary keeps its flags.
  assert.deepEqual(c.syncSummary({deliveryState: 'waiting', activeTasks: true, pendingPlans: true}),
    {deliveryState: 'waiting', activeTasks: true, pendingPlans: true});
});

test('each tick selects hot threads first, then due warm ones, capped at eight', () => {
  const now = Date.UTC(2026, 0, 1);
  const minute = 60 * 1000;
  const hot = Array.from({length: 10}, (_, i) => ({id: 'hot-' + i, tier: 'hot', polledAt: now - i}));
  assert.deepEqual(c.syncSelection(hot, now).length, 8);
  // least recently polled first, so every hot thread gets a turn even beyond the cap
  assert.deepEqual(c.syncSelection(hot, now), [...hot].reverse().slice(0, 8).map(entry => entry.id));
  const warm = [
    {id: 'warm-new', tier: 'warm', polledAt: now - 5 * minute},
    {id: 'warm-old', tier: 'warm', polledAt: now - 10 * minute},
    {id: 'warm-wait', tier: 'warm', polledAt: now - 1000},
    {id: 'dormant', tier: 'dormant', polledAt: 0},
  ];
  assert.deepEqual(c.syncSelection(warm, now), ['warm-old', 'warm-new']);
  const mixed = [...warm, {id: 'hot', tier: 'hot', polledAt: 0}];
  assert.deepEqual(c.syncSelection(mixed, now, 2), ['hot', 'warm-old']);
  assert.deepEqual(c.syncSelection(mixed, now, 0), []);
  assert.deepEqual(c.syncSelection([], now), []);
  assert.deepEqual(c.syncSelection(null, now), []);
});

test('the review hold notice is posted once per hold', () => {
  assert.equal(c.holdNotice({at: 1}), c.HOLD_NOTICE);
  assert.equal(c.holdNotice({at: 1, notice: true}), '');
  assert.equal(c.holdNotice({at: 1, notice: false}), c.HOLD_NOTICE);
  assert.equal(c.holdNotice(null), '');
  assert.ok(c.HOLD_NOTICE.includes('/resolve'));
});

test('project pre-check suggestions favour prefix then substring matches', () => {
  const projects = [{id: 'paseo', enabled: true}, {id: 'paseo-bot', enabled: true}, {id: 'off-paseo', enabled: false},
    {id: 'other', enabled: true}, 'paseo-docs', {id: 7}];
  assert.deepEqual(c.projectSuggestions(projects, 'pas'), ['paseo', 'paseo-bot', 'paseo-docs']);
  assert.deepEqual(c.projectSuggestions(projects, 'bot'), ['paseo-bot']);
  assert.deepEqual(c.projectSuggestions(projects, 'paseo'), ['paseo-bot', 'paseo-docs']);
  assert.deepEqual(c.projectSuggestions(projects, 'zzz'), []);
  assert.deepEqual(c.projectSuggestions(projects, ''), []);
  assert.deepEqual(c.projectSuggestions(Array.from({length: 9}, (_, i) => ({id: 'p' + i, enabled: true})), 'p').length, 5);
  assert.equal(c.enabledProject(projects, 'paseo'), true);
  assert.equal(c.enabledProject(projects, 'paseo-docs'), true);
  assert.equal(c.enabledProject(projects, 'off-paseo'), false);
  assert.equal(c.enabledProject(projects, 'missing'), false);
  assert.equal(c.enabledProject(null, 'paseo'), false);
});

test('outbound diff posts only undelivered manager and notice messages', () => {
  const messages = [
    {id: 'u1', role: 'user', text: 'my own words'},
    {id: 'a1', role: 'assistant', text: '답변'},
    {id: 's1', role: 'system', text: '작업을 진행하고 있어요.'},
    {id: 'a2', role: 'assistant', text: '이미 보냄'},
    {id: 'a3', role: 'assistant', text: '   '},
    {id: 's2', role: 'system', text: '', payload: {}},
  ];
  const pending = c.undelivered(messages, ['a2']);
  assert.deepEqual(pending.map(m => m.id), ['a1', 's1']);
  assert.equal(c.formatOutbound(pending[0]), '답변');
  assert.equal(c.formatOutbound(pending[1]), '• 작업을 진행하고 있어요.');
  assert.equal(c.formatOutbound({role: 'user', text: 'echo'}), 'echo');
  const pr = c.formatOutbound({id: 's3', role: 'system', text: '끝', payload: {prUrl: 'https://github.com/o/r/pull/7'}});
  assert.ok(pr.endsWith('\nhttps://github.com/o/r/pull/7'));
  const unsafe = c.formatOutbound({role: 'system', text: '끝', payload: {prUrl: 'https://evil.example/pull/7'}});
  assert.ok(!unsafe.includes('evil.example'));
  const delivered = c.cappedAppend(['a', 'b', 'c'], ['d'], 3);
  assert.deepEqual(delivered, ['b', 'c', 'd']);
  const seen = c.remember(['1'], '2', 2);
  assert.deepEqual(seen, ['1', '2']);
  assert.deepEqual(c.remember(seen, '3', 2), ['2', '3']);
  assert.deepEqual(c.remember(seen, '1', 5), ['1', '2']);
});

test('attachment policy enforces host, type, size and the 12000 character cap', () => {
  const base = {filename: 'notes.md', url: 'https://cdn.discordapp.com/attachments/1/2/notes.md', size: 32, content_type: 'application/octet-stream'};
  assert.equal(c.attachmentFetchable(base), true);
  assert.equal(c.attachmentFetchable({...base, filename: 'a.txt', content_type: 'text/plain'}), true);
  assert.equal(c.attachmentFetchable({...base, url: 'https://media.discordapp.net/attachments/1/2/a.txt'}), true);
  assert.equal(c.attachmentFetchable({...base, url: 'https://evil.example/attachments/1/a.md'}), false);
  assert.equal(c.attachmentFetchable({...base, url: 'http://cdn.discordapp.com/a.md'}), false);
  assert.equal(c.attachmentFetchable({...base, size: 102401}), false);
  assert.equal(c.attachmentFetchable({...base, size: '10'}), false);
  assert.equal(c.attachmentFetchable({...base, filename: 'a.pdf', content_type: 'application/pdf'}), false);
  assert.equal(c.appendAttachment('요청', base, 'body'), '요청\n\n[첨부 notes.md]\nbody');
  assert.equal(c.appendAttachment('요청', base, null), '요청\n[첨부 생략: notes.md, 32]');
  const big = c.appendAttachment('요청', base, 'x'.repeat(12000));
  assert.ok(big.length <= 12000, String(big.length));
  assert.ok(big.endsWith('[첨부 생략: notes.md, 32]'));
  assert.equal(c.attachmentSkip('a.log', 7), '\n[첨부 생략: a.log, 7]');
  assert.ok(c.appendAttachment('y'.repeat(12000), base, null).length <= 12000);
});

test('gateway state machine math: jitter, resume and fatal close codes', () => {
  assert.equal(c.heartbeatInterval(41250, 0), 0);
  assert.equal(c.heartbeatInterval(41250, 0.5), 20625);
  assert.ok(c.heartbeatInterval(41250, 0.999999) < 41250);
  assert.equal(c.heartbeatInterval(1000, -1), 0);
  assert.throws(() => c.heartbeatInterval(0, 0.5));
  assert.throws(() => c.heartbeatInterval('nope', 0.5));
  assert.equal(c.shouldResume('session', 0), true);
  assert.equal(c.shouldResume('session', 12), true);
  assert.equal(c.shouldResume('', 12), false);
  assert.equal(c.shouldResume('session', null), false);
  assert.equal(c.shouldResume('session', -1), false);
  assert.equal(c.shouldResume(undefined, 3), false);
  for (const code of [4004, 4010, 4011, 4012, 4013, 4014, '4013']) assert.equal(c.fatalClose(code), true, String(code));
  for (const code of [1000, 4000, 4001, 4002, 4003, 4005, 4008, 4009, 4015, 1006]) assert.equal(c.fatalClose(code), false);
  assert.ok(c.reconnectDelay(1) >= 500 && c.reconnectDelay(1) <= 1000);
  assert.ok(c.reconnectDelay(20, 1) <= 60000);
  assert.equal(c.reconnectDelay(0, 0), c.reconnectDelay(1, 0));
});

test('rate-limit waits come from retry_after, reset-after and retry-after', () => {
  assert.equal(c.rateLimitWait({status: 429, body: {retry_after: 2}}), 2000);
  assert.equal(c.rateLimitWait({status: 429, body: {retry_after: 0.25}}), 250);
  assert.equal(c.rateLimitWait({status: 200, headers: {'x-ratelimit-reset-after': '1.5'}}), 1500);
  assert.equal(c.rateLimitWait({status: 429, headers: {'Retry-After': '3'}}), 3000);
  assert.equal(c.rateLimitWait({status: 200, headers: {'x-ratelimit-remaining': '4'}}), 0);
  assert.equal(c.rateLimitWait({status: 429}), 1000);
  assert.equal(c.rateLimitWait({}), 0);
  assert.equal(c.headerValue(new Map([['X-RateLimit-Remaining', '0']]), 'x-ratelimit-remaining'), '0');
  assert.equal(c.rateLimitExhausted({'X-RateLimit-Remaining': '0'}), true);
  assert.equal(c.rateLimitExhausted({'x-ratelimit-remaining': '2'}), false);
  assert.equal(c.isGlobalLimit({'X-RateLimit-Global': 'true'}), true);
  assert.equal(c.isGlobalLimit({'x-ratelimit-global': 'false'}), false);
});

test('slash commands, selections and autocomplete stay bounded', () => {
  const definitions = c.commandDefinitions();
  assert.deepEqual(definitions, c.commandDefinitions());
  definitions[0].name = 'changed';
  assert.equal(c.commandDefinitions()[0].name, 'task');
  assert.deepEqual(c.commandDefinitions().map(command => command.name), ['task', 'status', 'cancel', 'pause', 'resume', 'peek', 'resolve']);
  const resolve = c.commandDefinitions().find(command => command.name === 'resolve');
  assert.deepEqual(resolve, {name: 'resolve', description: '확인이 필요한 대화를 다시 열어요.', type: 1, options: []});
  for (const name of c.CONTROL_COMMANDS) {
    const command = c.commandDefinitions().find(item => item.name === name);
    assert.equal(command.type, 1);
    assert.deepEqual(command.options, [{type: 3, name: 'task', description: '작업 ID (비우면 이 스레드의 작업)', required: false, autocomplete: true}]);
  }
  assert.deepEqual(c.commandOptions({data: {options: [{name: 'text', value: 'go'}, {name: 'project', value: 'paseo'}]}}),
    {text: 'go', project: 'paseo'});
  assert.deepEqual(c.selectionFromOptions({project: 'paseo', model: 'go', effort: 'high', workflow: 'verified'}),
    {project: 'paseo', model: 'go', effort: 'high', workflow: 'verified'});
  assert.deepEqual(c.selectionFromOptions({model: 'terra', effort: 'max', workflow: 'monthly'}), c.DEFAULT_SELECTION);
  assert.deepEqual(c.selectionFromOptions(null), c.DEFAULT_SELECTION);
  assert.equal(c.selectionFromOptions({project: '../etc'}).project, 'auto');
  const projects = [{id: 'paseo', enabled: true}, {id: 'paso', enabled: true}, {id: 'off', enabled: false}, {id: 7}];
  assert.deepEqual(c.autocompleteChoices(projects, 'pas').map(x => x.value), ['paseo', 'paso']);
  assert.deepEqual(c.autocompleteChoices(projects, ''), [{name: 'paseo', value: 'paseo'}, {name: 'paso', value: 'paso'}]);
  assert.equal(c.autocompleteChoices(Array.from({length: 40}, (_, i) => ({id: 'p' + i, enabled: true})), '').length, 25);
  assert.ok(c.statusText({healthy: true, acceptsTasks: true, queue: {queued: 2}, tasks: [{state: 'running'}, {state: 'passed'}]})
    .includes('진행 중: 1'));
  assert.ok(c.statusText(null).includes('없음'));
  assert.equal(c.threadName('  여러 줄\n 제목  '), '여러 줄 제목');
  assert.equal(c.threadName('x'.repeat(200)).length, 80);
  assert.equal(c.threadName(''), 'Paseo 봇 작업');
});

test('task control resolution uses the only active task and never guesses', () => {
  const tasks = [
    {id: 'a', project: 'paseo', state: 'running'},
    {id: 'b', project: 'paseo', state: 'passed'},
    {id: 'c', project: 'docs', state: 'paused'},
    {id: 'd', project: 'docs', state: 'closed'},
  ];
  assert.deepEqual(c.resolveTaskChoice([{id: 'a', state: 'running'}], ''), {taskId: 'a', state: 'one'});
  assert.deepEqual(c.resolveTaskChoice([{id: 'b', state: 'passed'}], ''), {taskId: '', state: 'none'});
  assert.deepEqual(c.resolveTaskChoice(tasks, ''), {taskId: '', state: 'many'});
  assert.deepEqual(c.resolveTaskChoice(tasks, 'a'), {taskId: 'a', state: 'one'});
  assert.deepEqual(c.resolveTaskChoice(tasks, 'c'), {taskId: 'c', state: 'one'});
  assert.deepEqual(c.resolveTaskChoice(tasks, 'b'), {taskId: '', state: 'missing'});
  assert.deepEqual(c.resolveTaskChoice(tasks, 'zzz'), {taskId: '', state: 'missing'});
  assert.deepEqual(c.resolveTaskChoice(null, null), {taskId: '', state: 'none'});
  assert.deepEqual(c.resolveTaskChoice(tasks, undefined), {taskId: '', state: 'many'});
});

test('task autocomplete lists active tasks as id · project · state', () => {
  const tasks = [
    {id: 'task-1', project: 'paseo', state: 'running'},
    {id: 'task-2', project: 'docs', state: 'passed'},
    {id: 'task-3', project: 'docs', state: 'held'},
    {id: 7},
  ];
  assert.deepEqual(c.taskChoices(tasks, ''), [
    {name: 'task-1 · paseo · running', value: 'task-1'},
    {name: 'task-3 · docs · held', value: 'task-3'},
  ]);
  assert.deepEqual(c.taskChoices(tasks, 'task-3').map(x => x.value), ['task-3']);
  assert.deepEqual(c.taskChoices(tasks, 'task-2'), []);
  assert.equal(c.taskChoices(tasks, '', 1).length, 1);
  const long = c.taskChoices([{id: 'x'.repeat(80), project: 'p'.repeat(100), state: 'running'}], '');
  assert.ok(long[0].name.length <= 100);
  assert.ok(c.taskListText(tasks).includes('task-1'));
  assert.ok(!c.taskListText(tasks).includes('task-2'));
  assert.ok(c.taskListText([]).includes('없어요'));
});

test('cancel confirmation custom ids round-trip and stay inside 100 characters', () => {
  const short = 'AbCdEf123456';
  assert.equal(c.formatConfirmId(short), 'pb:cc:AbCdEf123456');
  assert.equal(c.formatDismissId(short), 'pb:cx:AbCdEf123456');
  assert.equal(c.parseConfirmId('pb:cc:AbCdEf123456'), short);
  assert.equal(c.parseDismissId('pb:cx:AbCdEf123456'), short);
  assert.deepEqual(c.parseCustomId('pb:cc:AbCdEf123456'), {action: 'confirm', short});
  assert.deepEqual(c.parseCustomId('pb:cx:AbCdEf123456'), {action: 'dismiss', short});
  for (const bad of ['', 'pb:cc:', 'pb:cc:short', 'pb:cc:AbCdEf12345', 'pb:cc:AbCdEf1234567', 'pb:cc:AbCd f123456', 'pb:approve:plan-1', null, 7]) {
    assert.equal(c.parseConfirmId(bad), null, String(bad));
    assert.equal(c.parseDismissId(bad), null, String(bad));
  }
  assert.throws(() => c.formatConfirmId('short'));
  assert.throws(() => c.formatConfirmId('x'.repeat(13)));
  assert.throws(() => c.formatDismissId('bad key'));
  const key = c.confirmKey(() => 0);
  assert.equal(key, 'AAAAAAAAAAAA');
  assert.equal(c.confirmKey(() => 0.999999).length, 12);
  assert.match(c.confirmKey(), c.CONFIRM_KEY);
  const card = c.confirmCard('task-1', short);
  assert.ok(card.content.includes('task-1'));
  assert.deepEqual(card.components[0].components.map(button => button.custom_id), ['pb:cc:AbCdEf123456', 'pb:cx:AbCdEf123456']);
  assert.equal(card.components[0].components[0].label, '취소 확정');
  for (const button of card.components[0].components) assert.ok(button.custom_id.length <= 100);
  assert.deepEqual(card.allowed_mentions, {parse: []});
});

test('permission custom ids round-trip and only a 12-character key is accepted', () => {
  const pid = 'abc123def456';
  assert.equal(c.formatPermitId('allow', pid), 'pb:pa:abc123def456');
  assert.equal(c.formatPermitId('deny', pid), 'pb:pd:abc123def456');
  assert.deepEqual(c.parsePermitId('pb:pa:abc123def456'), {action: 'permit-allow', pid});
  assert.deepEqual(c.parsePermitId('pb:pd:abc123def456'), {action: 'permit-deny', pid});
  assert.deepEqual(c.parseCustomId('pb:pa:abc123def456'), {action: 'permit-allow', pid});
  assert.deepEqual(c.parseCustomId('pb:pd:abc123def456'), {action: 'permit-deny', pid});
  // Existing plan and cancel ids keep working.
  assert.deepEqual(c.parseCustomId('pb:approve:plan-1'), {action: 'approve', planId: 'plan-1'});
  assert.deepEqual(c.parseCustomId('pb:reject:plan-2'), {action: 'reject', planId: 'plan-2'});
  assert.deepEqual(c.parseCustomId('pb:cc:AbCdEf123456'), {action: 'confirm', short: 'AbCdEf123456'});
  assert.deepEqual(c.parseCustomId('pb:cx:AbCdEf123456'), {action: 'dismiss', short: 'AbCdEf123456'});
  for (const bad of ['', 'pb:pa:', 'pb:pa:short', 'pb:pa:ABC123DEF456', 'pb:pa:abc123def4567',
    'pb:px:abc123def456', 'pb:pa:abc 123def45', null, 7]) {
    assert.equal(c.parseCustomId(bad), null, String(bad));
    assert.equal(c.parsePermitId(bad), null, String(bad));
  }
  assert.throws(() => c.formatPermitId('maybe', pid));
  assert.throws(() => c.formatPermitId('allow', 'ABC123DEF456'));
});

test('permission notices render allow and deny buttons and can be resolved', () => {
  const pid = 'abc123def456';
  const components = c.permissionComponents({taskId: 'task-1', pid});
  assert.deepEqual(components, [{type: 1, components: [
    {type: 2, style: 3, label: '허용', custom_id: 'pb:pa:abc123def456'},
    {type: 2, style: 4, label: '거절', custom_id: 'pb:pd:abc123def456'},
  ]}]);
  assert.equal(c.permissionComponents({taskId: '../bad', pid}), null);
  assert.equal(c.permissionComponents({taskId: 'task-1', pid: 'short'}), null);
  assert.equal(c.permissionComponents(null), null);
  assert.deepEqual(c.permissionEdit('• 권한 요청이 왔어요: Bash', 'allow'),
    {content: '• 권한 요청이 왔어요: Bash\n\n허용했어요.', components: [], allowed_mentions: {parse: []}});
  assert.ok(c.permissionEdit('x', 'deny').content.endsWith('거절했어요.'));
  assert.deepEqual(c.permissionResolvedEdit('요청', '시간이 지나 거절했어요.').components, []);
  assert.ok(c.permissionResolvedEdit('요청', '시간이 지나 거절했어요.').content.includes('시간이 지나 거절했어요.'));
  assert.ok(c.permissionResolvedEdit('요청', '').content.includes('처리됐어요'));
  assert.ok(c.permissionEdit('x'.repeat(3000), 'allow').content.length <= c.MAX_MESSAGE);
});

test('peek formatting fences the newest lines under the reply cap', () => {
  assert.equal(c.peekBlock('hello'), '```\nhello\n```');
  const long = Array.from({length: 400}, (_, i) => `line ${i} ` + 'y'.repeat(20)).join('\n');
  const block = c.peekBlock(long);
  assert.ok(block.length <= c.PEEK_LIMIT, String(block.length));
  assert.ok(block.startsWith('```\n'));
  assert.ok(block.endsWith('\n```'));
  assert.ok(block.includes('line 399 '));
  assert.ok(!block.includes('line 0 '));
  const small = c.peekBlock('x'.repeat(5000), 500);
  assert.ok(small.length <= 500, String(small.length));
  const fences = c.peekBlock('before ``` after');
  assert.equal(fences, '```\nbefore `` after\n```');
  assert.equal(c.peekBlock(''), '```\n\n```');
  assert.equal(c.peekBlock(null), '```\n\n```');
});

test('memory approval custom ids round-trip and reject malformed keys', () => {
  const key = 'abc123def456';
  assert.equal(c.formatMemoryId('approve', key), `pb:ma:${key}`);
  assert.equal(c.formatMemoryId('reject', key), `pb:mr:${key}`);
  assert.deepEqual(c.parseCustomId(`pb:ma:${key}`), {action: 'memory-approve', key});
  assert.deepEqual(c.parseCustomId(`pb:mr:${key}`), {action: 'memory-reject', key});
  assert.deepEqual(c.parseMemoryId(`pb:ma:${key}`), {action: 'memory-approve', key});
  for (const bad of [`pb:ma:short`, `pb:mx:${key}`, `pb:ma:${key}x`, `pb:ma:${key.toUpperCase()}`,
    'pb:ma:', '', null, 5, `pb:ma:${key}${key}`]) {
    assert.equal(c.parseMemoryId(bad), null, String(bad));
  }
  for (const [action, keyValue] of [['delete', key], ['approve', 'short'], ['approve', null]]) {
    assert.throws(() => c.formatMemoryId(action, keyValue));
  }
});

test('memory approval buttons are approve/reject and edits clear them', () => {
  const key = 'abc123def456';
  assert.deepEqual(c.memoryComponents({key}), [{type: 1, components: [
    {type: 2, style: 3, label: '승인', custom_id: `pb:ma:${key}`},
    {type: 2, style: 4, label: '거절', custom_id: `pb:mr:${key}`},
  ]}]);
  assert.equal(c.memoryComponents({key: 'short'}), null);
  assert.equal(c.memoryComponents({}), null);
  assert.equal(c.memoryComponents(null), null);
  assert.deepEqual(c.memoryComponents({memoryApproval: {key}}), c.memoryComponents({key}));
  assert.deepEqual(c.memoryEdit('• 기억 변경 승인 요청 (fixture): 추가', 'approve'), {
    content: '• 기억 변경 승인 요청 (fixture): 추가\n\n기억 변경을 승인했어요.',
    components: [], allowed_mentions: {parse: []},
  });
  assert.ok(c.memoryEdit('x', 'reject').content.endsWith('기억 변경을 거절했어요.'));
  assert.ok(c.memoryEdit('x'.repeat(3000), 'approve').content.length <= c.MAX_MESSAGE);
});

test('memory-review maps to the channel itself, not a thread', () => {
  const cfg = config();
  assert.equal(c.isMemoryReview(c.MEMORY_REVIEW), true);
  assert.equal(c.isMemoryReview('d-444444444444444444'), false);
  const threads = {[CHANNEL]: {conversationId: c.MEMORY_REVIEW, parentId: CHANNEL}};
  assert.equal(c.trackedThread(cfg, threads, CHANNEL).conversationId, c.MEMORY_REVIEW);
  assert.equal(c.inScopeChannel(cfg, threads, CHANNEL), true);
  assert.equal(c.inScopeChannel(cfg, threads, THREAD), false);
  // A normal thread is still tracked and remains distinct from the review channel.
  assert.equal(c.trackedThread(cfg, THREADS, THREAD).conversationId, 'd-' + MESSAGE);
  assert.equal(c.isMemoryReview(c.trackedThread(cfg, THREADS, THREAD).conversationId), false);
});

test('workflow selection defaults to auto and offers read-only inspect', () => {
  assert.equal(c.DEFAULT_SELECTION.workflow, 'auto');
  assert.equal(c.selectionFromOptions({}).workflow, 'auto');
  assert.equal(c.selectionFromOptions({workflow: 'inspect'}).workflow, 'inspect');
  assert.equal(c.selectionFromOptions({workflow: 'rm -rf'}).workflow, 'auto');
  const task = c.commandDefinitions().find(command => command.name === 'task');
  const values = task.options.find(option => option.name === 'workflow').choices.map(choice => choice.value);
  assert.deepEqual(values, ['auto', 'inspect', 'daily', 'verified']);
});

test('status text uses Korean state labels', () => {
  const text = c.statusText({healthy: true, acceptsTasks: true, queue: {passed: 2, blocked: 1}, tasks: []});
  assert.match(text, /완료 2/);
  assert.match(text, /멈춰 있음 1/);
  assert.doesNotMatch(text, /passed/);
});
