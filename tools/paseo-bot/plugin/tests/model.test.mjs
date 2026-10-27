import {test} from 'node:test';
import assert from 'node:assert/strict';
import {laneOf,requesterLabel,safePr,duration,relativeTime,modelLabel,stageProgress} from '../shared/model.ts';
import {rowSchema,selectionSchema,taskSchema,workflowSchema} from '../shared/contracts.ts';
test('authoritative state groups never confuse active review with attention',()=>{
  assert.equal(laneOf('running'),'running');assert.equal(laneOf('repairing'),'running');assert.equal(laneOf('blocked'),'attention');assert.equal(laneOf('new-unknown-state'),'attention');assert.equal(laneOf('passed'),'success');
});
test('producer badges and temporal labels preserve unknowns',()=>{
  assert.equal(requesterLabel('grok'),'Grok 봇');assert.equal(requesterLabel('legacy'),'이전 작업');assert.equal(duration(100,220),'2분 0초');assert.equal(relativeTime(0),'기록 없음');
});
test('PR actions only allow literal HTTPS GitHub pull URLs',()=>{
  assert.equal(safePr('https://github.com/wilgon456/Paseobility/pull/34'),'https://github.com/wilgon456/Paseobility/pull/34');for(const url of ['javascript:alert(1)','file:///tmp/a','https://github.com@evil.test/a/b/pull/1','https://github.com/a/b/pull/1?token=x'])assert.equal(safePr(url),'');
});
test('model labels follow routing aliases and retired terra displays as Sol',()=>{
  assert.equal(modelLabel('sol'),'GPT-6.1 Sol');assert.equal(modelLabel('terra'),'GPT-6.1 Sol');assert.equal(modelLabel('claude'),'Claude Opus 5.5');assert.equal(modelLabel('go'),'DeepSeek V4.1 Flash');assert.equal(modelLabel('go',true),'Flash');assert.equal(modelLabel(''),'');
});
test('workflow is optional on selections, tasks and rows and limited to daily or verified',()=>{
  const selection={project:'auto',model:'auto',effort:'auto'};
  assert.deepEqual(selectionSchema.parse(selection),selection);
  assert.equal(selectionSchema.parse({...selection,workflow:'verified'}).workflow,'verified');
  assert.equal(selectionSchema.safeParse({...selection,workflow:'fast'}).success,false);
  const task={id:'t1',project:'p',title:'t',prompt:'p',kind:'gpt'};
  assert.equal(taskSchema.parse(task).workflow,undefined);assert.equal(taskSchema.parse({...task,workflow:'daily'}).workflow,'daily');
  const row={id:'r1',state:'running',title:'t',project:'p',updatedAt:1};
  assert.equal(rowSchema.parse(row).workflow,undefined);assert.equal(rowSchema.parse({...row,workflow:'verified'}).workflow,'verified');
  assert.deepEqual(workflowSchema.options,['daily','verified']);
});
test('stage progress counts completed stages',()=>{
  assert.equal(stageProgress('queued','preflight'),0);assert.equal(stageProgress('running','work'),1);assert.equal(stageProgress('running','postflight'),3);assert.equal(stageProgress('passed','postflight'),4);assert.equal(stageProgress('failed','review'),2);
});
