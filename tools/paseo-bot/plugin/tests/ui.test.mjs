import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {preview} from './preview.mjs';
import {chrome} from './browser.mjs';
test('conversation, confirmed admission, read-only kanban, filters, result and retry controls',async()=>{
  const p=await preview();let browser;
  try{
    browser=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(p.url);
    await page.getByText('봇과 대화',{exact:true}).waitFor();
    assert.equal(await page.locator('[draggable="true"]').count(),0);
    assert.equal(await page.getByTestId('task-card').count(),5);
    await page.getByRole('button',{name:'계획 확인',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__actions?.filter(a=>a.action==='approve').length??0),0);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'계획 확인',exact:true}).click();
    await page.getByRole('button',{name:'확인하고 접수',exact:true}).click();
    await page.getByRole('status').filter({hasText:'1개 작업을 접수했습니다.'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__actions.filter(a=>a.action==='approve').length),1);
    await page.getByRole('button',{name:'목록',exact:true}).click();
    await page.getByLabel('작업 검색',{exact:true}).fill('테스트 실패');
    assert.equal(await page.getByTestId('task-card').count(),1);
    await page.getByRole('button',{name:'재시도',exact:true}).click();
    await page.getByRole('dialog',{name:'실패 작업 재검토',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__actions.filter(a=>a.action==='send').length),0);
    await page.getByRole('button',{name:'돌아가기',exact:true}).click();
    await page.getByRole('button',{name:'재시도',exact:true}).click();
    await page.getByRole('button',{name:'봇에게 재검토 요청',exact:true}).click();
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
    await page.getByRole('button',{name:'프로젝트: 봇과 정하기',exact:true}).click();
    assert.equal(await page.getByRole('radio',{name:'disabled-project',exact:true}).count(),0);
    await page.getByRole('radio',{name:'paseobility',exact:true}).click();
    const input=page.getByLabel('봇에게 요청하기',{exact:true});await input.fill('한글 입력 테스트');
    await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});
    assert.equal(await input.inputValue(),'한글 입력 테스트');
    await page.keyboard.press('Shift+Enter');assert.ok((await input.inputValue()).includes('\n'));
    await page.keyboard.press('Enter');
    await page.getByRole('status').filter({hasText:'봇에게 요청을 전달했습니다.'}).waitFor();
    assert.equal(await input.inputValue(),'');
    await page.getByText('Paseo 봇',{exact:true}).first().click();await page.keyboard.press('/');
    assert.equal(await page.getByLabel('작업 검색',{exact:true}).evaluate(n=>n===document.activeElement),true);
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await new Promise(r=>p.server.close(r));}
});
test('ambiguous chat send keeps the same request ID and immutable draft',async()=>{
  const p=await preview();let b;
  try{
    b=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});const page=await b.newPage({viewport:{width:1200,height:1000}});
    await page.goto(p.url+'?state=send-failure');const field=page.getByLabel('봇에게 요청하기',{exact:true});await field.fill('중복 없이 전달');
    await page.getByRole('button',{name:'보내기',exact:true}).click();await page.getByText(/전달 여부를 확인하지 못했습니다/).waitFor();
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
    for(const state of ['empty','loading','error']){const page=await b.newPage();await page.goto(p.url+'?state='+state);await page.getByText(state==='empty'?'요청을 편하게 말씀해 주세요':state==='loading'?'Paseo 봇':'VAXPORT와 연결이 끊겼습니다',{exact:true}).first().waitFor();await page.close();}
  }finally{await b?.close();await new Promise(r=>p.server.close(r));}
});
