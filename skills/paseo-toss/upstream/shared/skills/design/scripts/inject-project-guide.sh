#!/usr/bin/env bash
#
# 디자인 가이드(토큰·하드 규칙·아이콘·캐리어 문서)를 프로젝트에 심는다.
# 절차 정본은 ../references/project-guide.md, 호출자는 new-miniapp skill
# 5-B(스캐폴드 후처리) — SKILL.md는 이 스크립트를 한 줄로 호출만 한다.
#
# 사용: inject-project-guide.sh <proj-dir> [--tds | --existing-ds <이름>] [--no-tossface] [--src <assets-dir>]
#
# --tds: 스캐폴드가 TDS 변형일 때 — CSS·아이콘·entry를 건너뛰고 다이제스트의
#   `아이콘:` 두 줄만 TDS 문구로 바꾼다.
# --existing-ds <이름>: 기성 디자인 시스템(존중 모드) 프로젝트 — 같은 건너뜀에 더해
#   다이제스트의 토큰 줄을 "프로젝트 디자인 시스템의 토큰·컴포넌트를 쓴다"로 바꾸고
#   1-3·1-9 계열 줄을 권장으로 내린다(1-2 Tossface는 다이제스트에서 이미 권장). 이름은 보고용이다(요약에 ds=<이름>).
#   둘 다 없으면 package.json 의존성(@toss/tds*·@mui/*·@chakra-ui/*·antd·
#   @mantine/*·tailwindcss·@radix-ui/*)·components.json·tailwind.config.*로
#   직접 감지해 같은 경로를 탄다(요약에 ds=<이름>(auto)). 라이브러리가 없어도
#   src/ 아래 .css/.scss의 `:root` 커스텀 프로퍼티가 서로 다른 이름으로 8개
#   이상이면 자체 토큰 체계로 보고 ds=자체 토큰(auto)로 같은 경로를 탄다.
#
# fail-soft 계약: set -e 없음 — 항목마다 test -f/grep로 멱등 가드를 걸고
# 개별 실패가 나머지를 죽이지 않는다. 항상 exit 0으로 끝나고, 마지막 줄
# `5-B:<요약>`이 항목별 결과(new|skip|FAIL 등)를 한 줄로 보고한다.

PROJ=""
SRC=""
TDS=0
EXDS=0
DSNAME=""
NO_TOSSFACE=0
MV=3

while [ $# -gt 0 ]; do
  case "$1" in
    --tds)
      TDS=1
      shift
      ;;
    --existing-ds)
      EXDS=1
      DSNAME="${2:-}"
      shift 2
      ;;
    --no-tossface)
      NO_TOSSFACE=1
      shift
      ;;
    --src)
      SRC="${2:-}"
      shift 2
      ;;
    *)
      if [ -z "$PROJ" ]; then PROJ="$1"; fi
      shift
      ;;
  esac
done

# 경로를 빠뜨린 호출(`--existing-ds <이름>`만 준 경우)도 현재 디렉터리로 처리한다.
[ -n "$PROJ" ] || PROJ="."
if [ ! -d "$PROJ" ]; then
  echo "5-B:proj=missing($PROJ)"
  exit 0
fi

# 자산 디렉터리(SRC)는 자동 감지가 정본 tokens.css와 대조하므로 먼저 푼다.
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
MKR='ait:design-guide'
for C in "$SRC" "$SELF_DIR/../assets/project" "${CLAUDE_PLUGIN_ROOT:-}/shared/skills/design/assets/project" "${CLAUDE_PLUGIN_ROOT:-}/skills/design/assets/project"; do
  if [ -n "$C" ] && [ -f "$C/memory-digest.md" ]; then SRC="$C"; break; fi
  SRC=""
done

