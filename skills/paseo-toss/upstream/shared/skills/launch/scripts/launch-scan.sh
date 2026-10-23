#!/usr/bin/env bash
#
# 출시 전 점검(체크리스트) 후보를 프로젝트 파일에서 읽기 전용으로 긁어 모은다.
# 호출자는 launch skill의 SKILL.md 2단계 — SKILL.md는 이 스크립트를 한 줄로 호출만 한다.
#
# 사용: launch-scan.sh [<proj-dir>]   (기본 .)
#
# 규칙 4개 (id: 대상):
#   viewport-zoom    루트 *.html·public/**/*.html의 viewport meta에 확대·축소 제한이 없다
#   dark-theme       다크 모드 스타일(prefers-color-scheme: dark, color-scheme: … dark,
#                    meta color-scheme)이 있다
#   cors-any-origin  js/ts/py 코드가 모든 origin을 허용한다
#   client-ai-key    클라이언트 코드(루트 src/·public/·*.html)에서 AI 키가 새거나 샌다
#                    (a) AI 키 환경변수 참조 (b) 루트 .env* 정의 (c) AI API 직접 호출
#                    (d) 키 형태 문자열 — 이것만 dist/(빌드 산출물)도 본다
#
# 출력은 판정이 아니라 후보다. 한 줄이 후보 하나이고, 진짜 위반인지는 호출자가 해당 파일을
# 열어 판단한다. 형식:
#   [<규칙 id>] <proj 기준 상대경로>:<줄> <짧은 설명>
# 같은 (규칙, 파일, 줄, 하위 검사)는 한 줄만 찍는다. 마지막 줄은 항상 요약 한 줄이다:
#   launch-scan:viewport-zoom=<n|skip(no-html)> dark-theme=<n> cors-any-origin=<n> client-ai-key=<n> total=<n>
# viewport-zoom은 대상 HTML이 하나도 없으면 skip(no-html)이고, total에는 skip이 들어가지 않는다.
#
# 규칙 4는 키 값을 출력하지 않는다. 찍는 것은 고정 설명과 변수 이름·API 호스트·키 접두사
# 라벨뿐이고, 매치된 원문은 파이프 안에서 버린다.
#
# 제외 디렉터리(어느 깊이든): node_modules .git dist build .wrangler .next .turbo .vercel
# .output coverage out .cache. 예외는 규칙 4(d)가 dist/를 추가로 보는 것 하나다.
#
# fail-soft 계약: set -e 없음 — 규칙마다 따로 돌아서 하나가 실패해도 나머지는 돈다. 항상
# exit 0으로 끝난다. 프로젝트 디렉터리가 없으면 `launch-scan:proj=missing(<경로>)` 한 줄만
# 찍고 끝난다.
# 읽기 전용: 프로젝트 안에 아무것도 쓰지 않는다(임시 파일도 만들지 않는다).
# 이식성: macOS bash 3.2 + BSD grep/awk와 Linux GNU 도구 양쪽에서 돈다 — 연관 배열·mapfile·
# ${v,,}·grep -P·sed -i를 쓰지 않고, grep은 전부 LC_ALL=C로 돌린다.

export LC_ALL=C
unset CDPATH GREP_OPTIONS
# 호출 환경이 grep·find 등을 셸 함수로 덮어 뒀으면 걷어 내고 실제 바이너리를 쓴다.
unset -f grep find awk sort cut 2>/dev/null

PROJ="${1:-.}"
# 이후 모든 경로는 프로젝트 루트 기준 상대경로다. cd하면 프로젝트 디렉터리 이름이
# --exclude-dir 패턴(예: out)에 걸려 통째로 건너뛰는 일도 없다.
if [ ! -d "$PROJ" ] || ! cd -- "$PROJ" 2>/dev/null; then
  echo "launch-scan:proj=missing($PROJ)"
  exit 0
fi

TAB=$'\t'

