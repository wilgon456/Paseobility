---
name: launch
description: |
  Pre-launch check, review request and rejection handling for an Apps in
  Toss mini-app (검수 = the Apps in Toss app review, not code review). Use
  it right away for "검수 넣기 전에 한번 봐줘", "출시해도 되는지
  점검해줘", "검수 요청 넣어 줘", or a pasted rejection ("검수에서
  반려됐어. 사유가 …"); it reads the project itself, so don't ask which
  files first. Checks code against the official checklist and console
  review state, and drafts an inquiry when the cause isn't in the code.
  Use it before any `bundle_submit_review` call: it shows the full
  request and submits only after the user approves it; never releases or
  rolls back. Phone testing is `/ait:test-on-device`; screen fixes, even
  for review criteria, are `/ait:design`. Triggered by
  `/ait:launch [rejection reason]`.
argument-hint: '[rejection reason]'
---

# launch skill

## 목적

검수에 넣기 전 점검과 반려 뒤 대응을 맡는다. 검수 기준 문장은 docs MCP로 읽는
개발자센터 문서가 정본이다. 이 skill은 그 문장을 코드와 맞춰 보는 순서, 코드
스캔, 원인을 코드에서 못 찾았을 때 고치지 않고 멈추는 지점을 더한다. 화면
수정은 `/ait:design`, 문구는 `/ait:ux-writing`, 폰 확인은 `/ait:test-on-device`,
기획은 `/ait:plan`이 맡는다.

## 판단 규약

1. 작업 디렉터리부터 읽는다. 읽기 전에 "비어 있다", "소스가 없다"고 말하지 않는다.
2. 판정 근거는 docs MCP `getPage` 원문이다. 검색 결과 조각이나 `askQuestion`
   요약으로 판정하지 않는다.
3. 설치된 SDK부터 본다(web-framework 버전, 설정 파일은 3.x
   `apps-in-toss.config.ts`·2.x `granite.config.ts`). 설치된 `.d.ts`에 없는 키나
   API는 권하지 않고, 2.x용 문단을 3.x에 쓰지 않는다.
4. 쓰지 않는 기능의 항목은 해당 없음이다. '(선택 사항)' 항목, '~하는 경우' 항목,
   기능 절(토스 로그인, 인앱 결제, 토스페이, 인앱 광고, 웹보드 게임)이 여기에 든다.
   '사용자 식별키 발급' 절은 조건 없이 공통 절 사이에 있으니 모든 앱에 적용한다.
5. 사용자 식별은 두 가지를 본다. 앱이 SDK 식별키 API로 값을 받아 저장하는지(API
   이름은 설치된 `.d.ts`와 docs로 확인한다). 서버가 사용자를 확인해야 하면
   클라이언트가 보낸 식별키를 그대로 믿지 않고 인증 코드 교환으로 받는지. 설치된
   SDK에 인증 코드 API가 없으면 필요한 버전만 알린다. 앱 안의 사용자별 데이터만
   다루면 발급과 저장으로 충분하다. 문서는 lookup-map의 사용자 식별 행이다.
6. 스캔 출력은 후보다. 파일을 열어 확인한 것만 보고한다.
7. 도구는 한 턴에 묶어 부른다. 턴이 하나 늘 때마다 앞의 내용을 전부 다시 읽는다.
   파일은 Bash 한 번으로 함께 읽고, 체크리스트 밖 문서는 판정에 꼭 필요한 것만
   2쪽까지 읽는다.

## 실행 순서

### 0. 범위

- 반려 사유가 함께 왔으면 1 다음 4로 간다. 검수 요청을 원하면 바로 5로 간다.
  그 밖에는 1~3을 하고 6으로 보고한다.
- 게임인지 비게임인지 정한다. 코드로 알 수 없으면 한 번 묻는다.

### 1. 첫 턴: 프로젝트 읽기와 스캔

아래 둘을 같은 턴에 부른다.

- ToolSearch 한 번으로 docs MCP `getPage`를 불러온다. 콘솔을 읽을 거면 3의
  도구도 같은 호출에 넣는다.
- Bash 한 번. base directory는 이 skill을 로드할 때 표시된 문자열을 그대로 쓴다.
  반려 대응이면 사유에 나온 낱말(API 이름, 문자열, 설정 키)을 찾는 grep을
  덧붙인다.

```bash
ls -la; cat package.json apps-in-toss.config.ts granite.config.ts 2>/dev/null
grep '"version"' node_modules/@apps-in-toss/web-framework/package.json 2>/dev/null
find . \( -name node_modules -o -name .git -o -name dist \) -prune -o -type f -print | head -100
bash "<이 skill의 base directory>/scripts/launch-scan.sh" .
```

`package.json`이 없으면 위치를 묻고 멈춘다. 스캔 마지막 줄이 규칙별 건수다.

### 2. 둘째 턴: 체크리스트 원문과 코드

