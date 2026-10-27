import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BotView} from '../../client/screen';
import {snapshotSchema,syncInput,type Snapshot,type TaskRow,type Action} from '../../shared/contracts';
import {laneOf} from '../../shared/model';
import {PreviewToast} from './ui';
const mode=new URLSearchParams(location.search).get('state');
const dark=matchMedia('(prefers-color-scheme:dark)').matches;
const colors=dark?{foreground:'#f1f3f2',foregroundMuted:'#a6ada9',surface0:'#151918',surface1:'#1c211f',surface2:'#2a302d',border:'#3e4943',accent:'#7ed6aa',accentForeground:'#102c1e',statusSuccess:'#7ed6aa',statusWarning:'#edc278',statusDanger:'#f7a5a5'}:{foreground:'#202923',foregroundMuted:'#5e6862',surface0:'#fbfcfb',surface1:'#ffffff',surface2:'#eef2ef',border:'#ccd5ce',accent:'#216b49',accentForeground:'#ffffff',statusSuccess:'#216b49',statusWarning:'#865e15',statusDanger:'#b93232'};
const now=Date.now()/1000;
const rows=['queued','running','blocked','passed','failed'].map((state,i)=>({id:`fixture-${i}`,state,title:['로그인 오류 재현','모바일 입력 흐름 개선','배포 환경 확인','큐 상태 표시 수정','테스트 실패 원인 분석'][i],project:i%2?'paseobility':'buddhist_sutra',createdAt:now-(i+1)*430,updatedAt:now-i*100,machine:i%2?'MAC_HOME':'VAX_COM',profile:i%2?'coding-hard':'gpt-task',model:['sol','claude','sol','go','claude'][i],stage:state==='running'?'work':state==='passed'?'postflight':state==='failed'?'review':'preflight',requester:i===1?'grok':'gui',conversationId:'session-fixture',retryOf:'',prUrl:i===3?'https://github.com/wilgon456/Paseobility/pull/34':''}));
const sample=snapshotSchema.parse({host:'VAXPORT',healthy:true,lastTickAt:now-8,acceptsTasks:true,queue:{queued:1,running:1,blocked:1,passed:1,failed:1},total:5,filtered:5,offset:0,tasks:rows,
  projects:[{id:'paseobility',enabled:true,machines:['MAC_HOME','VAX_COM']},{id:'buddhist_sutra',enabled:true,machines:['VAX_COM']},{id:'disabled-project',enabled:false,machines:[]}],configured:true,managerHealthy:true,lastSyncAt:now,
  conversations:[{id:'session-fixture',title:'로그인 오류와 모바일 입력 개선',agentId:'fixture-gui-manager',status:'idle',createdAt:now-3600}],
  messages:[{id:'m-user',role:'user',text:'로그인할 때 입력 내용이 사라지는 문제를 고쳐 줘.',time:now-280,payload:{}},{id:'m-bot',role:'assistant',text:'어느 프로젝트에서 발생하나요? 재현 조건도 알려주시면 수정 범위를 정리하겠습니다.',time:now-270,payload:{}},{id:'m-user2',role:'user',text:'paseobility야. 모바일에서 확인했어. 재현하고 입력 흐름을 개선해 줘.',time:now-240,payload:{}},{id:'m-bot2',role:'assistant',text:'문제 재현과 입력 흐름 개선으로 나누겠습니다. 기존 입력 동작을 확인하고 회귀 테스트를 함께 추가하겠습니다.',time:now-220,payload:{}}],
  plans:[{id:'plan-fixture',digest:'a'.repeat(64),state:'pending',messageId:'m-user2',tasks:[{project:'paseobility',title:'모바일 입력 상태 보존',prompt:'모바일 로그인 화면에서 입력 상태가 사라지는 문제를 재현하고 수정한다. 회귀 테스트를 추가한다. 커밋·배포는 하지 않는다.',kind:'gpt',model:'auto',effort:'auto',resolvedModel:'sol',modelReason:'일반 작업 기본 모델'}]}]});