# ---------------------------------------------------------------------------
# 설명 템플릿 ({}는 하위 검사가 넘긴 detail로 치환된다)
# ---------------------------------------------------------------------------
D1A='viewport에 확대·축소 제한(user-scalable=no 또는 maximum-scale=1)이 없다. 비게임 체크리스트 항목'
D1B='viewport meta가 없다(확대·축소 제한도 없다). 비게임 체크리스트 항목'
D2='다크 모드 스타일이 있다. 체크리스트는 라이트 모드 구현을 요구한다'
D3='CORS가 모든 origin을 허용한다. 허용할 origin은 docs MCP의 서버 API 문서 표로 확인한다'
D4A='클라이언트 코드가 AI 키 환경변수({})를 읽는다. 빌드하면 번들에 들어간다'
D4B='클라이언트에 노출되는 AI 키 변수({}). 값은 출력하지 않는다'
D4C='클라이언트 코드가 AI API({})를 직접 호출한다. 키는 서버에 둔다'
D4D='키 형태 문자열({})이 있다. 값은 출력하지 않는다'

# ---------------------------------------------------------------------------
# grep 인자: 제외 디렉터리 · 확장자 · 클라이언트 대상
# ---------------------------------------------------------------------------
EXCL=()      # 모든 규칙
EXCL_DIST=() # 규칙 4(d)의 dist/ 스캔 — dist 자신은 빼고 나머지만 제외
FIND_PRUNE=('(')
for d in node_modules .git dist build .wrangler .next .turbo .vercel .output coverage out .cache; do
  EXCL+=("--exclude-dir=$d")
  if [ "$d" != dist ]; then EXCL_DIST+=("--exclude-dir=$d"); fi
  if [ "${#FIND_PRUNE[@]}" -gt 1 ]; then FIND_PRUNE+=(-o); fi
  FIND_PRUNE+=(-name "$d")
done
FIND_PRUNE+=(')' -prune -o)

INC_STYLE=()  # 규칙 2
for e in css scss sass less html js jsx ts tsx mjs cjs vue svelte; do INC_STYLE+=("--include=*.$e"); done
INC_CORS=()   # 규칙 3
for e in js jsx ts tsx mjs cjs py; do INC_CORS+=("--include=*.$e"); done
INC_CLIENT=() # 규칙 4 — src/·public/ 안에서 보는 파일
for e in js jsx ts tsx mjs cjs mts cts vue svelte astro html htm json; do INC_CLIENT+=("--include=*.$e"); done
INC_DIST=()   # 규칙 4(d)의 dist/
for e in js mjs cjs html htm json; do INC_DIST+=("--include=*.$e"); done

# 클라이언트 코드 = 루트 src/ · public/ + 루트 *.html (worker/ server/ functions/ api/ 등은 아니다)
CLIENT_DIRS=()
if [ -d src ]; then CLIENT_DIRS+=(src); fi
if [ -d public ]; then CLIENT_DIRS+=(public); fi