- `getPage`로 체크리스트를 바로 연다. 비게임은
  `https://developers-apps-in-toss.toss.im/checklist/app-nongame`, 게임은
  `https://developers-apps-in-toss.toss.im/checklist/app-game`. 검색은 getPage가
  실패할 때만 한다.
- 같은 턴에 판정에 필요한 소스를 Bash `cat` 한 번으로 함께 읽는다.

| 스캔 규칙 | 다루는 법 |
|---|---|
| `viewport-zoom` | 비게임만. 확대·축소 문장과 맞춰 보되, WebView가 기본으로 막는지는 문서에 없으니 "확인 필요"로 둔다 |
| `dark-theme` | 라이트 모드 문장과 맞춰 본다 |
| `cors-any-origin` | docs 서버 API 문서의 허용 origin을 getPage로 확인해 정확한 origin을 권한다(기준은 `references/server-runtime.md`의 CORS 절) |
| `client-ai-key` | 키가 번들에 들어가는지 본다. 키 값은 출력하지 않고, 서버로 옮기도록 권한다. 생성형 AI를 쓰는 앱이므로 생성물 표시 기준(docs 운영 정책)도 보고에 함께 올린다. 화면에서 표시를 확인하지 못했으면 "확인 필요"로 둔다 |

체크리스트 항목을 코드와 맞춰 나눈다. 고칠 것에는 파일:줄과 근거 문장을
붙인다. 앱 이름·등록 로고·카테고리처럼 코드 밖에 있는 것은 콘솔 웹 확인으로
넘기고, 화면·문구 항목은 6의 다음 단계로 넘긴다. 다른 문서가 필요하면
`references/lookup-map.md`의 경로로 getPage를 부른다. 함께 볼 것:

- 생성형 AI를 쓰면 생성물 표시 기준을 docs 운영 정책에서 확인한다.
- 토스 송금 화면으로 보내는 링크나 스킴은 정책 위반으로 반려되거나 게시가
  중단될 수 있다. 문서 본문에 기준이 없으니 "확인 필요"로 표시한다.
- 파트너 API를 부르는 서버라면 mTLS 인증서는 앱인토스 콘솔에서 사용자가 발급받는다.
  발급 절차는 docs "서버 API 이용하기"의 발급 절을 getPage로 확인해 안내하고,
  막히면 채널톡으로 묻게 한다. 인증서와 키 파일은 repo와 로그에 넣지 않는다.
- 서버 연결부(특히 Cloudflare Workers)를 점검하면 `references/server-runtime.md`를
  읽는다. CORS origin, 파트너 API 응답 처리, 키 파일 정리 기준이 있다. 서버 코드를
  쓰거나 고치는 일은 `/ait:server`로 넘긴다.

### 3. 콘솔 읽기

console MCP가 인가돼 있을 때만 읽는다. 아니면 "콘솔 상태 미확인"으로 보고한다.
도구는 1의 ToolSearch에서 한꺼번에 불러온다. ID를 모르면 `workspace_overview`
→ `miniapp_list_overview`로 찾고, `miniapp_release_status`·`miniapp_meta_status`·
`review_list`는 한 턴에 부른다. 반려면 `review_get_feedback`도 읽는다. 응답
해석은 각 도구 description을 따른다.

- `WORKSPACE_TERMS_*`는 코드 문제가 아니다. 콘솔 웹에서 약관에 동의해야 하고,
  출시 판정은 보류한다.
- `ALLOWED`는 출시 버튼이 켜진다는 뜻일 뿐 점검 통과가 아니다.
- 현재 상태는 `reviewState`·`reviewStatus`로만 판단한다. `rejectedMessage`는
  마지막 반려 기록이다.
- console MCP에 도구가 없는 작업은 사용자가 콘솔 웹에서 직접 한다. 핵심 지표
  등록·수정, 사업자 등록, 약관 동의, 비즈월렛 충전, mTLS 인증서 발급이 그렇다.
  도구를 찾느라 돌거나 다른 길로 우회하지 않는다. 메뉴 위치는 docs로 확인해
  알려 준다(핵심 지표는 `references/lookup-map.md`).
- 도구가 있는지는 서버가 주는 도구 목록(ToolSearch)으로 판단한다. docs의 "AI로
  콘솔 사용하기" 페이지 목록과 다를 수 있다.