function App(){
  const [source,setSource]=useState<Snapshot>(['empty','first'].includes(mode??'')?{...sample,tasks:[],total:0,filtered:0,queue:{},messages:[],plans:[]}:mode==='long-board'?{...sample,tasks:Array.from({length:30},(_,i)=>({...rows[2],id:'long-'+i,title:'검토 작업 '+i})),filtered:30,total:30}:sample);
  const [filters,setFilters]=useState(()=>syncInput.parse({})),[selected,select]=useState<TaskRow|null>(null),[conversation,setConversation]=useState(mode==='first'?'':'session-fixture');
  const [width,setWidth]=useState(innerWidth);
  React.useEffect(()=>{const r=()=>setWidth(innerWidth);addEventListener('resize',r);return()=>removeEventListener('resize',r);},[]);
  React.useEffect(()=>{if(mode==='detail')select(rows[3]);if(mode==='kanban'||mode==='long-board')setTimeout(()=>document.querySelector<HTMLElement>('[aria-label="작업 보기"]')?.click(),80);},[]);
  let tasks=source.tasks.filter(r=>(!filters.query||(r.title+r.id).toLowerCase().includes(filters.query.toLowerCase()))&&(!filters.group||laneOf(r.state)===filters.group)&&(!filters.project||r.project===filters.project)&&(!filters.machine||r.machine===filters.machine)&&(!filters.requester||r.requester===filters.requester));
  if(filters.sort==='oldest')tasks=[...tasks].reverse();if(filters.sort==='title')tasks=[...tasks].sort((a,b)=>a.title.localeCompare(b.title));
  const data={...source,tasks,filtered:tasks.length};
  async function action(a:Action){
    (window as any).__actions??=[];(window as any).__actions.push(a);
    if(mode==='send-failure'&&a.action==='send')throw Error('fixture');
    if(a.action==='create'){setConversation(a.requestId);setSource(s=>({...s,conversations:[{id:a.requestId,title:'새 대화',agentId:'fixture-new',status:'idle',createdAt:now},...s.conversations],messages:[],plans:[]}));return {conversationId:a.requestId};}
    if(a.action==='start'){setConversation(a.requestId);setSource(s=>({...s,messages:[{id:a.messageId,role:'user',text:a.text,time:now,payload:{}}]}));return {conversationId:a.requestId};}
    if(a.action==='send'){setSource(s=>({...s,messages:[...s.messages,{id:a.messageId,role:'user',text:a.text,time:now,payload:{}}]}));return {accepted:true};}
    if(a.action==='approve'){setSource(s=>({...s,plans:s.plans.map(p=>({...p,state:'approved'})),tasks:[{...rows[0],id:'admitted-fixture',title:'모바일 입력 상태 보존'},...s.tasks],total:s.total+1}));return {taskIds:['admitted-fixture']};}
    if(a.action==='reject')setSource(s=>({...s,plans:[]}));return {accepted:true};
  }
  const detail=selected?{id:selected.id,state:selected.state,project:selected.project,stage:selected.stage,summary:'입력 상태를 보존하도록 수정하고 회귀 테스트를 통과했습니다.',deployment:'not-run',evidence:{preflight:{summary:'기준 브랜치와 변경 상태 확인'},work:{summary:'입력 상태 보존 처리'},review:{summary:'독립 검토와 회귀 테스트 통과',gates:[{command:'npm test',exitCode:0}]},postflight:{summary:'변경 파일 지문 일치'}},runs:[{stage:'work',profile:'coding-hard',model:'fixture-model'}]}:undefined;
  return <><BotView theme={{colors} as any} compact={width<768} data={mode==='loading'?undefined:data} loading={mode==='loading'} error={mode==='error'} refreshing={false} filters={filters} setFilters={f=>setFilters(old=>({...old,...f}))} conversation={conversation} setConversation={setConversation} action={action} pending={false} refresh={()=>{}} selected={selected} select={select} detail={detail} detailLoading={false} detailError={false}/><PreviewToast/></>;
}
document.documentElement.style.cssText=`--ink:${colors.foreground};--surface:${colors.surface1};--border:${colors.border}`;
createRoot(document.getElementById('root')!).render(<App/>);
