import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('./snapshot.mjs', import.meta.url));
function probe(scenario, request) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-snapshot-test-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(root, 'daemon-target.js'), 'export const selectDaemonTarget = () => ({kind:"instance",home:"fixture"});');
    fs.writeFileSync(path.join(root, 'client.js'), `
      import fs from 'node:fs';
      const scenario = process.env.SCENARIO;
      export async function connectToDaemon() {return {
        getDaemonStatus: async () => ({serverId:'fixture-server'}),
        fetchAgents: async options => {
          if (scenario === 'schema') return {entries:[],pageInfo:{}};
          const second = !!options.page.cursor;
          return {entries:[{agent:{id:second?'second-agent':'first-agent',status:scenario==='running'?'running':'idle',workspaceId:'fixture-workspace',pendingPermissions:[]}}],
            pageInfo:{hasMore:scenario==='loop'||!second,nextCursor:scenario==='inconsistent'&&second?'bad':scenario==='loop'||!second?'next':null}};
        },
        fetchWorkspaces: async () => ({entries:[{id:'fixture-workspace',name:'test'}],pageInfo:{hasMore:false,nextCursor:null}}),
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