- 핵심 지표: 등록 전에 `core_metric_template_event_types`로 고를 수 있는 템플릿을
  보여 준다. 사용자가 콘솔 웹(워크스페이스 선택 → 미니앱 선택 → 왼쪽 메뉴 '핵심
  지표')에서 등록하면 `core_metric_details`로 반영됐는지 확인한다.
- 프로모션 예산: 충전이 필요하면 `promotion_money_balance`로 잔액을 보여 주고,
  충전은 콘솔 웹 비즈월렛에서 하도록 안내한다.

### 4. 반려 대응 (docs 근거 4단계)

1. 반려 사유를 원문 그대로 인용한다.
2. 사유를 docs 문장과 맞춘다. 사유에 해당하는 문서 1쪽만 getPage로 읽는다
   (대개 2의 체크리스트, 다른 주제는 lookup-map의 경로).
3. 코드에서 원인을 찾으면 고치고 다시 스캔한다. 파일:줄과 근거 문장을
   보고하고, 의존성 변경은 승인을 받는다. 설정 키를 "혹시 몰라" 더하는 것도
   추측이다.
4. 찾지 못하면 코드를 바꾸지 않고 문의 초안을 만든다. 경로는 docs FAQ가
   안내하는 콘솔 우측 하단 채널톡 상담원 연결이고, 보내는 것은 사용자다.

```
[검수 반려 문의] <앱 이름> · <번들 버전 또는 deploymentId>
반려 사유(원문): "<원문 그대로>"
확인한 것: 맞춰 본 문서 항목 / 확인한 파일 / 검색어 / 결과
아직 확인하지 못한 것:
부탁: 반려 근거가 된 위치(파일, 문자열, 화면)를 알려 주시면 바로 고치겠습니다.
```

### 5. 검수 요청 (승인 게이트)

콘솔 쓰기는 `bundle_submit_review` 하나뿐이고, 아래를 순서대로 다 지나야 부른다.
`workspace_overview`·`miniapp_list_overview`·`miniapp_release_status`·
`bundle_list`·`bundle_submit_review`는 ToolSearch 한 번으로 불러온다.

1. `miniapp_release_status`의 `reviewRequestDecision`이 `ALLOWED`인지 본다.
   최초 등록 전인 앱은 콘솔 웹에서 제출하게 안내한다.
2. deploymentId는 `bundle_list`에서 확인한다. 지어내지 않는다.
3. `bundle_test_push`와 실제 기기 테스트를 했는지 사용자에게 묻는다. 테스트
   완료 표시만으로 판단하지 않는다. 안 했으면 `/ait:test-on-device`로 보낸다.
4. 보낼 내용 전체를 보여 준다: 앱, deploymentId, 릴리즈 노트 전문(1000자
   이하), 바꿀 때만 기능 목록.
5. 사용자가 지금 대화에서 그 1건을 명시적으로 승인해야 한다. 4를 보여 준 뒤에
   받은 답만 승인이다. 첫 요청에 릴리즈 노트가 들어 있어도, 포괄 지시나 이전
   승인도 승인이 아니다. 내용이 바뀌면 다시 받는다.
6. 한 번 호출한다. 실패하면 응답을 그대로 전하고 재시도하지 않는다.

승인은 출시가 아니다. 출시는 사용자가 콘솔 웹 '출시하기'로 한다. 검수 기간은
docs에서 확인해 안내한다.

### 6. 보고

체크리스트 전문을 붙여 넣지 않는다. 아래 형식으로 끝낸다.

```
출시 전 점검 결과 (<게임|비게임>, SDK <버전>)
  고칠 것 <n>  콘솔에서 확인 <n>  확인 필요 <n>  확인됨 <n>
  콘솔 상태: <릴리즈·검수 상태 | 미확인>

다음 단계
  /ait:design           # 화면 항목 고치기
                        #   말로: "화면이 검수 기준에 맞는지 디자인 쪽으로 봐줘"
  /ait:ux-writing       # 문구 항목 고치기
                        #   말로: "앱 화면 문구 전체를 UX 라이팅 기준으로 점검하고 개선안 제안해줘"
  /ait:test-on-device   # 고친 번들을 폰에서 확인
                        #   말로: "만든 미니앱을 실제 토스 앱에서 돌려보고 싶어. 번들 올려서 폰에서 확인하게 해줘"

문서가 필요하면 docs MCP(searchDocumentation/getPage)로 조회하세요.
```

## Out of scope (이 skill이 하지 않는 것)

- ❌ 출시('출시하기'), 롤백, 프로모션, 최초 등록 심사 제출(콘솔 웹에서 한다)
- ❌ 5의 게이트를 거치지 않은 `bundle_submit_review`, 그 밖의 콘솔 쓰기.
  `review_submit`·`review_cancel`도 부르지 않는다(취소한 배포는 다시 요청할 수
  없다)
- ❌ docs MCP `sendFeedback`(밖으로 나가는 쓰기다), 문의 발송(사용자가 보낸다)
- ❌ 콘솔 메뉴, 문의 경로, 인증서 절차 지어내기. 키·토큰·인증서 값 출력하기
- ❌ 서버 스캐폴드(연결부 점검은 이 skill이 한다)

## 참고

- `references/lookup-map.md`: 상황별 docs 검색어와 경로
- `references/server-runtime.md`: 서버 연결부 점검(mTLS, Workers, 응답 봉투, CORS)
- 짝 skill: `test-on-device`(폰 확인), `design`(화면), `ux-writing`(문구),
  `plan`(기획)
- console MCP가 인가되지 않았으면 `/mcp`에서 `ait-console`을 인가한다.
