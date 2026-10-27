import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {preview} from './preview.mjs';
import {chrome} from './browser.mjs';
const out=path.resolve(process.argv[2]||'artifacts/screenshots');await mkdir(out,{recursive:true});
const fixture=await preview();let browser;const records=[];
try{
  browser=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});
  for(const scheme of ['light','dark'])for(const width of [375,768,1440])for(const state of ['conversation','writing','kanban','confirm','detail','detail-daily','retry','empty','loading','error','filtered-empty','stuck']){
    const page=await browser.newPage({viewport:{width,height:1000},colorScheme:scheme});
    await page.goto(fixture.url+'?state='+(['retry','filtered-empty'].includes(state)?'kanban':state));
    await page.getByText('Paseo 봇',{exact:true}).first().waitFor();
    if(state==='retry')await page.getByRole('button',{name:'재시도',exact:true}).click();
    if(state==='filtered-empty')await page.getByLabel('작업 검색',{exact:true}).fill('해당 결과가 없는 검색');
    if(state==='confirm')await page.getByTestId('plan-card').scrollIntoViewIfNeeded();
    if(state==='detail')await page.getByRole('dialog',{name:'큐 상태 표시 수정',exact:true}).waitFor();
    if(state==='detail-daily')await page.getByRole('dialog',{name:'모바일 입력 흐름 개선',exact:true}).waitFor();
    await page.waitForTimeout(650);
    const file=`${state}-${width}-${scheme}.png`;await page.screenshot({path:path.join(out,file),fullPage:false});
    records.push({file,width,scheme,state,fixture:true,rootOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});
    await page.close();
  }
  await writeFile(path.join(out,'screenshots.json'),JSON.stringify({generatedAt:new Date().toISOString(),note:'Offline fixture, production React Native components. Host chrome is a web test stand-in; live app evidence is separate.',screenshots:records},null,2));
  if(records.some(r=>r.rootOverflow))throw Error('Page overflow');
  console.log(`${records.length} screenshots verified: ${out}`);
}finally{await browser?.close();await new Promise(r=>fixture.server.close(r));}