# 플래그가 없으면 기성 디자인 시스템을 직접 감지한다 — 호출자가 --existing-ds를
# 빠뜨려도 기본 토큰·전역 CSS가 기성 시스템 위에 얹히지 않게 하는 것이 목적이다.
# 감지 순서: 의존성 → components.json → tailwind → radix → 자체 :root 토큰.
#
# 자체 :root 토큰 규칙(라이브러리 없이 CSS 변수로 만든 체계):
# - src/ 아래(node_modules·dist·점 디렉터리 제외) .css/.scss의 `:root { }` 블록에서
#   서로 다른 `--이름`을 합쳐 센다. 임계값은 8개 — 평범한 프로젝트가 `--vh`,
#   `--primary` 같은 변수를 두세 개 쓰는 수준은 넘기고, 색·간격·글자 스케일을
#   변수로 정의한 체계(보통 십수 개 이상)는 잡는 보수적 경계다. 오탐보다 미탐이
#   낫다: 미탐이면 기존 일반 경로로 가이드가 들어갈 뿐이고, 오탐이면 기본 토큰을
#   못 받는다.
# - 우리가 넣은 src/styles/tokens.css·base.css는 세지 않는다. 정본과 바이트가
#   같거나, AGENTS.md에 ait:design-guide 마커가 이미 있으면 사용자가 고쳐 쓴
#   사본도 제외한다. 한 번 가이드가 들어간 프로젝트가 다음 실행에서 존중 모드로
#   뒤집히면 안 된다.
# - 반대로 이전 실행이 존중 모드였으면(AGENTS.md에 존중 모드 다이제스트 변형본이
#   있으면) 플래그 없이 다시 불러도 존중 모드를 유지한다 — 마커 때문에 사용자
#   tokens.css가 집계에서 빠져 일반 경로로 떨어지는 것을 막는다.
# - 탐색 비용 상한: 깊이 4, 방문 디렉터리 200, css/scss 파일 100개, 파일당 512KB.
AUTO=""
if [ "$TDS" = 0 ] && [ "$EXDS" = 0 ]; then
  read -r -d '' DETECT_JS <<'AITJS'
