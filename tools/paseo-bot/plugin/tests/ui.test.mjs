import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {preview} from './preview.mjs';
import {chrome} from './browser.mjs';
import {contrast} from '../shared/colors.ts';
test('conversation, confirmed admission, read-only kanban, filters, result and retry controls',async()=>{
  const p=await preview();let browser;
  try{
    browser=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(p.url);
    await page.getByRole('heading',{name:'Paseo 봇',exact:true}).waitFor();
    assert.equal(await page.getByTestId('secondary-board').count(),0);
    await page.getByRole('button',{name:'프로젝트: 자동',exact:true}).click();
    await page.getByRole('radio',{name:'paseobility',exact:true}).click();
    await page.getByRole('button',{name:'모델: 자동',exact:true}).click();
    await page.getByRole('radio',{name:'GPT-6.1 Sol',exact:true}).click();
    await page.getByRole('button',{name:'effort: 자동',exact:true}).click();
    await page.getByRole('radio',{name:'High',exact:true}).click();
    await page.getByRole('radio',{name:'정밀 검증',exact:true}).click();
    await page.getByRole('button',{name:'접수',exact:true}).click();
    await page.getByRole('status').filter({hasText:'접수했어요.'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__actions.filter(a=>a.action==='approve').length),1);
    await page.getByRole('button',{name:'작업 보기',exact:true}).click();
    assert.equal(await page.locator('[draggable="true"]').count(),0);
    assert.equal(await page.getByTestId('task-card').count(),6);
    await page.getByRole('button',{name:'목록',exact:true}).click();
    await page.getByLabel('작업 검색',{exact:true}).fill('테스트 실패');
    assert.equal(await page.getByTestId('task-card').count(),1);
    await page.getByRole('button',{name:'재시도',exact:true}).click();
    await page.getByRole('dialog',{name:'다시 해 볼까요?',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__actions.filter(a=>a.action==='send').length),0);
    await page.getByRole('button',{name:'돌아가기',exact:true}).click();
    await page.getByRole('button',{name:'재시도',exact:true}).click();
    await page.getByRole('button',{name:'새 계획 요청',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__actions.filter(a=>a.action==='send'&&a.retryOf==='fixture-4').length),1);
    await page.getByLabel('작업 검색',{exact:true}).fill('');
    await page.getByRole('button',{name:'요청자: 전체',exact:true}).click();
    await page.getByRole('radio',{name:'Grok 봇',exact:true}).click();
    assert.equal(await page.getByTestId('task-card').count(),1);
    await page.getByLabel('작업 검색',{exact:true}).fill('does-not-exist');
    await page.getByText('조건에 맞는 작업이 없습니다',{exact:true}).waitFor();
    await page.getByRole('button',{name:'필터 초기화',exact:true}).click();
    await page.getByRole('button',{name:'큐 상태 표시 수정, passed',exact:true}).click();
    await page.getByRole('button',{name:'단계 기록',exact:true}).click();
    await page.getByText('npm test · 종료 코드 0',{exact:true}).waitFor();
    await page.getByRole('button',{name:'결과 JSON',exact:true}).click();
    await page.getByRole('button',{name:'원문 복사',exact:true}).click();
    assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).includes('postflight'));
    await page.getByRole('button',{name:'패널 닫기',exact:true}).click();
    const input=page.getByLabel('봇에게 요청하기',{exact:true});await input.fill('한글 입력 테스트');
    await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});
    assert.equal(await input.inputValue(),'한글 입력 테스트');
    await page.keyboard.press('Shift+Enter');assert.ok((await input.inputValue()).includes('\n'));
    await page.keyboard.press('Enter');
    await page.getByRole('status').filter({hasText:'전달했어요.'}).waitFor();
    assert.equal(await input.inputValue(),'');
    assert.deepEqual(await page.evaluate(()=>window.__actions.findLast(a=>a.action==='send').selection), {project:'paseobility',model:'sol',effort:'high',workflow:'verified'});
    await page.getByRole('button',{name:'작업 닫기',exact:true}).focus();await page.keyboard.press('/');
    await page.waitForFunction(()=>document.querySelector('[aria-label="작업 검색"]')===document.activeElement);
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await new Promise(r=>p.server.close(r));}
});
test('ambiguous chat send keeps the same request ID and immutable draft',async()=>{
  const p=await preview();let b;
  try{
    b=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});const page=await b.newPage({viewport:{width:1200,height:1000}});
    await page.goto(p.url+'?state=send-failure');const field=page.getByLabel('봇에게 요청하기',{exact:true});await field.fill('중복 없이 전달');
    await page.getByRole('button',{name:'보내기',exact:true}).click();await page.getByText(/전달 여부를 확인하지 못했어요/).waitFor();
    assert.equal(await field.isEditable(),false);await page.getByRole('button',{name:'보내기',exact:true}).click();
    const actions=await page.evaluate(()=>window.__actions.filter(a=>a.action==='send'));assert.equal(actions.length,2);assert.equal(actions[0].messageId,actions[1].messageId);assert.equal(actions[0].text,actions[1].text);
  }finally{await b?.close();await new Promise(r=>p.server.close(r));}
});
test('light/dark phone, tablet and desktop: no page overflow and 44px controls',async()=>{
  const p=await preview();let b;
  try{
    b=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});
    for(const colorScheme of ['light','dark'])for(const width of [375,768,1440]){
      const page=await b.newPage({viewport:{width,height:1000},colorScheme});await page.goto(p.url+'?state=kanban');await page.getByTestId('task-card').first().waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${colorScheme} ${width} overflow`);
      const buttons=await page.getByRole('button').all();for(const button of buttons){const r=await button.boundingBox();if(r&&r.height>0)assert.ok(r.height>=43.5,`Small target ${await button.getAttribute('aria-label')}: ${r.height}`);}
      await page.close();
    }
    for(const state of ['empty','loading','error']){const page=await b.newPage();await page.goto(p.url+'?state='+state);await page.getByText(state==='empty'?'무엇을 도와드릴까요?':state==='loading'?'Paseo 봇':'연결을 다시 확인하고 있어요',{exact:true}).first().waitFor();await page.close();}
  }finally{await b?.close();await new Promise(r=>p.server.close(r));}
});

test('one sentence starts a conversation without a session form',async()=>{
 const p=await preview();let b;
 try{b=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});const page=await b.newPage();await page.goto(p.url+'?state=first');
 assert.equal(await page.getByTestId('secondary-board').count(),0);
 await page.getByLabel('봇에게 요청하기',{exact:true}).fill('로그인 오류를 고쳐 줘');await page.getByRole('button',{name:'보내기',exact:true}).click();
 await page.getByText('로그인 오류를 고쳐 줘',{exact:true}).waitFor();const actions=await page.evaluate(()=>window.__actions);assert.equal(actions.length,1);assert.equal(actions[0].action,'start');assert.equal(actions[0].text,'로그인 오류를 고쳐 줘');
 assert.equal(actions[0].selection.workflow,'daily');
 }finally{await b?.close();await new Promise(r=>p.server.close(r));}
});
test('primary chat is centered and long kanban lanes remain independently reachable',async()=>{
 const p=await preview();let b;
 try{b=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});const page=await b.newPage({viewport:{width:1440,height:1000}});await page.goto(p.url);
 const chat=await page.getByTestId('main-chat').boundingBox();assert.ok(Math.abs(chat.x+chat.width/2-720)<2);
 await page.goto(p.url+'?state=long-board');const lane=page.getByTestId('lane-scroll-attention');await lane.waitFor();
 assert.ok(await lane.evaluate(e=>e.scrollHeight>e.clientHeight+100));await lane.evaluate(e=>e.scrollTop=e.scrollHeight);
 await page.getByRole('button',{name:'검토 작업 29, blocked',exact:true}).click();await page.getByRole('dialog',{name:'검토 작업 29',exact:true}).waitFor();
 }finally{await b?.close();await new Promise(r=>p.server.close(r));}
});

test('plan is compact, details start closed and modification cancels without admission',async()=>{
 const p=await preview(); let b;
 try {
  b=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});
  for(const colorScheme of ['light','dark'])for(const width of [375,768,1440]){
   const page=await b.newPage({viewport:{width,height:1000},colorScheme}); await page.goto(p.url);
   const card=page.getByTestId('plan-card'); await card.scrollIntoViewIfNeeded();
   assert.equal(await page.getByTestId('plan-details').count(),0);
   assert.ok((await card.boundingBox()).height <= 130, `plan height at ${width}`);
   await page.getByRole('button',{name:'상세 펼치기',exact:true}).click();
   await page.getByTestId('plan-details').waitFor();
   await page.getByRole('button',{name:'상세 접기',exact:true}).click();
   await page.getByTestId('plan-details').waitFor({state:'detached'});
   await page.getByRole('button',{name:'수정',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.__actions.filter(a=>a.action==='reject').length),1);
   assert.equal(await page.evaluate(()=>window.__actions.filter(a=>a.action==='approve').length),0);
   await page.close();
  }
 } finally {await b?.close();await new Promise(r=>p.server.close(r));}
});

test('semantic tags maintain AA contrast and reduced motion stops the running indicator',async()=>{
 const p=await preview(); let b;
 try {
  b=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});
  for(const colorScheme of ['light','dark']){
   const page=await b.newPage({viewport:{width:1440,height:1000},colorScheme,reducedMotion:'reduce'});
   await page.goto(p.url+'?state=kanban'); await page.getByTestId('task-card').first().waitFor();
   const pairs=await page.getByTestId('semantic-tag').evaluateAll(nodes=>nodes.map(n=>[getComputedStyle(n).backgroundColor,getComputedStyle(n.querySelector('*')).color]));
   assert.ok(pairs.length>4);
   for(const [background,foreground] of pairs) assert.ok(contrast(background,foreground)>=4.5,`${background} ${foreground}`);
   const indicator=page.getByRole('button',{name:'모바일 입력 흐름 개선, running'}).getByTestId('status-icon');
   const first=await indicator.evaluate(n=>[getComputedStyle(n).opacity,getComputedStyle(n).transform]);
   await page.waitForTimeout(1000);
   const second=await indicator.evaluate(n=>[getComputedStyle(n).opacity,getComputedStyle(n).transform]);
   assert.deepEqual(second,first);
   await page.close();
  }
 } finally {await b?.close();await new Promise(r=>p.server.close(r));}
});

test('starters fill the composer without sending; the workflow choice survives a conversation switch',async()=>{
  const p=await preview();let b;
  try{b=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});
    for(const colorScheme of ['light','dark'])for(const width of [375,1440]){
      const page=await b.newPage({viewport:{width,height:1000},colorScheme});await page.goto(p.url+'?state=empty');
      await page.getByTestId('starters').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${colorScheme} ${width} overflow`);
      for(const radio of await page.getByRole('radio').all()){const r=await radio.boundingBox();assert.ok(r&&r.height>=43.5,`Small segment ${await radio.getAttribute('aria-label')}: ${r?.height}`);}
      assert.equal(await page.getByRole('radio',{name:'일상',exact:true}).getAttribute('aria-checked'),'true');
      await page.getByRole('button',{name:'글 다듬기',exact:true}).click();
      const field=page.getByLabel('봇에게 요청하기',{exact:true});
      assert.ok((await field.inputValue()).length>0);
      await page.waitForFunction(()=>document.querySelector('[data-testid="bot-composer"]')===document.activeElement);
      assert.equal(await page.evaluate(()=>(window.__actions??[]).length),0);
      await page.close();
    }
    const page=await b.newPage({viewport:{width:1440,height:1000}});await page.goto(p.url+'?state=empty');
    await page.getByRole('radio',{name:'정밀 검증',exact:true}).click();
    await page.getByLabel('봇에게 요청하기',{exact:true}).fill('임시 초안');
    await page.getByRole('button',{name:'새 대화',exact:true}).click();
    await page.waitForFunction(()=>window.__actions.some(a=>a.action==='create'));
    assert.equal(await page.getByRole('radio',{name:'일상',exact:true}).getAttribute('aria-checked'),'true');
    await page.getByRole('button',{name:'대화 기록',exact:true}).click();
    await page.getByRole('button',{name:'로그인 오류와 모바일 입력 개선',exact:true}).click();
    assert.equal(await page.getByLabel('봇에게 요청하기',{exact:true}).inputValue(),'임시 초안');
    assert.equal(await page.getByRole('radio',{name:'정밀 검증',exact:true}).getAttribute('aria-checked'),'true');
  }finally{await b?.close();await new Promise(r=>p.server.close(r));}
});

