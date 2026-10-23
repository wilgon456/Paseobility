---
name: debug
description: |
  Debug an Apps in Toss mini-app across two environments — local browser
  (devtools panel, `window.__ait`, browser DevTools) and on-device
  intoss-private candidate (real Toss WebView via `ait-devtools` MCP
  relay-staging QR attach). Branches by what it observes, then runs an
  autonomous observe → hypothesize → minimal-fix → re-verify loop and hands off
  when it stalls (§6). Triggered by
  `/ait:debug` (no args). Distinct from `status`/`logs` (console-side, not
  live device state).
argument-hint: ''
adapter-note: '§5 (on-device MCP attach) is Claude Code-only — run_in_background, /mcp auto-start and notifications/tools/list_changed handling are Claude Code-specific. Not supported on Codex or Cursor; environment 1 (browser) works there unchanged. Replace §5 with an adapter-specific overlay when targeting other agents.'
---

# debug skill

## 목적

`/ait:debug`는 미니앱을 **두 겹의 환경**에서 디버깅하는 경로를 안내한다. 한 명령이
관찰 결과에 따라 환경을 분기한다 (환경 모델·fidelity 사다리: 로컬 `docs/design/three-environments-fidelity.md` — maintainer-internal 문서, repo 미포함):

| 환경 | 실행 면 | 이 skill의 경로 |
|---|---|---|
| 1. 로컬 브라우저 | desktop Chromium + mock SDK + Panel | 2-A/2-B/3 — panel · `window.__ait` · 브라우저 DevTools |
| 3. intoss-private relay dev | 실기기 토스 앱 WebView(dogfood) + CDP relay | 5 — `start_attach({mode:'relay-staging', scheme_url})` 1호출 QR attach |

환경 번호는 fidelity 사다리의 원 번호를 그대로 쓴다 — 중간 단(환경 2, PWA Sandbox
launcher)은 2026-08-10 결정으로 제거됐고 남은 두 단의 번호는 바꾸지 않았다.

**디버깅이 아니라 "실제 토스 앱에서 한 번 돌려보고 싶다"면 `/ait:test-on-device`가
정규 경로다** — 번들 빌드 → 콘솔 업로드 → 컴파일 확인 → 도구가 돌려준 링크로 열기.
이 skill(환경 3)은 그렇게 확인한 뒤 **폰에서만 재현되는 문제를 CDP로 관측**할 때
쓴다.

- **환경 1**은 지금 바로, 의존 없이 쓴다:
  - `@apps-in-toss/devtools`의 floating panel — mock 상태(권한·위치·IAP·이벤트 등)를
    실시간 관찰·조작 (12개 탭). 증상별로 어느 탭을 볼지는 `references/panel-tabs.md` 참조.
  - `window.__ait` — 런타임 mock SDK 상태 객체. 콘솔이나 에이전트가 직접 읽는다.
  - 브라우저 기본 DevTools — console / network / sources.
- **환경 3**은 `ait-devtools` MCP 서버로 닿는다. 이 서버는 **프로젝트 opt-in**이다 —
  `/ait:setup-debugger`가 프로젝트 `.mcp.json`에 배선하고, 세션에 로드돼 있으면
  `/ait:debug`는 새 서버를 띄우지 않고 **`start_attach({mode:'relay-staging', scheme_url})`로
  환경 전환과 QR attach 경로 발급을 한 호출로** 처리한다(아래 5). bootstrap 도구가
  세션에 안 보이면 배선이 안 된 것 — `/ait:setup-debugger`를 먼저 안내한다. QR은
  intoss-private deep-link라 토스 앱 WebView가 연다. attach 전에는 bootstrap 도구
  (`start_debug`·`start_attach`·`list_pages`·`get_debug_status`)만 보이고, 폰이
  relay에 붙으면 나머지 도구가 같은 세션에서 동적 등록된다.

두 환경 모두 attach 후 `run_tests`로 미니앱 test case 파일(glob)을 그 환경에서 실행할 수 있다 — 환경 1은 mock + 로컬 CDP, 환경 3은 실 토스 WebView에서 같은 테스트를 돌려 환경별 거동 차이를 본다. 상세는 `references/attach-tools.md`.

생성·수정하는 모든 메시지에 과장·홍보성 문구를 넣지 않는다. 생성하는 안내는
관찰·진단을 설명하는 최소한으로.

## 의존

- **`@apps-in-toss/devtools`가 devDependencies에 있어야** floating panel을 쓸 수 있다.
  없으면 `/ait:inject-devtools`를 먼저 안내한다 (없어도 브라우저 기본 DevTools
  가이드는 진행 가능).
