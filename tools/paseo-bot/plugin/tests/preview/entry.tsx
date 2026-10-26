// Offline rendering of the production view. No SSH or production data.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BotView } from '../../client/screen';
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const colors = dark ? { foreground:'#f1f1f1', foregroundMuted:'#b4b4b4', surface0:'#191919', surface1:'#222222',surface2:'#303030', border:'#555555',accent:'#8cb8ff',accentForeground:'#10284b' } : { foreground:'#202020',foregroundMuted:'#626262',surface0:'#ffffff',surface1:'#f7f7f7',surface2:'#eeeeee',border:'#bdbdbd',accent:'#185bbc',accentForeground:'#ffffff' };
const mode = new URLSearchParams(location.search).get('state');
const sample = { host:'VAXPORT',healthy:true,lastTickAt:1793000000,acceptsTasks:true,queue:{queued:1,passed:1,blocked:1},total:3,offset:0,
  projects:[{id:'fixture-project',enabled:true}], tasks:[
    {id:'fixture-queue',title:'사이드바 작업 목록 한글 표시 수정',project:'fixture-project',state:'queued',updatedAt:0},
    {id:'fixture-passed',title:'큐 상태와 작업 결과 연결 확인',project:'fixture-project',state:'passed',updatedAt:0},
    {id:'fixture-blocked',title:'배포 환경 설정 확인',project:'fixture-project',state:'blocked',updatedAt:0},
  ] };
function App() {
  const [selected,select] = useState(''), [data,setData] = useState(mode==='empty'?{...sample,tasks:[],total:0,queue:{}}:sample);
  const [width,setWidth]=useState(innerWidth);
  React.useEffect(()=>{ const resize=()=>setWidth(innerWidth); addEventListener('resize',resize); return()=>removeEventListener('resize',resize); },[]);
  React.useEffect(()=>{
    if(mode==='form') document.querySelector<HTMLElement>('[aria-label="새 작업"]')?.click();
    if(mode==='detail') document.querySelector<HTMLElement>('[aria-label="큐 상태와 작업 결과 연결 확인, 검증 통과"]')?.click();
  },[]);
  return <BotView theme={{colors} as any} compact={width<768} data={mode==='loading'?undefined:data} loading={mode==='loading'} error={mode==='error'} refresh={()=>{}} offset={0} setOffset={()=>{}}
    selected={selected} select={select} detail={selected?{id:selected,project:'fixture-project',state:selected==='fixture-blocked'?'blocked':'passed',summary:'한글 화면과 큐 결과를 확인했습니다.',reason:selected==='fixture-blocked'?'프로젝트 설정을 확인하세요.':undefined,deployment:'not-run',evidence:{gates:[{exitCode:0}]}}:undefined}
    submit={async task=>{ if(mode==='submit-failure')throw Error('fixture'); setData(d=>({...d,total:d.total+1,tasks:[{...task,state:'queued',updatedAt:0},...d.tasks]})); }} />;
}
createRoot(document.getElementById('root')!).render(<App/>);
