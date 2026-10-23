# ait-devtools 버전 점검·업그레이드

`setup-debugger`를 예전에 실행한 프로젝트는 MCP 설정 파일의 `ait-devtools` 항목이
그때의 debugger Release URL에 고정돼 있다. 플러그인이 올라가도 이 항목은 자동으로
바뀌지 않으므로, `/ait:debug`와 `/ait:setup-debugger`가 같은 절차로 점검한다.
이 문서가 그 절차의 단일 정본이다. 버전 숫자는 여기에 적지 않는다 — 기준은 항상
`setup-debugger/SKILL.md` 4단계 json 블록의 URL이다.

## 1. 점검 (읽기만, 값싸다)

1. 호스트에 맞는 설정 파일을 읽는다: Claude Code는 프로젝트 `.mcp.json`, Cursor는
   `.cursor/mcp.json`. 파일이나 `mcpServers."ait-devtools"`가 없으면 점검할 것이
   없다 — `ait-devtools`가 필요하면 `setup-debugger` 신규 배선으로 간다.
2. 항목의 `args` 배열에서 아래 형태의 URL을 찾는다 (`<v>`는 같은 값):

   ```
   https://github.com/toss/apps-in-toss-harness/releases/download/debugger-v<v>/apps-in-toss-debugger-<v>.tgz
   ```

3. 이 형태가 **아니면**(커스텀 런처, 로컬 경로, 다른 URL, 버전 없는 bare 패키지)
   그 항목은 사용자 것이다. 건드리지 않고 업그레이드 제안도 하지 않는다.
4. 이 형태이면 `<v>`를 `setup-debugger/SKILL.md` 4단계 URL의 버전과 숫자로
   비교한다(`0.2.10`은 `0.2.4`보다 새 버전이다).
   - 같거나 더 높으면: 아무 말 없이 지나간다.
   - 더 낮으면: 2단계로 간다.

## 2. 사용자에게 알리고 동의받기

설정 파일 경로, 현재 버전, 기준 버전을 그대로 보여 준다. 예(현재 0.2.3):

```
.mcp.json의 ait-devtools가 debugger 0.2.3에 고정돼 있습니다. 이 플러그인이 쓰는 버전은 0.2.7입니다.
0.2.2와 0.2.3에는 start_attach가 항상 "프로토콜 버전 불일치"로 실패하는 알려진 버그가 있고, 0.2.4에서 고쳐졌습니다.
바꿀 항목은 args의 URL 하나입니다.
  - .../debugger-v0.2.3/apps-in-toss-debugger-0.2.3.tgz
  + .../debugger-v0.2.7/apps-in-toss-debugger-0.2.7.tgz
다른 서버 항목은 건드리지 않습니다. 업데이트할까요?
```

동의를 받을 때까지 파일을 쓰지 않는다. 거절하면 그대로 두고, 이번 세션에서는
다시 묻지 않는다.

## 3. 적용

동의하면 `ait-devtools`의 `args`에서 그 URL 문자열 하나만 `setup-debugger`
4단계의 URL로 바꾼다(`Edit`). 다른 서버, 같은 항목의 다른 필드, `-p` 구조는 그대로
둔다. 바꾼 뒤 안내한다:

- MCP 서버는 세션 시작 때 띄워진다. 이미 열린 세션이면 `/mcp`에서 `ait-devtools`를
  재연결하거나 세션을 다시 시작해야 새 버전이 뜬다(Cursor는 MCP 목록에서 껐다 켠다).
- 이미 떠 있는 데몬은 옛 버전 그대로이므로, 재연결 전에는 `start_attach`를 다시
  시도해도 같은 결과가 날 수 있다.

## 4. 증상으로 들어온 경우 (start_attach 프로토콜 불일치)

`start_attach`가 "device↔host 프로토콜 버전 불일치"를 반환하면, 에러 문구의 안내
("debug-console을 최신 릴리스로 올려라" 등)를 따르기 전에 먼저 1단계로 설정된
debugger 버전을 확인한다.

- 설정된 버전이 0.2.2 또는 0.2.3이면: 이 에러는 그 두 버전의 알려진 버그다.
  패키지 버전 문자열을 비교하다 항상 불일치로 판정하며, 에러가 권하는 debug-console
  맞춤은 존재하지 않는 버전을 가리킬 수 있어 따를 필요가 없다. 2단계의 업그레이드를
  제안한다. debug-console을 바꾸라고 하지 않는다.
- 설정된 버전이 0.2.4 이상이거나 Release URL이 아닌 런처면: 이 버그가 아니다.
  에러 문구대로 debug-console 또는 debugger 버전 정합을 확인한다.
