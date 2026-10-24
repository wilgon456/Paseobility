import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('./snapshot.mjs', import.meta.url));
function probe(scenario, request, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-snapshot-test-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(root, 'daemon-target.js'), overrides.targetModule
      ?? 'export const selectDaemonTarget = () => ({kind:"instance",home:"fixture"});');
    fs.writeFileSync(path.join(root, 'client.js'), overrides.clientModule ?? `
      import fs from 'node:fs';
      const scenario = process.env.SCENARIO;
      const oldClient = scenario.startsWith('old-client');
      // A 0.12+ client throws when includeBackground reaches a host without the feature.
      const gate = options => {if (scenario === 'old-host' && 'includeBackground' in options) throw Error('Update the host');};
      export async function connectToDaemon() {return {
        getDaemonStatus: async () => ({serverId:'fixture-server',
          version: scenario==='old-client-011'?'0.11.4':scenario==='old-client-012'?'0.12.0':'test'}),
        ...(oldClient ? {} : {supportsBackgroundWorkspaces: () => scenario !== 'old-host'}),
        fetchAgents: async options => {
          gate(options);
          if (scenario === 'background') return {entries:[{agent:{id:'visible-agent',status:'idle',workspaceId:'fixture-workspace'}},
            ...(options.includeBackground ? [{agent:{id:'background-agent',status:'idle',workspaceId:'background-workspace'}}] : [])],
            pageInfo:{hasMore:false,nextCursor:null}};
          if (scenario === 'schema') return {entries:[],pageInfo:{}};
          const second = !!options.page.cursor;
          return {entries:[{agent:{id:second?'second-agent':'first-agent',status:scenario==='running'?'running':'idle',workspaceId:'fixture-workspace',pendingPermissions:[]}}],
            pageInfo:{hasMore:scenario==='loop'||!second,nextCursor:scenario==='inconsistent'&&second?'bad':scenario==='loop'||!second?'next':null}};
        },
        fetchWorkspaces: async options => {
          gate(options);
          return {entries:[{id:'fixture-workspace',name:'test'},
            ...(scenario === 'background' && options.includeBackground ? [{id:'background-workspace',name:'bg',background:true}] : [])],
            pageInfo:{hasMore:false,nextCursor:null}};
        },
        close: async () => fs.writeFileSync(process.env.CLOSE_MARKER,'closed'),
        archiveAgent: async id => {fs.writeFileSync(process.env.ARCHIVE_MARKER,id);return {archivedAt:'2026-10-13T00:00:00Z'};},
        archiveWorkspace: async id => {fs.writeFileSync(process.env.ARCHIVE_MARKER,id);return {archivedAt:'2026-10-13T00:00:00Z'};}
      };}
    `);
    const marker = path.join(root, 'closed');
    const archived=path.join(root,'archived');
    const result = spawnSync(process.execPath, [script], {encoding:'utf8',timeout:5000,input:JSON.stringify(request||{action:'snapshot'}),
      env:{...process.env,PASEO_CLEANUP_CLIENT_MODULE:path.join(root,'client.js'),SCENARIO:scenario,CLOSE_MARKER:marker,ARCHIVE_MARKER:archived}});
    return {...result,payload:JSON.parse(result.stdout),closed:fs.existsSync(marker),archived:fs.existsSync(archived)};
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
test('snapshot reads every page and closes its own client', () => {
  const result = probe('valid');
  assert.equal(result.status,0);
  assert.equal(result.payload.complete,true);
  assert.deepEqual(result.payload.agents.map(agent=>agent.id),['first-agent','second-agent']);
  assert.equal(result.payload.agents[0].pendingPermissionCount,0);
  assert.equal(result.payload.workspaces[0].workspaceId,'fixture-workspace');
  assert.equal(result.closed,true);
});
for (const scenario of ['loop','schema','inconsistent']) test(`snapshot refuses ${scenario} pagination without a partial success`, () => {
  const result=probe(scenario);
  assert.equal(result.status,1);
  assert.equal(result.payload.complete,undefined);
  assert.equal(result.payload.agents,undefined);
  assert.match(result.payload.error,/guarded request/);
  assert.equal(result.closed,true);
});
test('guarded archive accepts a full ID from a later page',()=>{
  const result=probe('valid',{action:'archive',kind:'agent',id:'second-agent',serverId:'fixture-server'});
  assert.equal(result.status,0);
  assert.equal(result.payload.agentId,'second-agent');
  assert.equal(result.archived,true);
  assert.equal(result.closed,true);
});
for(const [scenario,kind,serverId] of [['running','agent','fixture-server'],['running','workspace','fixture-server'],['valid','agent','different-server']])
  test(`guarded ${kind} archive refuses ${scenario}/${serverId}`,()=>{
    const result=probe(scenario,{action:'archive',kind,id:kind==='agent'?'second-agent':'fixture-workspace',serverId});
    assert.equal(result.status,1);
    assert.equal(result.archived,false);
    assert.equal(result.closed,true);
  });
test('snapshot includes background workspaces and their agents on Paseo 0.12+', () => {
  const result = probe('background');
  assert.equal(result.status,0);
  assert.equal(result.payload.backgroundCovered,true);
  assert.deepEqual(result.payload.agents.map(agent=>agent.id),['visible-agent','background-agent']);
  assert.deepEqual(result.payload.workspaces.map(w=>[w.workspaceId,w.background]),
    [['fixture-workspace',false],['background-workspace',true]]);
});
for (const [scenario,covered] of [['old-client-011',true],['old-client-012',false],['old-host',true]])
  test(`snapshot reports background coverage for ${scenario}`, () => {
    const result = probe(scenario);
    assert.equal(result.status,0);
    assert.equal(result.payload.complete,true);
    assert.equal(result.payload.backgroundCovered,covered);
  });
for (const [missing,overrides] of [
  ['connectToDaemon',{clientModule:'export const connect = () => {};'}],
  ['selectDaemonTarget',{targetModule:'export const selectTarget = () => ({});'}],
]) test(`snapshot names a changed client interface missing ${missing}`, () => {
  const result = probe('valid',{action:'snapshot'},overrides);
  assert.equal(result.status,1);
  assert.equal(result.payload.error,`Installed Paseo client interface changed: missing ${missing}`);
  assert.equal(result.closed,false);
});
