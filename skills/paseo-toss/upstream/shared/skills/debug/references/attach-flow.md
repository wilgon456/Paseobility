# `start_attach` QR — 단계별 상세 (환경 3)

`/ait:debug` §5-C(attach — `start_attach` QR)의 실행 단계 상세다. SKILL.md의 요약만으로 부족할 때, 또는 각 단계에서 에러가 나서 원인을 짚어야 할 때 참조한다.

0. **사전 조건 확인**: candidate 번들에 `@apps-in-toss/debug-console`이 `dependencies`로
   들어가 있어야 attach 표면이 남는다. 없으면 **환경 3 attach 표면이 아직 설치되지
   않았습니다. 먼저 `/ait:inject-debug-console`을 실행하세요.** 여기서 중단.

1. **`start_attach({mode: 'relay-staging', scheme_url, projectRoot})`** 도구를 호출한다
   (5-B에서 `ait build` → console MCP `bundle_upload_complete`가 돌려준 scheme URL을
   에이전트가 그대로 `scheme_url`로 전달 — 사용자 복사 없음).
   이 한 번의 호출이 relay-staging 환경으로 전환하고, `?debug=1&relay=<wss://…>`을 splice해 attach용 deep-link를 합성하며, **QR PNG를 OS 기본 이미지 뷰어로 자동 열고** ASCII QR도 터미널에 병행 출력한다.
   `start_attach`는 attach까지 폴링하며 대기한다(`wait_timeout_seconds` 기본 60s). TOTP 코드 만료는 자동으로 재발행해 QR/대시보드를 갱신하므로 그 경우에는 재호출할 필요가 없다(타임아웃 진단은 아래 "타임아웃 진단"대로 조치한 뒤 재호출한다).

   예시 deep-link 형태 (실제 값은 도구 호출 결과로 받음):
   ```
   intoss-private://<app-id>?_deploymentId=<deployment-id>&debug=1&relay=wss://<relay-host>
   ```

2. 사용자가 **폰 카메라로 QR을 스캔**한다 — 이게 환경 3의 단일 진입 경로다.
   QR 스캔은 USB 연결·플랫폼별 CLI·드라이버 의존이 0이라 iOS/Android 동일하게
   동작한다. `devicectl`/`adb` 같은 device-control 발사는 쓰지 않는다(brittle,
   실유저 플로우 아님).

3. 폰 토스 앱 WebView가 deep-link를 열면 in-app gate를 통과해 relay에 attach된다.

## attach 단계 모델

데몬은 attach 시도마다 아래 단계를 시각·결과만 기록한다(URL·TOTP 코드·relay host는 기록하지 않는다). 타임아웃 에러, `get_debug_status`(`attachStages`·`attachDiagnosis`), 대시보드 "진행 단계" 타임라인, 클라이언트가 `progressToken`을 보냈을 때의 progress 알림(단계 변화 + 15초마다)이 같은 기록을 읽는다.

1. `tunnel` — cloudflared 터널 up/down
2. `qr-issued` — QR(attach URL) 발급
3. `device-handshake` — 폰이 이번 QR의 페이지를 열고 gate를 통과해 `/ait-attach`에 도달. 폰이 실제로 페이지를 열었다는 첫 증거다.
4. `auth` — `target.js` 정상 서빙 또는 거부(401, WS 4401)
5. `target-connected` / `target-disconnected` — 폰의 WebSocket 연결·끊김
6. `matched` — 붙은 페이지가 이번 `scheme_url`의 미니앱으로 확인됨
7. `cdp-ready` — CDP 도메인 활성화와 폰 배지 주입 완료

## 타임아웃 진단

`start_attach`가 시간 안에 attach하지 못하면 마지막으로 도달한 단계로 원인을 가려 "attach 타임아웃 (N초): <요약>", "해야 할 일:", "진행 기록:"을 돌려준다. 에이전트는 이 문구를 사용자에게 그대로 전하고, 해당 조치를 마친 뒤에 재호출한다. 같은 진단을 `get_debug_status`의 `attachDiagnosis`에서도 읽을 수 있다.