- **`package.json`이 cwd에 있어야 한다**. 없으면 프로젝트 루트로 이동 안내.
- **환경 1**: 에이전트가 필요 시 dev 서버를 자동 기동한다(아래 2-A 사전 기동 블록).
- **환경 3**: `ait-devtools` MCP 서버(`@apps-in-toss/debugger`)가 세션에 로드돼 있어야 한다 —
  프로젝트 `.mcp.json`에 배선돼 있지 않으면 `/ait:setup-debugger`를 먼저 안내한다(opt-in).
- **환경 3**: candidate 빌드에 `@apps-in-toss/debug-console`이 `dependencies`로 설치돼 있어야 attach 표면이 남는다(없으면 `/ait:inject-debug-console` 먼저 안내 — `inject` skill의 debug-console facet).

> 이 skill은 콘솔 인증을 요구하지 않는다. 브라우저 디버깅은 로컬 전용.

## 입력

`/ait:debug`는 인자를 받지 않는다. 사용자가 증상을 자연어로 설명하면 (예: "로그인
버튼을 눌러도 authorizationCode가 안 옴", "swipe로 뒤로 가면 앱이 종료됨") 그
증상에 맞는 관찰 지점을 골라 안내한다.

## 실행 순서

### 1. 환경 확인

```bash
ls package.json
```

없으면 중단:

```
package.json이 없습니다. 프로젝트 루트 디렉토리에서 다시 실행해주세요.
예: cd <project-root> && /ait:debug
```

`package.json`을 `Read`로 읽어 `@apps-in-toss/devtools`가 `devDependencies`에 있는지
확인한다.

- **있으면**: floating panel 경로(아래 2-A)를 우선 안내.
- **없으면**: 브라우저 기본 DevTools 경로(2-B)만 안내하고, panel을 원하면
  `/ait:inject-devtools`를 먼저 실행하라고 덧붙인다.

### 2-A. devtools floating panel로 mock 상태 관찰

**dev 서버 사전 기동 (idempotent)**:

에이전트는 패널 안내 전에 dev 서버가 이미 기동 중인지 확인하고, 아닐 경우 자동으로 띄운다.

1. **dev 명령 + 기본 포트 확인**: `package.json`의 `scripts.dev`를 읽어 실제 명령을 확인한다. 포트는 다음 순서로 결정한다 — devtools는 Vite뿐 아니라 Next.js·Rspack·Webpack 프로젝트에도 주입될 수 있으므로 5173을 가정하지 않는다:
   - `scripts.dev`에 `--port <n>`(또는 Next.js `-p <n>`)가 있으면 그 값.
   - 없으면 config 파일로 빌드 도구를 판별해 기본 포트: `vite.config.*` → 5173, `next.config.*` → 3000, `rspack.config.*`/`webpack.config.*` → 8080.

2. **기동 여부 확인**: 위에서 결정한 포트(`$PORT`)가 응답하는지 확인한다:

   ```bash
   # 포트가 이미 열려 있으면 dev 서버가 기동 중 ($PORT = 위 1단계에서 결정)
   curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" || true
   ```

   200 응답이면 이미 기동 중 — 기동 단계를 건너뛴다. 연결 거부(exit code ≠ 0 또는 000)이면 아직 미기동.

3. **미기동 시 백그라운드 기동**: `run_in_background: true`로 dev 서버를 시작한다:

   ```bash
   # run_in_background: true 로 실행
   npm run dev
   ```

4. **URL 출력**: Vite가 stdout에 `Local: http://localhost:<port>/`를 출력한다. 에이전트는 이 줄을 파싱해 포트를 확인하고 사용자에게 URL을 명시적으로 알린다:

   ```
   dev 서버가 기동됐습니다: http://localhost:5173/
   브라우저에서 이 주소를 열어주세요. (브라우저는 직접 여세요 — 에이전트는 URL만 알려드립니다.)
   ```

   stdout의 `Local: http://localhost:<port>/` 줄을 파싱해 실제 포트를 확인한다(빌드 도구마다 출력 형식이 조금씩 다르다). 파싱 전 예상 포트는 위 1단계에서 결정한 값(Vite 5173 / Next.js 3000 / Rspack·Webpack 8080, 또는 `--port` 명시값)이다.

브라우저에서 연 뒤 화면 하단의 **AIT** 버튼을 누르면 패널이 열린다. 증상별로 어느 탭을 볼지는 `references/panel-tabs.md`에 정리돼 있다 — **상세가 필요하면 Read <이 skill의 base directory>/references/panel-tabs.md**.

### 2-B. 브라우저 기본 DevTools

panel 유무와 무관하게 항상 가능한 관찰:

- **Console**: 앱 코드의 `console.*` 출력, 던져진 예외 스택. devtools mock은
  미구현 SDK API 접근 시 **throw**하므로(잘 되는 척 방지), "devtools에선 되는데
  실 SDK에선 안 됨"이 아니라 미구현 mock이 원인이면 여기서 명확한 에러가 뜬다.
- **Network**: SDK가 호출하는 fetch/XHR 등.
- **Sources**: breakpoint, source map.

### 3. `window.__ait` 런타임 상태 직접 읽기

devtools mock은 상태를 `window.__ait`(AitStateManager)에 보관한다. 브라우저
콘솔에서 직접 들여다보면 패널을 열지 않고도 현재 mock 상태를 확인할 수 있다:

```js
window.__ait         // 상태 매니저 전체 (update/patch/subscribe/transaction 메서드)
window.__ait?.state  // 현재 상태 스냅샷 (AitDevtoolsState getter — 메서드 아님)
```

증상을 코드로 재현·검증할 때, 에이전트는 Playwright MCP가 연결돼 있으면
`browser_evaluate`로 위 값을 읽어 가설을 검증할 수 있다. (이 skill 자체가
브라우저를 띄우지는 않는다 — 사용자가 이미 띄운 dev 서버를 가정.)

### 4. 증상 → 가설 → 관찰 지점 정리

수집한 정보를 바탕으로 에이전트가 가설을 세우고, 위 관찰 지점 중 어디서 검증할지
한 블록으로 제시한다. 예:

```
증상: swipe로 뒤로 가면 앱이 종료됨
가설: BrowserRouter의 history.length === 1이라 native swipe가 미니앱 종료로 빠짐
관찰: 브라우저 콘솔에서 `window.history.length` 확인 → 메뉴 진입 후에도 1이면 가설 성립
검증: 라우팅을 history depth가 쌓이는 구조로 바꾸거나 swipe gesture 비활성화 후 재현
```

서버가 파트너 API 결과를 실패로 처리하면 HTTP 상태만 보지 않는다. HTTP 200에
`resultType: "FAIL"`이면 mTLS는 통과한 것이고, 실패 사유는 응답의 error 필드와
docs 서버 API 문서의 응답 스키마로 본다. TLS 오류나 연결 실패는 인증서 바인딩 쪽이다
(`../launch/references/server-runtime.md`). 서버 코드를 쓰거나 고치는 일은 `/ait:server`로 넘긴다.

가설이 하나 서면 거기서 멈추지 말고 §6의 루프로 이어간다 — 관측·수정·재검증을 에이전트가
반복하고, 탈출 조건에 걸릴 때만 사용자에게 넘긴다.

## 5. on-device 디버깅 (환경 3) — MCP attach

브라우저 디버깅(1~4)은 **dev 번들**(mock + panel)에만 적용된다. 실기기에서 도는
번들은 mock도 panel도 없어, 폰에서만 재현되는 회귀(예: native swipe-back)는
CDP(Chrome DevTools Protocol) relay로 attach해야 관측된다.
이 경로는 `ait-devtools` MCP 서버가 담당한다 — `/ait:setup-debugger`가 프로젝트
`.mcp.json`에 배선하는 **opt-in 서버**로(연결되면 `/mcp`에 `ait-devtools`로 뜬다),
이 skill은 새 서버를 띄우지 않고 attach 경로만 발급한다. bootstrap 도구
(`start_attach` 등)가 세션에 없으면 먼저 `/ait:setup-debugger`로 배선한다.

**환경 3에 들어가기 전에 `ait-devtools` 버전을 한 번 점검한다.** 예전에 배선한
프로젝트는 옛 debugger Release URL에 고정돼 있고, 0.2.2·0.2.3은 `start_attach`가
항상 "프로토콜 버전 불일치"로 실패한다. **Read `setup-debugger` skill의
`references/upgrade-check.md`** (이 skill의 base directory와 형제인
`../setup-debugger/references/upgrade-check.md`)의 1~3단계로 설정 파일의 URL
버전을 읽고, 플러그인 기준보다 낮으면 사용자에게 알려 동의를 받은 뒤 그 항목만
갱신한다. Release URL이 아닌 커스텀 런처는 건드리지 않는다.

### 5-A. 대상 환경

폰 디버깅 대상은 **환경 3 (intoss-private candidate)** 하나다 —
`RELEASE_CHANNEL=dogfood`로 빌드한 뒤 console MCP로 등록·업로드해 받는
`intoss-private://…?_deploymentId=<uuid>` candidate다. PREPARE 상태에서도
cold-load되므로 출시 전 실기기 개발 루프로 쓴다.

candidate scheme URL이 없으면 5-B에서 빌드 → console MCP
(앱 등록 + `bundle_upload`/`bundle_upload_complete`)로 candidate를
만들도록 안내한다. 로고·앱 정보가 없으면 콘솔 웹에서 최소 항목으로 앱을 만든다.

`start_debug`/`start_attach`의 mode 값·내부 동작(dual-connection 라우터, lazy-boot relay, 수동 `/mcp` 재구성 fallback)은 정상 경로에서는 몰라도 되는 세부다 — **상세가 필요하면 Read <이 skill의 base directory>/references/mode-switching.md**. attach까지 한 번에 처리하려면 바로 아래 5-B·5-C 순서를 따른다(`start_attach`가 환경 전환+QR 발급을 1호출로).

### 5-B. candidate 번들 준비

환경 3 attach에는 이미 올라가 있는 candidate scheme URL이 필요하다.

candidate scheme URL이 없으면 에이전트는 이 자리에서 직접 후보 빌드→등록→업로드를 진행한다:

1. `RELEASE_CHANNEL=dogfood npm run build`로 candidate 번들을 만든다.
   **`ait build`를 단독으로 부르지 않는다** — 3.x(`apps-in-toss.config.ts`)의
   `ait build`는 이미 만들어진 `dist/`를 포장만 하므로 웹 빌드 없이 부르면
   `웹 빌드 디렉토리(dist)가 존재하지 않습니다`로 종료하고, 환경 변수도 웹
   빌드에 닿지 못한다. 3.x의 `build` 스크립트가 `vite build && ait build`라
   한 줄로 둘 다 처리한다. 2.x 폴백(`granite.config.ts`)이면
   `RELEASE_CHANNEL=dogfood npm run bundle:ait`을 쓴다 — 그쪽 `ait build`는
   `web.commands.build`를 스스로 실행한다. (CLI `2.10.8`·`3.0.5` 소스 확인)
2. 아직 콘솔에 등록되지 않은 앱이면 등록부터 한다(이미 등록돼 있으면 건너뛴다).
   `miniapp_create`는 앱 생성과 앱 정보 검토 요청을 한 호출로 묶어 로고·부제·
   상세 설명·키워드·카테고리를 미리 요구한다. 그 자산이 이미 준비돼 있으면
   `miniapp_create`를 쓴다. 아직 없으면 자산부터 만들게 하지 말고, 콘솔 웹에서
   앱 이름·appName·앱 유형만으로 앱을 만들게 안내한 뒤 3단계로 간다 — 로고와
   앱 정보는 검토 요청 전까지 채우면 되고 번들 업로드·QR 테스트에는 필요 없다
   (공식 문서 `/guide/operation/console-workspace`). `granite.config.ts`의
   `appName`은 콘솔 appName과 같아야 한다.
3. console MCP `bundle_upload` → `bundle_upload_complete`로 번들을 업로드한다.
4. 업로드 완료 응답에서 `intoss-private://…?_deploymentId=<uuid>` scheme URL을 받는다.

**에이전트는 그 URL을 같은 흐름에서 곧바로 5-C의
`start_attach({mode:'relay-staging', scheme_url})`으로 전달한다 — 사용자에게
URL을 복사·재입력하게 하지 않는다.**

(콘솔 등록·업로드는 1회 인가가 필요하다 — `/mcp`에서 `ait-console`을
승인한다. 등록·업로드가 4046 lock·약관 미체결 등으로 멈추면 scheme URL 없이
돌아오며, 에이전트는 그 에러를 사용자에게 그대로 전달하고 5-C 진행을
중단한다. 이 skill은 `ait deploy`(API 키 기반 직접 배포)를 Bash로 호출하지
않는다 — 인가는 항상 console MCP의 OAuth 세션을 통한다.)

### 5-C. attach — `start_attach` QR

**QR 스캔이 단일 진입**이다 — `devicectl`/`adb` 같은 device-control 발사는 쓰지
않는다(실유저 플로우 아님). 사전 조건 확인·백그라운드 기동·폴링 등 단계별 상세는
**Read <이 skill의 base directory>/references/attach-flow.md**.

**경로 요약**: `start_attach({mode: 'relay-staging', scheme_url, projectRoot})` 호출
(5-B에서 받은 scheme URL을 그대로 전달 — 사용자 복사 없음. `?debug=1&relay=<wss://...>`을 splice해
deep-link 합성 + QR 발급, attach까지 최대 60s 폴링) → 사용자가 폰 카메라로 QR 스캔 → 토스 앱
WebView가 deep-link를 열어 in-app gate를 통과하고 relay에 attach.

`start_attach`가 "device↔host 프로토콜 버전 불일치"를 반환하면 에러 문구의 조치를
따르기 전에 `../setup-debugger/references/upgrade-check.md` 4단계로 설정된 debugger
버전부터 확인한다. 0.2.2·0.2.3이면 그 버전의 알려진 버그(0.2.4에서 수정)이므로
debug-console을 바꾸라고 하지 말고 debugger 항목 업그레이드를 제안한다.

TOTP 코드가 만료되면 `start_attach`가 자동으로 재발행해 QR/대시보드를 갱신하므로
그 경우에 한해 재호출할 필요가 없다. 타임아웃·단계별 진단은 다르다 — 에러 본문의
"해야 할 일"을 사용자에게 전하고, 그 조치(미니앱 X로 닫기, 새 QR 스캔 등)를 마친 뒤에
`start_attach`를 다시 부른다. 재호출하면 이전 대기는 `superseded`로 끝나고 새 호출이
이어받는다.

`start_attach`는 attach 과정을 단계(터널 → QR 발급 → 폰 핸드셰이크 → 스크립트 로드·인증 →
WebSocket 연결 → 페이지 매칭)로 기록하고, 타임아웃 에러와 `get_debug_status`
(`attachStages`·`attachDiagnosis`)가 같은 기록을 보여 준다. 원인별 조치 표와 폰 화면 상태
표시 읽는 법은 `references/attach-flow.md`의 "타임아웃 진단"·"폰 화면 상태 표시"를 따른다.
대시보드는 탭 하나만 쓴다(여러 탭을 열면 브라우저 연결 한도에 걸려 QR이 안 뜬다). 이미
열린 미니앱은 스캔해도 새로고침되지 않으므로 **X 버튼으로 닫은 뒤 스캔**하게 안내한다.

### 5-D. attach 확인 및 도구 자동 등록

1. **`list_pages`** 도구를 호출해 attach 여부를 확인한다.
   - attach 전: 빈 목록 → 5-C 스캔 단계로 돌아간다.
   - attach 후: 연결된 페이지(WebView) 목록이 보인다.

2. attach 성공 순간 서버가 `notifications/tools/list_changed`를 emit → Claude Code가
   tool 목록을 자동 갱신한다. attach 의존 도구 13종이 같은 세션에서 즉시 callable해진다 —
   전체 목록·용도·SECRET-HANDLING 세부는 **Read <이 skill의 base directory>/references/attach-tools.md**.

**attach 전에 보이는 도구는 bootstrap 4종(`start_debug`·`start_attach`·
`list_pages`·`get_debug_status`)뿐이다** — 그게 정상이다. 나머지가 안 보이면 아직 폰이 안
붙은 것이니 5-C 스캔 단계로 돌아간다.

### 5-E. 실기기 테스트 실행 — `run_tests`

attach가 완료된 상태(5-D에서 `list_pages`로 페이지가 확인된 후)라면, 프로젝트에 `*.ait.test.ts` 파일이 있을 경우 **같은 relay 연결을 그대로 재사용**해 실기기 WebView에서 테스트를 실행할 수 있다. 호출 형태·옵션·환경별 검증 범위는 **Read <이 skill의 base directory>/references/attach-tools.md**.

## 6. 자율 디버깅 루프 — 관측 → 가설 → 최소 수정 → 재검증

진단에서 멈추지 않는다. 가설이 서면 에이전트가 **한 사이클씩 스스로 돌린다** — 관측하고,
가설 하나를 세우고, 그 가설만 흔드는 최소 수정을 하고, 원 증상 재현 절차로 재검증한다.
사용자에게 넘기는 건 아래 탈출 조건에 걸릴 때뿐이다.

**한 바퀴**: 관측 → 가설 1개(반증 가능한 형태) → 최소 수정(한 번에 한 변수) → 재검증(같은
관측 지점 + 원 재현 절차) → 판정(종료 / 되돌리고 다음 가설 / 환경 승급 / hand-off).

**관측 입력은 환경에 따라 다르다**:

- **환경 1**: devtools panel 탭(`references/panel-tabs.md`), 브라우저 콘솔·Network·예외 스택,
  `window.__ait?.state`, 백그라운드 dev 서버 출력. Playwright MCP가 붙어 있으면
  `browser_evaluate`로 에이전트가 직접 읽고, 없으면 **붙여넣을 스니펫을 인쇄하고 사용자
  출력을 받아** 그 단계만 사람 경유로 degrade한다 — 루프는 계속 돈다.
- **환경 3**: attach 후 도구 13종(`references/attach-tools.md`)·`run_tests`·`list_pages`·
  `get_debug_status`. `ait-devtools` MCP가 배선돼 있지 않으면 환경 3 관측은 불가하므로
  `/ait:setup-debugger`를 안내하고 그때까지는 환경 1 안에서만 루프를 돈다.

**수정 최소화 (한 번에 한 변수)**: 한 사이클에 논리 변경 하나. 실패한 수정은 다음 사이클
전에 되돌린다(누적 금지 — 누적하면 원인 판별이 불가능해진다). 임시 계측은 허용하되 루프
종료 시 전부 제거하고 그 사실을 요약에 적는다. 리팩터링·무관 파일 정리·의존성 변경은
루프 밖이다.

**탈출 조건**:

- **같은 가설 2회 실패** → 즉시 중단하고 사용자 확인(관측 요약 + 다음 후보 2~3개). 3번째
  시도는 하지 않는다.
- **증상 재현 불가** → 수정 금지. 재현 확보가 선행이다 — 재현 절차를 확정하기 전에는
  소스를 고치지 않는다(재현이 없으면 재검증이 성립하지 않는다).
- **서로 다른 가설 3개 연속 기각, 또는 사이클 5회 초과** → hand-off. 환경 승급(1 → 3)
  필요 여부를 함께 제시한다.
- **환경 1에서 재현 안 됨 + 실 SDK·네이티브 브리지 의심** → 루프를 환경 3으로 옮긴다(5-B → 5-C).

**루프 경계**: 미니앱 소스 편집·임시 계측·dev 서버 재기동·로컬 테스트·`run_tests`·`ait build`
재빌드는 루프 안에서 한다. **검수 제출(`review_*`·`bundle_submit_review`)·릴리즈/롤백·
프로모션·푸시 발송, 그 밖의 콘솔 상태 변이, 의존성 변경, git commit·push는 사용자 명시
승인 없이는 하지 않는다.** 유일한 예외는 5-B의 candidate 등록·업로드(환경 3 진입에 필요,
디버깅 목적 한정 — 사용자가 환경 3 승급에 동의한 뒤).

사이클 로그 형식·degrade 표·예시 한 바퀴는 **Read <이 skill의 base directory>/references/debug-loop.md**.

루프를 끝내거나 넘길 때는 이 형태로 마무리한다:

```
디버깅 루프 종료 (사이클 3/5, 환경 1)
가설: 라우팅이 replace라 history depth가 안 쌓임
수정: src/pages/Menu.tsx 라우팅 1건을 push 로 변경
재검증: 원 재현 절차 재실행 - 스와이프 후 앱 유지됨 (통과)
임시 계측: 전부 제거함

다음 (명령을 몰라도 됩니다 - 따옴표 안 문장을 그대로 말해도 같은 단계로 갑니다):
  /ait:debug            # 실기기에서도 같은지 확인 - 환경 3 attach (5-B -> 5-C)
                        #   말로: "이거 실기기에서도 같은지 확인해줘"
  /ait:setup-debugger   # 환경 3 attach 서버가 아직 없으면 이걸 먼저
                        #   말로: "나중에 폰 디버깅할 수 있게 디버거 연결을 미리 세팅해줘"
```

## Out of scope (이 skill이 하지 않는 것)

- ❌ 브라우저를 직접 열기 — 환경 1에서 에이전트는 dev 서버를 자동 기동하고 URL을 출력하며,
  브라우저는 사용자가 직접 연다(에이전트는 URL만 출력). 환경 3의 QR 스캔은 사람이 폰 카메라로 한다(이 skill은 QR을 발급).
- ❌ `ait-devtools` MCP 서버 배선·기동 — 배선은 `/ait:setup-debugger`(프로젝트
  `.mcp.json`), 기동은 Claude Code가 한다. 이 skill은 attach 경로만 발급한다.
- ❌ 검수 큐 제출(환경 3 밖의 배포 상태 전환, 비가역) — 명시 승인 없이 하지 않는다.
  (5-B의 candidate 등록·업로드는 디버깅 목적 한정이며 검수 제출과는 다르다.)
- ❌ devtools 설정 주입 — `/ait:inject-devtools`.
- ❌ 환경 3 attach 표면 설치 — `/ait:inject-debug-console`(`@apps-in-toss/debug-console`을 `dependencies`로 설치 + `/auto` 와이어업). 이 skill은 그 위에서(표면이 번들에 들어간 상태에서) QR attach와 CDP 관측을 담당한다.
- ❌ 배포 후 운영 상태 조회 — 필요하면 console MCP `miniapp_get_status`를 직접
  호출한다. 이 skill은 디버깅 목적의 candidate 등록·업로드까지만 한다.
- ❌ 증상과 무관한 코드 수정 — §6 루프는 **가설 하나를 흔드는 최소 수정**만 한다.
  리팩터링·포매팅·무관 파일 정리·의존성 추가/버전 변경은 루프 밖이고, 필요하면 요약에
  적어 사용자에게 넘긴다.

## 하지 말아야 할 것

- ❌ attach 전에 attach 의존 도구가 안 보이는 걸 "버그"로 오인. bootstrap 4종
  (`start_debug`·`start_attach`·`list_pages`·`get_debug_status`)만 보이는 게 정상이고, 폰이
  붙으면 나머지 13종이 동적 등록된다(5-D, 상세는 `references/attach-tools.md`).
- ❌ `devicectl`/`adb` 등 device-control로 폰을 발사. 진입은 QR 스캔 단일 경로다(5-C).
- ❌ 브라우저(환경 1)에서 재현되지 않는 회귀를 mock 기준으로 단정. 실 SDK·네이티브
  브리지 fidelity가 필요하면 환경 3(intoss-private dogfood)으로 올라간다.
- ❌ candidate 번들에 `@apps-in-toss/debug-console`이 없는 상태로 attach 시도. attach
  표면이 번들에 없으면 QR을 스캔해도 relay에 붙지 않는다 — `/ait:inject-debug-console` 먼저.
- ❌ 시크릿/인증 코드 값을 stdout·로그·메시지에 출력.
- ❌ `window.__ait`의 메서드명을 고정으로 단정. 버전에 따라 다를 수 있으니 객체를
  펼쳐 확인하도록 안내.
- ❌ 미구현 mock의 throw를 "버그"로 오인. 의도된 동작이며 누락 API는 devtools
  이슈로 보고 안내.
- ❌ 한 사이클에 여러 변수를 동시에 수정하거나, 실패한 수정을 되돌리지 않고 다음 가설로
  넘어가기(§6). 어느 변경이 원인인지 판별할 수 없게 된다.
- ❌ 재현이 안 잡힌 상태에서 소스부터 고치기. 재현 절차 확정이 선행이다(§6 탈출 조건).
- ❌ 루프 안에서 검수 제출·릴리즈/롤백·프로모션·푸시 발송 등 콘솔 상태 변이 도구 호출.
  환경 3 진입에 필요한 5-B의 candidate 등록·업로드만 예외다(디버깅 목적 한정).
- ❌ 메시지에 과장·홍보성 문구. 생성하는 안내는 관찰·진단을 설명하는 최소한으로.
- ❌ `MCP_ENV` 기반 구버전 진입 방식에 의존. 환경 전환은 `start_debug({mode})`로
  런타임에 한다(상세는 `references/mode-switching.md`).
- ❌ 환경 3 scheme URL을 얻으려 `ait deploy --api-key`/`--profile`(API 키 기반 직접
  배포)를 Bash로 호출. 콘솔 등록·업로드는 항상 console MCP 도구로 처리한다 —
  OAuth 세션 인가만 쓰고 Deploy Key/API 키 경로는 쓰지 않는다(5-B).

## 다음 단계 (관찰 결과에 따라 분기)

- **`start_attach`가 프로토콜 버전 불일치를 반환** → 설정된 debugger가 0.2.2·0.2.3이면 알려진 버그다.
  `../setup-debugger/references/upgrade-check.md`로 0.2.4 이상 URL로 올린 뒤 MCP를 재연결한다.
- **bootstrap 도구(`start_attach` 등 4종)가 세션에 안 보임** → `ait-devtools` MCP 미배선.
  `/ait:setup-debugger`로 프로젝트 `.mcp.json`에 등록하고 서버 연결 후 다시 `/ait:debug`.
- **환경 1에서 재현·진단 끝** → §6 루프로 관측→최소 수정→재검증을 돌린다. 브라우저에서
  재현되지 않고 실 SDK fidelity(토스 WebView·네이티브 브리지)가 의심되면 환경 3으로
  올라간다: 5-B에서 `ait build` → console MCP로 등록·업로드해 scheme URL을 받아 바로
  `start_attach({mode:'relay-staging', scheme_url})`으로 QR attach (복사 없음 — 5-B 참조).
- **candidate scheme URL이 아직 없음** → 5-B로 `ait build` → console MCP
  (앱 등록 → `bundle_upload` → `bundle_upload_complete`; 로고·앱 정보가 없으면
  콘솔 웹에서 최소 항목으로 앱을 먼저 만든다)로 candidate를 만든 뒤 다시 `/ait:debug`.
- **`start_attach` 스캔 대기 중** → 폰 카메라로 QR 스캔.
  attach 후 `list_pages`로 확인 → 페이지가 보이면 5-D의 13종 도구로 디버깅 시작.
- **attach 후 미니앱에 `*.ait.test.ts` 테스트가 있으면** → `run_tests({ files: ["**/*.ait.test.ts"], projectRoot: "<프로젝트 루트>" })`로 실기기에서 실행 (5-E). env별 결과를 대조하면 SDK 버전·플랫폼 거동 차이를 잡는다.
- **attach는 됐는데 도구가 아직 안 보임** → `notifications/tools/list_changed`가
  Claude Code에 전달되기까지 수 초 걸릴 수 있다. 잠시 후 에이전트의 도구 목록을
  다시 확인. 여전히 없으면 `get_debug_status`로 현재 환경/모드·relay 연결 상태 점검.
- **콘솔 운영 관측** → console MCP `miniapp_get_status`로 콘솔 상태도 함께 확인.

## 참고

- 상세가 필요하면 Read <이 skill의 base directory>/references/panel-tabs.md (환경 1 패널 탭별 관찰 지점), references/mode-switching.md (`start_debug`/`start_attach` mode 내부 동작·fallback), references/attach-tools.md (attach 후 13종 도구 + `run_tests` 상세 + SECRET-HANDLING), references/debug-loop.md (§6 자율 루프 — 환경별 관측 입력·degrade·탈출 조건·사이클 로그 형식).
- 짝 skill: `inject-devtools` (panel 설정), `inject-debug-console` (환경 3 candidate 빌드에 attach 표면 설치 — `@apps-in-toss/debug-console` `dependencies`), `setup-debugger` (`ait-devtools` MCP를 프로젝트 `.mcp.json`에 배선 — §5의 전제).
- 환경 모델 × fidelity 설계 정본: 로컬 `docs/design/three-environments-fidelity.md`(maintainer-internal 문서, repo 미포함) — §1 환경 모델, §5 동적 도구 등록, §7 CDP 단일 transport.
- 환경 3 진입 시나리오 + QR relay 흐름 문서(devtools `docs/scenarios/env-3.md`) — 구 repo 이력에만 존재(재생성으로 링크 소멸, maintainer 로컬 백업 mirror에서 열람 가능)
- dogfood relay 루프 (candidate 빌드 → QR 스캔 → attach → 관측 사이클) 문서(devtools `docs/dogfood-relay-loop.md`) — 구 repo 이력에만 존재(재생성으로 링크 소멸, maintainer 로컬 백업 mirror에서 열람 가능)
- devtools (mock + panel + unplugin, 브라우저 dev 전용) 소스 — 구 repo 이력에만 존재(재생성으로 링크 소멸, maintainer 로컬 백업 mirror에서 열람 가능)
- on-device debug MCP 데몬(`start_debug`/`start_attach` 등 attach 도구): `@apps-in-toss/debugger`(`/mcp/server` + `/mcp/cli` exports, `debugger`·`debugger-test` bin) — `/ait:setup-debugger`가 배선한 프로젝트 `.mcp.json`의 `mcpServers."ait-devtools"`가 `npx -y -p https://github.com/toss/apps-in-toss-harness/releases/download/debugger-v0.2.7/apps-in-toss-debugger-0.2.7.tgz debugger`로 기동. server key `ait-devtools`는 유지하되 실제 데몬 패키지는 `@apps-in-toss/debugger`다(Phase 3 분리, 이전에는 devtools repo의 `devtools-mcp` bin이었다): https://github.com/toss/apps-in-toss-harness/tree/main/packages/debugger
- on-device attach 런타임(WebView 안에서 relay에 붙는 코드 + 폰 화면 상태 표시): `@apps-in-toss/debug-console`(`.` + `/auto` exports) — 환경 3(intoss-private candidate)은 `ait build` production-adjacent 빌드라 devtools unplugin의 dev-only CDP 브리지가 자동 비활성화되므로, attach 표면을 남기려면 미니앱 `dependencies`로 별도 설치해야 한다. 설치·와이어업은 `/ait:inject-debug-console` (`inject` skill의 debug-console facet)이 담당한다.
- lifecycle 디버깅(swipe-back 등), on-device CDP relay 디버깅 구조·진입 경로,
  relay TOTP 인증(터널 URL 유출 차단) 등은 docs MCP(`searchDocumentation`/
  `getPage`)로 조회한다.