const fs=require('node:fs'),path=require('node:path');
const d=process.argv[1],canon=process.argv[2]||'';
let p={};try{p=JSON.parse(fs.readFileSync(path.join(d,'package.json'),'utf8'))}catch{}
const n=Object.keys({...p.dependencies,...p.devDependencies});
const has=(f)=>n.some(f);
const t=[[x=>x.startsWith('@toss/tds'),'TDS'],[x=>x.startsWith('@mui/'),'MUI'],[x=>x.startsWith('@chakra-ui/'),'Chakra UI'],[x=>x==='antd','Ant Design'],[x=>x.startsWith('@mantine/'),'Mantine']];
for(const [f,name] of t){if(has(f)){console.log(name);process.exit(0)}}
if(fs.existsSync(path.join(d,'components.json'))){console.log('shadcn/ui');process.exit(0)}
const tw=fs.readdirSync(d).some(f=>/^tailwind\.config\./.test(f));
if(tw||has(x=>x==='tailwindcss')){console.log('Tailwind');process.exit(0)}
if(has(x=>x.startsWith('@radix-ui/'))){console.log('Radix');process.exit(0)}
const MIN=8,MAXDEPTH=4,MAXDIRS=200,MAXFILES=100,MAXBYTES=512*1024;
const read=(f)=>{try{return fs.readFileSync(f,'utf8')}catch{return null}};
let marked=false,ag='';
try{ag=fs.readFileSync(path.join(d,'AGENTS.md'),'utf8');marked=/ait:design-guide v\d/.test(ag)}catch{}
if(marked&&ag.includes('토큰 사용: 프로젝트 디자인 시스템의 토큰')){console.log('기존 디자인 시스템');process.exit(0)}
const ours=(file)=>{
  const rel=path.relative(d,file).split(path.sep).join('/');
  if(rel!=='src/styles/tokens.css'&&rel!=='src/styles/base.css')return false;
  if(marked)return true;
  const c=canon&&read(path.join(canon,path.basename(file)));
  return c!==null&&c!==''&&c===read(file);
};
const names=new Set();
let dirs=0,files=0;
const walk=(dir,depth)=>{
  if(depth>MAXDEPTH||dirs>=MAXDIRS||files>=MAXFILES)return;
  dirs++;
  let ents=[];try{ents=fs.readdirSync(dir,{withFileTypes:true})}catch{return}
  for(const e of ents){
    if(files>=MAXFILES)return;
    const f=path.join(dir,e.name);
    if(e.isDirectory()){
      if(e.name==='node_modules'||e.name==='dist'||e.name.startsWith('.'))continue;
      walk(f,depth+1);
    }else if(e.isFile()&&/\.(css|scss)$/.test(e.name)){
      files++;
      try{if(fs.statSync(f).size>MAXBYTES)continue}catch{continue}
      if(ours(f))continue;
      const src=read(f);if(src===null)continue;
      const css=src.replace(/\/\*[\s\S]*?\*\//g,'');
      for(const m of css.matchAll(/:root\b[^{}]*\{([^{}]*)\}/g)){
        for(const q of m[1].matchAll(/(?:^|[;\s])(--[\w-]+)\s*:/g))names.add(q[1]);
      }
    }
  }
};
walk(path.join(d,'src'),0);
if(names.size>=MIN){console.log('자체 토큰');process.exit(0)}
AITJS
  AUTO="$(node -e "$DETECT_JS" -- "$PROJ" "$SRC" 2>/dev/null)"
  if [ -n "$AUTO" ]; then EXDS=1; DSNAME="$AUTO"; fi
fi

R=""; T=""; T2=""
if [ -z "$SRC" ]; then R="$R assets=UNRESOLVED"; else
  DG="$SRC/memory-digest.md"
  if [ "$EXDS" = 1 ]; then
    T="$(mktemp "${TMPDIR:-/tmp}/ait.XXXXXX")" && awk '/^토큰 사용:/{print "토큰 사용: 프로젝트 디자인 시스템의 토큰·컴포넌트를 쓴다."; skip=1; next} skip&&/^$/{skip=0} skip{next} /^권장: 이모지는 Tossface/{print "권장: 이모지 서체는 기성 디자인 시스템이 정한 것을 우선한다(Tossface 배선은 이 프로젝트에 없다)."; next} /^- 한글은 `word-break: keep-all`/{print $0 " (권장)"; next} /^- 꺾쇠·화살표는 텍스트 글리프/{print $0 " (권장 — 프로젝트의 아이콘 체계를 쓴다)"; next} /^아이콘: React/{print "아이콘은 프로젝트 디자인 시스템이 주는 것을 쓴다(이 가이드의 아이콘 파일은 이 프로젝트에 없다)."; next} /^아이콘: vanilla/{next} {print}' "$DG" > "$T" && DG="$T"
  elif [ "$TDS" = 1 ]; then
    T="$(mktemp "${TMPDIR:-/tmp}/ait.XXXXXX")" && awk '/^아이콘: React/{print "이 프로젝트는 TDS 기반이다 — 색·크기·아이콘은 TDS 컴포넌트가 주는 것을 쓴다(위 토큰 목록과 아이콘 파일 경로는 이 프로젝트에 없다)."; next} /^아이콘: vanilla/{print "1층 하드 규칙은 플랫폼 제약이라 그대로 적용된다 — 꺾쇠·닫기·검색은 TDS 아이콘 컴포넌트로 충족하고, 텍스트 글리프로 대체하는 것은 여전히 금지다."; next} {print}' "$DG" > "$T" && DG="$T"
  fi
  mkdir -p "$PROJ/docs" 2>/dev/null
  if [ -f "$PROJ/docs/design-guide.md" ]; then R="$R guide=skip"
  elif cp "$SRC/design-guide.md" "$PROJ/docs/design-guide.md" 2>/dev/null; then R="$R guide=new"
  else R="$R guide=FAIL"; fi
  if [ "$EXDS" = 1 ]; then R="$R ds=${DSNAME:-existing}${AUTO:+(auto)} css=ds-skip icons=ds-skip entry=ds-skip"
  elif [ "$TDS" = 1 ]; then R="$R css=tds-skip icons=tds-skip entry=tds-skip"; else
    mkdir -p "$PROJ/src/styles" 2>/dev/null
    if [ -f "$PROJ/src/styles/tokens.css" ]; then R="$R tokens=skip"
    elif cp "$SRC/tokens.css" "$PROJ/src/styles/tokens.css" 2>/dev/null; then R="$R tokens=new"
    else R="$R tokens=FAIL"; fi
    if [ -f "$PROJ/src/styles/base.css" ]; then R="$R base=skip"
    elif cp "$SRC/base.css" "$PROJ/src/styles/base.css" 2>/dev/null; then R="$R base=new"
    else R="$R base=FAIL"; fi
    if [ "$NO_TOSSFACE" = 1 ] && grep -q 'tossface' "$PROJ/src/styles/base.css" 2>/dev/null; then
      sed -i.aitbak -e '/tossface\.css/d' -e 's/"Tossface", -apple-system/-apple-system/' "$PROJ/src/styles/base.css" && rm -f "$PROJ/src/styles/base.css.aitbak" && R="$R tossface=off"
    fi
    if node -e "const p=require('node:path').resolve('$PROJ','package.json');process.exit(require(p).dependencies?.react?0:1)" 2>/dev/null; then
      mkdir -p "$PROJ/src/components" 2>/dev/null
      if [ -f "$PROJ/src/components/icons.tsx" ]; then R="$R icons=skip"
      elif cp "$SRC/icons.tsx" "$PROJ/src/components/icons.tsx" 2>/dev/null; then R="$R icons=new"
      else R="$R icons=FAIL"; fi
    else
      mkdir -p "$PROJ/src/assets/icons" 2>/dev/null
      if [ -f "$PROJ/src/assets/icons/close.svg" ]; then R="$R icons=skip"
      elif cp -n "$SRC/icons/"*.svg "$PROJ/src/assets/icons/" 2>/dev/null; then R="$R icons=new"
      else R="$R icons=FAIL"; fi
    fi
    E=""
    for C in src/index.css src/main.tsx src/main.ts src/index.tsx src/index.ts index.tsx index.ts; do
      if [ -f "$PROJ/$C" ]; then E="$PROJ/$C"; break; fi
    done
    if { [ -n "$E" ] && grep -q 'styles/base.css' "$E"; } || grep -qs 'styles/base.css' "$PROJ/index.html"; then R="$R entry=skip"
    elif [ -n "$E" ] && [ "${E%index.css}" != "$E" ]; then
      T2="$(mktemp "${TMPDIR:-/tmp}/ait.XXXXXX")" && printf '%s\n' "@import './styles/base.css';" | cat - "$E" > "$T2" && mv "$T2" "$E" && R="$R entry=index.css" || R="$R entry=FAIL"
    elif [ -n "$E" ] && { [ -f "$PROJ/src/vite-env.d.ts" ] || grep -q '"vite/client"' "$PROJ"/tsconfig*.json 2>/dev/null; }; then
      T2="$(mktemp "${TMPDIR:-/tmp}/ait.XXXXXX")" && printf '%s\n' "import './styles/base.css';" | cat - "$E" > "$T2" && mv "$T2" "$E" && R="$R entry=js" || R="$R entry=FAIL"
    elif [ -f "$PROJ/index.html" ] && ! grep -q 'styles/base.css' "$PROJ/index.html"; then
      T2="$(mktemp "${TMPDIR:-/tmp}/ait.XXXXXX")" && awk '/<\/head>/&&!d{print "    <link rel=\"stylesheet\" href=\"/src/styles/base.css\" />";d=1}{print}' "$PROJ/index.html" > "$T2" && mv "$T2" "$PROJ/index.html" && R="$R entry=index.html" || R="$R entry=FAIL"
    else R="$R entry=skip"; fi
  fi
  AG="$PROJ/AGENTS.md"; MK="$(grep -o "$MKR v[0-9]*" "$AG" 2>/dev/null | head -1)"
  if [ -n "$MK" ]; then R="$R agents=skip($MK)"
  elif { [ -s "$AG" ] && printf '\n'; printf '<!-- %s v%s -->\n' "$MKR" "$MV"; cat "$DG"; printf '<!-- /%s -->\n' "$MKR"; } >> "$AG" 2>/dev/null; then R="$R agents=new"
  else R="$R agents=FAIL"; fi
  CL="$PROJ/CLAUDE.md"
  if grep -q "$MKR v" "$CL" 2>/dev/null; then R="$R claude=skip"
  elif { [ -s "$CL" ] && printf '\n'; printf '<!-- %s v%s -->\n@AGENTS.md\n<!-- /%s -->\n' "$MKR" "$MV" "$MKR"; } >> "$CL" 2>/dev/null; then R="$R claude=new"
  else R="$R claude=FAIL"; fi
  rm -f "$T" "$T2" 2>/dev/null
fi
echo "5-B:$R"
exit 0