| 진단(`kind`) | 의미 | 사용자 조치 |
|---|---|---|
| `tunnel-down` | cloudflared 터널이 끊김 | 터널 재기동 안내를 따른다 |
| `page-not-opened` | 폰이 이번 QR의 페이지를 열지 않음(폰에서 relay로 온 요청 없음) | 미니앱이 열려 있으면 X로 닫고 다시 스캔 → 폰 화면 상태 표시 확인 → 사내망·MDM이 `*.trycloudflare.com`을 막으면 Wi-Fi를 바꿔 본다 |
| `qr-expired` | relay가 폰의 코드를 거부(만료·지난 QR) | 대시보드를 새로고침해 새 QR을 스캔 |
| `script-not-loaded` | 페이지는 열렸지만 `target.js` 로드·WebSocket이 끝나지 않음 | 폰 화면 상태 표시 확인, Wi-Fi 변경, 새 QR 스캔 |
| `wrong-page` | 폰이 붙었지만 이번 배포의 미니앱이 아님 | 붙은 페이지 목록을 보여 주고, 다르면 X로 닫고 새 QR 스캔. `scheme_url`의 `_deploymentId`가 방금 올린 번들인지 확인 |
| `rejected-busy` | 다른 미니앱이 같은 QR로 붙으려 해서 relay가 거부함(먼저 붙은 미니앱 유지, close 4409). 거부된 미니앱 화면에는 "디버거가 이미 다른 미니앱(이름)에 연결돼 있어서…" 막대가 뜬다 | 진단에 나온 두 미니앱 이름을 사용자에게 알린다. 새 미니앱을 디버깅하려면 먼저 붙은 미니앱을 X로 닫고 `start_attach`를 다시 호출해 새 QR을 스캔 |
| `session-dropped` | 붙었다가 끊김(앱 백그라운드, 네트워크) | 앱을 앞에 두고, X로 닫은 뒤 새 QR 스캔 |

relay TOTP 거부(close 4401)는 폰 쪽 코드 만료와 다른 문제다. 데몬이 가진 `.ait_relay` secret이 relay와 다르거나 PC 시계가 어긋난 경우이므로, 에러 안내대로 `start_attach`를 다시 부르고 반복되면 시스템 시계를 동기화한다.

## 폰 화면 상태 표시 읽는 법

`debug-console`은 URL에 `debug=1` 또는 `relay=`가 있을 때(QR로 연 경우) 화면 하단에 상태 막대를 띄운다. 탭하면 닫히며 코드·relay 주소는 표시하지 않는다. 사용자에게 막대 문구를 읽어 달라고 하면 원인이 거의 가려진다. 개발자 도구에서는 `window.__ait_debug_status`로 같은 상태 값을 읽을 수 있다.

| 상태 | 막대 문구(요지) | 조치 |
|---|---|---|
| `blocked-host` | 이 주소에서는 디버거를 연결할 수 없어요 | 토스 앱에서 테스트 번들로 연 화면인지 확인 |
| `blocked-entry` | 디버거 연결 조건이 맞지 않아요 | X로 닫고 대시보드의 QR을 다시 스캔 |
| `blocked-opt-in` | 디버그 연결 요청(debug=1)이 빠졌어요 | X로 닫고 QR을 다시 스캔 |
| `blocked-invalid-relay` | 디버거 서버 주소가 올바르지 않아요 | X로 닫고 QR을 다시 스캔 |
| `blocked-auth` / `code-expired` | QR 코드가 없거나 만료됐어요 | 대시보드를 새로고침하고 새 QR을 스캔 |
| `connecting` | 디버거에 연결하는 중이에요 | 잠시 기다린다 |
| `connected` | 디버거에 연결됐어요(3초 뒤 자동 숨김) | — |
| `session-ended` | 디버거 세션이 끝났어요 | X로 닫고 QR을 다시 스캔 |
| `server-unreachable` | 디버거 서버에 접속할 수 없어요 | 사내망·MDM이 `*.trycloudflare.com`을 막고 있을 수 있다 — Wi-Fi 변경 |
| `relay-busy` | 이 디버거는 이미 다른 미니앱에 연결돼 있어요 | 먼저 연결된 미니앱을 X로 닫은 뒤 이 앱에서 QR을 다시 스캔 |

막대가 아예 없으면 폰이 이번 QR의 페이지를 열지 않았거나(`page-not-opened`), 구버전 `debug-console`이 설치된 것이다. 폰 안 콘솔이 필요하면 앱인토스 공식 웹 디버그 툴즈(더보기 메뉴)를 안내한다.

## 대시보드와 재스캔 규칙

- 대시보드 탭은 **하나만** 쓴다. `start_attach`는 이미 연결된 탭이 있으면 새 탭을 열지 않고 그 탭의 QR을 갱신한다. 탭이 쌓이면 브라우저 호스트당 연결 한도(Firefox 6개)에 걸려 QR 이미지가 안 뜨고 "연결 끊김"으로 보일 수 있다. SSE 구독은 2개까지만 유지되고 초과분은 "다른 탭에서 대시보드가 열려 있어요" 안내만 남는다.
- 토스 앱에 같은 미니앱이 이미 열려 있으면 QR을 스캔해도 새 relay로 붙지 않는다. **미니앱을 X 버튼으로 먼저 닫은 뒤** 스캔하게 한다.
- `debugger-test`(터미널 test runner)와 MCP 데몬은 relay를 따로 쓴다. 데몬이 이미 relay를 운영 중이면 `debugger-test`는 PID와 안내를 남기고 멈춘다. 같은 테스트는 attach된 세션에서 `run_tests` 도구로 돌린다(5-E). 굳이 별도 relay가 필요하면 `debugger-test --separate-relay`.