test('daily results show two stages and verified or legacy results show four',async()=>{
  const p=await preview();let b;
  try{b=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});const page=await b.newPage({viewport:{width:1440,height:1000}});
    await page.goto(p.url+'?state=detail-daily');await page.getByRole('dialog',{name:'모바일 입력 흐름 개선',exact:true}).waitFor();
    assert.equal(await page.getByTestId('stage-row').count(),2);
    await page.goto(p.url+'?state=detail');await page.getByRole('dialog',{name:'큐 상태 표시 수정',exact:true}).waitFor();
    assert.equal(await page.getByTestId('stage-row').count(),4);
    await page.goto(p.url+'?state=kanban');await page.getByTestId('task-card').first().waitFor();
    assert.ok(await page.getByLabel(/^진행 .*\/2/).count()>=1);
    assert.ok(await page.getByLabel(/^진행 .*\/4/).count()>=1);
    await page.getByRole('button',{name:'테스트 실패 원인 분석, failed',exact:true}).click();await page.getByRole('dialog',{name:'테스트 실패 원인 분석',exact:true}).waitFor();
    assert.equal(await page.getByTestId('stage-row').count(),4);  // No recorded workflow: the legacy four-stage pipeline.
  }finally{await b?.close();await new Promise(r=>p.server.close(r));}
});

test('stuck delivery or a missing manager waits for one explicit operator action',async()=>{
  const p=await preview();let b;
  try{b=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});const page=await b.newPage({viewport:{width:375,height:900}});
    for(const [state,label] of [['stuck','이 요청 버리고 계속하기'],['stuck-manager','매니저 다시 시작']]){
      await page.goto(p.url+'?state='+state);
      await page.getByRole('heading',{name:'Paseo 봇',exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>(window.__actions??[]).length),0);  // Nothing is resolved automatically.
      await page.getByRole('button',{name:label,exact:true}).click();
      assert.deepEqual(await page.evaluate(()=>window.__actions.at(-1)),{action:'resolve',conversationId:'session-fixture'});
      await page.getByRole('button',{name:label,exact:true}).waitFor({state:'detached'});
    }
  }finally{await b?.close();await new Promise(r=>p.server.close(r));}
});
