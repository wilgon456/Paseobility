# `start_debug(mode)` / `start_attach(mode)` — 런타임 환경 전환 상세

`/ait:debug` §5의 attach 흐름이 내부적으로 어떻게 동작하는지의 상세다. 정상 경로만 필요하면 SKILL.md §5의 요약으로 충분하다 — 아래는 mode 내부 동작을 더 알아야 할 때만 읽는다.

## mode 값

| `mode` 값 | 환경 | 특이사항 |
|---|---|---|
| `local-browser` | 환경 1 — mock Chromium panel / 브라우저 CDP | 기본값. panel 모드와 CDP 직접 연결 모두 이 mode 사용 |
| `relay-staging` | 환경 3 — intoss-private candidate relay | side-effect unguarded (dogfood) |

두 값이 전부다. 예전에 있던 `relay-sandbox`(환경 2 — PWA Sandbox launcher)는
2026-08-10 결정으로 제거됐다 — 지금 그 값을 넘기면 도구가 거부한다.

## `start_debug` vs `start_attach`

**attach까지 한 번에 하려면 `start_attach`**, 환경만 전환하고 싶으면 `start_debug`를 쓴다.
`start_attach`는 `start_debug`의 mode 전환 동작을 흡수해 편의로 제공한다 — 이미 그 모드면 전환을 생략하고 바로 attach 경로를 발급한다. `start_debug`는 attach 없이 환경만 전환하는 단독 용도로 MCP 데몬(`@apps-in-toss/debugger`)에 계속 존재한다.

`ait-devtools` 데몬은 세션에 로드되면 계속 떠 있고, 환경 진입은 **서버 재구동 없이** MCP 도구로
런타임에 결정한다. 프로젝트 `.mcp.json`이 등록하는 기본
데몬(`npx -y -p <Release tarball URL> debugger`, `/ait:setup-debugger`가 배선)은 내부적으로 dual-connection 라우터로
동작하므로, **환경 1·3 두 mode를 한 데몬에서 warm swap으로 오갈 수 있다**
(Claude Code 재구동·MCP 재핸드셰이크 불필요).

## `relay-staging`(환경 3) 진입 — 데몬이 relay를 직접 띄운다

환경 3에서는 MCP 데몬이 자체 CDP relay와 quick tunnel을 띄우므로, 미리 배선해 둘
외부 relay 주소가 없다. `start_attach({mode:'relay-staging', scheme_url, projectRoot})`
한 호출이 relay 패밀리를 lazy-boot하고, deep-link에 `?debug=1&relay=<wss://…>`을
splice해 QR을 발급한다.

전제는 두 가지뿐이다: (1) candidate 번들에 `@apps-in-toss/debug-console`이
`dependencies`로 들어가 있을 것(`/ait:inject-debug-console`), (2) 그 candidate의
scheme URL(SKILL.md 5-B에서 빌드 → console MCP로 얻는다).

## `MCP_ENV` — 읽지 않는다 (설정해도 무효)

**deprecated가 아니라 무효다.** 데몬은 `MCP_ENV`를 어디에서도 읽지 않는다 — 값이 수용되고
그대로 무시된다(환경 파생에서 제거됨). 따라서 `MCP_ENV=relay`를 설정하고 서버를 재시작해도
환경은 바뀌지 않고 같은 Tier 거부를 다시 받는다.

환경 전환은 `start_debug({mode:'local-browser'|'relay-staging'})` 또는
`start_attach({mode:'relay-staging', …})`로 한다 — 런타임 warm swap이라 재시작 자체가
필요 없다.
