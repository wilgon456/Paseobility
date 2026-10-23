# attach 후 동적 등록 도구 13종 + 엣지케이스

`/ait:debug` §5-D(attach 확인 및 도구 자동 등록)의 상세다.

## 도구 목록

attach 성공 순간 서버가 `notifications/tools/list_changed`를 emit → Claude Code가
tool 목록을 자동 갱신한다. 다음 13종의 attach 의존 도구가 **같은 세션에서 즉시
callable**해진다 — 세션 재시작·재승인 불필요:

| 도구 | 용도 |
|---|---|
| `list_console_messages` | WebView console 출력·예외 스택 읽기 |
| `list_network_requests` | fetch/XHR 왕복·응답 상태 확인 |
| `list_exceptions` | 런타임 예외 ring buffer 읽기 |
| `get_dom_document` | 현재 DOM 스냅샷 (ARIA tree 포함) |
| `take_snapshot` | 페이지 접근성 트리 캡처 |
| `take_screenshot` | 폰 화면 PNG 캡처 |
| `measure_safe_area` | safe-area inset 측정 (노치·홈바 여백) |
| `call_sdk` | SDK 메서드 직접 호출 |
| `evaluate` | WebView JS 표현식 평가 |
| `run_tests` | 프로젝트의 `*.ait.test.ts` 파일을 이미 attach된 실기기 WebView에서 실행해 pass/fail/skip 결과 반환 |
| `AIT.getSdkCallHistory` | SDK 호출 이력 조회 |
| `AIT.getMockState` | devtools mock 상태 스냅샷 조회 |
| `AIT.getOperationalEnvironment` | 운영 환경 정보 + SDK 버전 조회 |

**attach 전에 보이는 도구는 bootstrap 4종(`start_debug`·`start_attach`·
`list_pages`·`get_debug_status`)뿐이다** — 그게 정상이다. 나머지 13종이 안 보이면 아직 폰이 안
붙은 것이니 QR 스캔 단계로 돌아간다.

## SECRET-HANDLING

relay attach에 시크릿/인증 코드가 쓰이더라도 그 값을
stdout/로그/메시지에 절대 출력하지 않는다. attach 실패 사유는 enum 수준으로만 보고.
deep-link/wssUrl의 실제 값도 예시가 아닌 한 그대로 인쇄하지 않는다.
relay tunnel URL도 동일 규칙 — wss-class 터널 호스트이므로 값을 로그·메시지에
직접 인쇄하지 않는다. placeholder 형태(`wss://<RELAY-HOST>`)로만 참조한다.

## `run_tests` 실기기 테스트 실행 상세

attach가 완료된 상태(list_pages로 페이지가 확인된 후)라면, 프로젝트에 `*.ait.test.ts` 파일이 있을 경우 **같은 relay 연결을 그대로 재사용**해 실기기 WebView에서 테스트를 실행할 수 있다.

```
run_tests({
  files: ["**/*.ait.test.ts"],
  projectRoot: "<프로젝트 루트 경로>"
})
```

- `files` (필수) — glob 패턴 또는 경로 배열. `projectRoot` 기준으로 탐색한다.
- `projectRoot` (선택) — glob 기준 디렉토리. 생략 시 MCP 데몬의 cwd.
- `timeout_ms` (선택) — 파일당 평가 타임아웃(ms). 기본값 30000, 범위 1000–600000.

결과는 파일별 pass/fail/skip + 합산 totals `{passed, failed, skipped, total}`으로 돌아온다. 시작/완료 로그는 카운트만 포함하며 시크릿은 싣지 않는다.

`run_tests`는 별도 relay 연결을 열지 않는다 — 이미 attach된 세션 위에서 동작하므로, QR 스캔 → attach 확인 흐름 이후 추가 QR 스캔 없이 바로 호출할 수 있다.
