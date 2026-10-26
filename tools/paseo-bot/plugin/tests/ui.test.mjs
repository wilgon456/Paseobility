import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {preview} from './preview.mjs';
const chrome=[process.env.CHROME_PATH,'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/google-chrome'].find(p=>p&&existsSync(p));
test('production view: list/result, form validation, submit and ambiguous retry',async()=>{
  const p=await preview();
  let browser;
  try{
    browser=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(p.url);
    await page.getByRole('button',{name:'큐 상태와 작업 결과 연결 확인, 검증 통과'}).click();
    await page.getByRole('button',{name:'상세 JSON 보기',exact:true}).click();
    assert.ok((await page.getByText(/"exitCode": 0/).textContent()).includes('exitCode'));
    await page.getByRole('button',{name:'새 작업',exact:true}).click();
    await page.getByRole('button',{name:'작업 제출',exact:true}).click();
    await page.getByText('등록된 활성 프로젝트, 제목, 작업 내용을 확인하세요.').waitFor();
    await page.getByRole('button',{name:'fixture-project',exact:true}).click();
    await page.getByLabel('제목',{exact:true}).fill('한글 제출 테스트');
    await page.getByLabel('작업 내용 (최대 40,000자)',{exact:true}).fill('작업을 제출합니다.');
    await page.getByRole('button',{name:'작업 제출',exact:true}).click();
    await page.getByText(/접수됨 · gui-/).waitFor();
    await page.goto(p.url+'?state=submit-failure');
    await page.getByRole('button',{name:'새 작업',exact:true}).click();
    await page.getByRole('button',{name:'fixture-project',exact:true}).click();
    await page.getByLabel('제목',{exact:true}).fill('불명확한 응답');
    await page.getByLabel('작업 내용 (최대 40,000자)',{exact:true}).fill('같은 ID를 유지');
    await page.getByRole('button',{name:'작업 제출',exact:true}).click();
    await page.getByRole('button',{name:'같은 요청 재시도',exact:true}).waitFor();
    assert.equal(await page.getByLabel('제목',{exact:true}).isEditable(),false);
    await page.getByRole('button',{name:'새 요청 작성',exact:true}).click();
    assert.equal(await page.getByLabel('제목',{exact:true}).isEditable(),true);
    for(const state of ['empty','error','loading']){await page.goto(p.url+'?state='+state);await page.getByText(state==='empty'?'등록된 작업이 없습니다. 새 작업을 제출할 수 있습니다.':state==='loading'?'큐를 불러오는 중…':/VAXPORT에 연결하지 못했습니다/).waitFor();}
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await new Promise(r=>p.server.close(r));}
});