# 규칙 1의 대상: 루트 *.html + public/**/*.html (줄바꿈으로 구분한 목록)
ROOT_HTML=()
HTML_FILES=""
for f in ./*.html; do
  if [ -f "$f" ]; then
    ROOT_HTML+=("$f")
    HTML_FILES="$HTML_FILES$f"$'\n'
  fi
done
if [ -d public ]; then
  PUB_HTML="$(find public "${FIND_PRUNE[@]}" -type f -name '*.html' -print 2>/dev/null | sort)"
  if [ -n "$PUB_HTML" ]; then HTML_FILES="$HTML_FILES$PUB_HTML"$'\n'; fi
fi

# ---------------------------------------------------------------------------
# 패턴 (ERE). \s \w \b 대신 POSIX 클래스만 쓴다 — BSD·GNU 양쪽에서 같게 읽힌다.
# 리터럴 특수문자는 이스케이프 대신 대괄호([.] [*] [(] [)] [[] []])로 쓴다.
# ---------------------------------------------------------------------------
SQ="'"
Q="[\"${SQ}\`]" # 따옴표 3종(" ' `) 중 하나

# 규칙 2 (grep -i)
P_DARK='prefers-color-scheme[[:space:]]*:[[:space:]]*dark'
P_DARK="$P_DARK|color-scheme[[:space:]]*:[[:space:]]*[^;}]*dark"
P_DARK="$P_DARK|<meta[^>]*(color-scheme[^>]*dark|dark[^>]*color-scheme)"

# 규칙 3 (grep -i): 헤더 값 '*' · cors 옵션 origin: '*' · 요청 origin을 그대로 돌려주는 origin: true ·
# 인자 없는 cors() · Python allow_origins=["*"]
P_CORS="access-control-allow-origin${Q}?[[:space:]]*[]]?[[:space:]]*[,:=][[:space:]]*${Q}[*]${Q}"
P_CORS="$P_CORS|(^|[^[:alnum:]_-])origin${Q}?[[:space:]]*:[[:space:]]*${Q}[*]${Q}"
P_CORS="$P_CORS|(^|[^[:alnum:]_-])origin${Q}?[[:space:]]*:[[:space:]]*true([^[:alnum:]_]|$)"
P_CORS="$P_CORS|(^|[^[:alnum:]_.])cors[[:space:]]*[(][[:space:]]*[)]"
P_CORS="$P_CORS|allow_origins[[:space:]]*=[[:space:]]*[[][[:space:]]*${Q}[*]${Q}"

# 규칙 4
P_ENVREF='(^|[^A-Za-z0-9_])(VITE_|REACT_APP_|NEXT_PUBLIC_|EXPO_PUBLIC_)[A-Za-z0-9_]+'
P_HOST='api[.]openai[.]com|api[.]anthropic[.]com|generativelanguage[.]googleapis[.]com'
P_HOST="$P_HOST|api[.]mistral[.]ai|api[.]cohere[.]com|api[.]cohere[.]ai|api[.]groq[.]com"
P_HOST="$P_HOST|api[.]deepseek[.]com|api[.]upstage[.]ai|clovastudio"
# sk-: 접두사 없는 키는 영숫자 20자 이상. sk-proj-/svcacct-/admin-/ant-…- 키는 본문에
# _ 와 -가 섞이므로(첫 20자 안에 나올 확률이 절반 가까이 된다) 이 변형에만 둘을 허용한다.
P_SK='(^|[^A-Za-z0-9])sk-([A-Za-z0-9]{20,}|(proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|ant-[a-z0-9]+-[A-Za-z0-9_-]{20,})'
P_AIZA='(^|[^A-Za-z0-9])AIza[0-9A-Za-z_-]{35}([^0-9A-Za-z_-]|$)'

# 규칙 4 변수 이름 판정(awk): 클라이언트 노출 접두사 + KEY|TOKEN|SECRET + AI 제공사 토큰
AWK_ISAI='
function isai(n) {
  if (n !~ /^(VITE_|REACT_APP_|NEXT_PUBLIC_|EXPO_PUBLIC_)/) return 0
  if (n !~ /KEY|TOKEN|SECRET/) return 0
  return (n ~ /OPENAI|ANTHROPIC|CLAUDE|GEMINI|GOOGLE_AI|GENAI|GPT|MISTRAL|COHERE|GROQ|DEEPSEEK|UPSTAGE|CLOVA|PERPLEXITY|_AI_|AI_API/)
}
'

# ---------------------------------------------------------------------------
# 공용 함수
#
# 후보 레코드: path<TAB>line<TAB>ord<TAB>detail
#   ord = 하위 검사 번호(설명 템플릿 선택 + 중복 제거 키), detail = {}에 들어갈 고정 텍스트
# ---------------------------------------------------------------------------

# 클라이언트 코드(src/·public/ 재귀 + 루트 *.html)를 grep한다. 출력: path:line:text
# $1 = 추가 grep 플래그(예: -oE), $2 = 패턴
cgrep() {
  if [ "${#CLIENT_DIRS[@]}" -gt 0 ]; then
    grep -rnI "$1" -e "$2" "${INC_CLIENT[@]}" "${EXCL[@]}" "${CLIENT_DIRS[@]}" 2>/dev/null
  fi
  if [ "${#ROOT_HTML[@]}" -gt 0 ]; then
    grep -nIH "$1" -e "$2" "${ROOT_HTML[@]}" 2>/dev/null
  fi
}

# grep 출력(path:line:text)을 레코드로 바꾼다. text는 읽지도 않고 버린다.
# $1 = ord, $2 = detail (매치 텍스트가 아니라 호출자가 정한 고정 라벨)
recs_fixed() {
  awk -v ord="$1" -v det="$2" '
    { if (match($0, /:[0-9]+:/)) printf "%s\t%s\t%s\t%s\n", substr($0, 1, RSTART - 1), substr($0, RSTART + 1, RLENGTH - 2), ord, det }
  '
}

# 레코드 → 출력 줄. 같은 (path,line,ord)는 첫 레코드만 남기고, 경로·줄 순으로 정렬한다.
# $1 = 규칙 id, $2..$5 = ord 1..4의 설명 템플릿
fmt() {
  awk -F "$TAB" -v rule="$1" -v t1="$2" -v t2="$3" -v t3="$4" -v t4="$5" '
    {
      p = $1
      sub(/^\.\//, "", p)
      k = p SUBSEP $2 SUBSEP $3
      if (k in seen) next
      seen[k] = 1
      tm = t4
      if ($3 == 1) tm = t1
      else if ($3 == 2) tm = t2
      else if ($3 == 3) tm = t3
      i = index(tm, "{}")
      if (i > 0) tm = substr(tm, 1, i - 1) $4 substr(tm, i + 2)
      printf "%s\t%s\t%s\t[%s] %s:%s %s\n", p, $2, $3, rule, p, $2, tm
    }
  ' | sort -t "$TAB" -k1,1 -k2,2n -k3,3n | cut -f4-
}

# 줄 수 (빈 문자열이면 0)
count() {
  if [ -z "$1" ]; then echo 0; else printf '%s\n' "$1" | awk 'END { print NR }'; fi
}

# ---------------------------------------------------------------------------
# 규칙 1 — viewport-zoom
# <meta 태그(최대 3줄에 걸쳐도 읽는다) 중 name=viewport인 것에 user-scalable=no|0 도
# maximum-scale=1(.0)도 없으면 그 meta 줄이 후보다. 루트 index.html에 viewport meta가
# 아예 없으면 index.html:1이 후보다(ord 2).
# ---------------------------------------------------------------------------
r1() {
  local f
  printf '%s' "$HTML_FILES" | while IFS= read -r f; do
    [ -n "$f" ] || continue
    awk -v F="$f" '
      { L[NR] = tolower($0) }
      END {
        nv = 0
        for (i = 1; i <= NR; i++) {
          s = L[i]
          base = 0
          while ((k = index(substr(s, base + 1), "<meta")) > 0) {
            p = base + k
            base = p + 4
            tag = substr(s, p)
            j = i
            while (index(tag, ">") == 0 && j < NR && j < i + 2) { j++; tag = tag " " L[j] }
            e = index(tag, ">")
            if (e > 0) tag = substr(tag, 1, e)
            if (tag !~ /(^|[^a-z0-9_-])name[[:space:]]*=[[:space:]]*[^a-z0-9]?viewport([^a-z0-9_-]|$)/) continue
            nv++
            if (tag ~ /user-scalable[[:space:]]*=[[:space:]]*(no|0)([^a-z0-9.]|$)/) continue
            if (tag ~ /maximum-scale[[:space:]]*=[[:space:]]*1(\.0*)?([^0-9.]|$)/) continue
            printf "%s\t%d\t1\t\n", F, i
          }
        }
        if (nv == 0 && F == "./index.html") printf "%s\t1\t2\t\n", F
      }
    ' "$f" 2>/dev/null
  done
}

# ---------------------------------------------------------------------------
# 규칙 2 — dark-theme (프로젝트 전체, 제외 디렉터리 빼고)
# 세 패턴을 한 번의 grep에 alternation으로 넣어서, prefers-color-scheme: dark 한 줄이
# color-scheme: dark로 또 잡혀도 한 줄로만 나온다.
# ---------------------------------------------------------------------------
r2() {
  grep -rnIioE -e "$P_DARK" "${INC_STYLE[@]}" "${EXCL[@]}" . 2>/dev/null | recs_fixed 1 ''
}

# ---------------------------------------------------------------------------
# 규칙 3 — cors-any-origin (프로젝트 전체, 제외 디렉터리 빼고)
# ---------------------------------------------------------------------------
r3() {
  grep -rnIioE -e "$P_CORS" "${INC_CORS[@]}" "${EXCL[@]}" . 2>/dev/null | recs_fixed 1 ''
}

# ---------------------------------------------------------------------------
# 규칙 4 — client-ai-key
# ---------------------------------------------------------------------------

# (a) 클라이언트 코드가 읽는 AI 키 환경변수 — 1단계 grep으로 클라이언트 접두사 변수를
#     모으고, 2단계 awk로 이름 규칙을 건다.
r4a() {
  cgrep -oE "$P_ENVREF" | awk "$AWK_ISAI"'
    {
      if (match($0, /:[0-9]+:/)) {
        p = substr($0, 1, RSTART - 1)
        l = substr($0, RSTART + 1, RLENGTH - 2)
        m = substr($0, RSTART + RLENGTH)
        sub(/^[^A-Za-z0-9_]/, "", m)
        if (isai(m)) printf "%s\t%s\t1\t%s\n", p, l, m
      }
    }
  '
}

# (b) 루트 .env* 파일의 정의 줄. awk가 파일을 직접 읽고 이름만 내보낸다 — 값은 변수에
#     담기지도 않는다.
r4b() {
  local f
  for f in ./.env*; do
    [ -f "$f" ] || continue
    awk -v F="$f" "$AWK_ISAI"'
      { s = $0; sub(/\r$/, "", s) }
      s ~ /^[[:space:]]*#/ { next }
      {
        sub(/^[[:space:]]+/, "", s)
        sub(/^export[[:space:]]+/, "", s)
        eq = index(s, "=")
        if (eq < 2) next
        n = substr(s, 1, eq - 1)
        sub(/[[:space:]]+$/, "", n)
        if (n ~ /^[A-Za-z_][A-Za-z0-9_]*$/ && isai(n)) printf "%s\t%d\t2\t%s\n", F, NR, n
      }
    ' "$f" 2>/dev/null
  done
}

# (c) 클라이언트 코드의 AI API 호스트 직접 호출 — 호스트는 소문자로 정규화해 찍는다.
r4c() {
  cgrep -ioE "$P_HOST" | awk '
    {
      if (match($0, /:[0-9]+:/))
        printf "%s\t%s\t3\t%s\n", substr($0, 1, RSTART - 1), substr($0, RSTART + 1, RLENGTH - 2), tolower(substr($0, RSTART + RLENGTH))
    }
  '
}

# (d) 키 형태 문자열 — 클라이언트 코드 + dist/. 찍는 것은 접두사 라벨뿐이다.
r4d() {
  cgrep -oE "$P_SK" | recs_fixed 4 'sk-…'
  cgrep -oE "$P_AIZA" | recs_fixed 4 'AIza…'
  if [ -d dist ]; then
    grep -rnIoE -e "$P_SK" "${INC_DIST[@]}" "${EXCL_DIST[@]}" dist 2>/dev/null | recs_fixed 4 'sk-…'
    grep -rnIoE -e "$P_AIZA" "${INC_DIST[@]}" "${EXCL_DIST[@]}" dist 2>/dev/null | recs_fixed 4 'AIza…'
  fi
}

# ---------------------------------------------------------------------------
# 실행 · 요약
# ---------------------------------------------------------------------------
OUT1=""
N1=0
C1="skip(no-html)"
if [ -n "$HTML_FILES" ]; then
  OUT1="$(r1 | fmt viewport-zoom "$D1A" "$D1B")"
  N1="$(count "$OUT1")"
  C1="$N1"
fi

OUT2="$(r2 | fmt dark-theme "$D2")"
N2="$(count "$OUT2")"

OUT3="$(r3 | fmt cors-any-origin "$D3")"
N3="$(count "$OUT3")"

OUT4="$({ r4a; r4b; r4c; r4d; } | fmt client-ai-key "$D4A" "$D4B" "$D4C" "$D4D")"
N4="$(count "$OUT4")"

TOTAL=$((N1 + N2 + N3 + N4))

for o in "$OUT1" "$OUT2" "$OUT3" "$OUT4"; do
  if [ -n "$o" ]; then printf '%s\n' "$o"; fi
done
echo "launch-scan:viewport-zoom=$C1 dark-theme=$N2 cors-any-origin=$N3 client-ai-key=$N4 total=$TOTAL"
exit 0
