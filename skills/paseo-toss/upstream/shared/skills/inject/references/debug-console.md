# debug-console facet — `/ait:inject-debug-console` 상세

기존 앱인토스 미니앱 프로젝트에 `@apps-in-toss/debug-console`을 설치해, on-device 디버깅
(환경 3 — intoss-private candidate)에 attach 표면을 남긴다. `/ait:inject-debug-console`는
인자를 받지 않는다.

`@apps-in-toss/debug-console`은 예전 `@apps-in-toss/devtools`의 `./in-app` export였다 —
devtools의 MCP 데몬·test runner·on-device attach 표면이 별도 패키지(`debugger`)로 분리되면서
`@apps-in-toss/debugger`(MCP 데몬, devDep/npx 전용)와 `@apps-in-toss/debug-console`(on-device
attach) 2개 패키지로 나뉘었다.

생성·수정하는 파일에 과장·홍보성 문구를 넣지 않는다. 생성하는 주석은 배선을 설명하는 최소한으로.
이 skill은 콘솔 인증을 요구하지 않는다 — 로컬 설치 작업이다.

## 보안 스코프 (중요)

`@apps-in-toss/debug-console`은 **프로덕션 미니앱 번들에 실제로 들어갈 수 있는 유일한 디버그
패키지**다 — `@apps-in-toss/devtools`(mock+panel+unplugin)와 `@apps-in-toss/debugger`(MCP
데몬)는 둘 다 devDep/npx 전용이라 번들에 유입되지 않는다. 보안 스코프가 이 패키지 하나로
격리된 이유이기도 하다: 설치돼 있지 않으면 attach 코드가 번들에 구조적으로 들어갈 수
없다 — attach 표면 유무가 "설치 여부"로 결정되므로, 프로덕션에 attach 코드를 남기고
싶지 않다면 이 skill을 실행하지 않으면 된다.

## 의존

- **npm / pnpm / yarn / bun** 중 하나. 감지 순서: `package-lock.json` → `pnpm-lock.yaml` →
  `yarn.lock` → `bun.lockb`. 아무것도 없으면(lockfile 무신호) `npm`으로 가정.
- **`package.json`이 cwd에 있어야 한다**. 없으면 프로젝트 루트로 이동하도록 안내하고 중단.
- 인터넷 연결 필요 (`@apps-in-toss/debug-console` GitHub Release tarball 설치, 아래 §3).

## 1. 프로젝트 루트 확인

```bash
ls package.json
```

없으면 즉시 중단:

```
package.json이 없습니다. 프로젝트 루트 디렉토리에서 다시 실행해주세요.
예: cd <project-root> && /ait:inject-debug-console
```

## 2. 이미 설치됐는지 확인 (idempotency)

`package.json`의 `dependencies`에 `@apps-in-toss/debug-console` 키가 있거나(과거 설치),
그 값이 아래 §3의 harness Release URL이면(URL 설치는 키가 패키지명, 값이 URL이 된다)
설치 단계를 건너뛴다. 있더라도 진입점 와이어업 단계(step 4)는 진행한다 — import가
누락됐을 수 있기 때문.

```bash
node -e "
const p = require('./package.json');
const v = p.dependencies?.['@apps-in-toss/debug-console'];
process.exit(v ? 0 : 1);
"
```

## 3. 패키지 설치

Step 2에서 이미 있으면 skip. **반드시 `dependencies`다 — `devDependencies`가 아니다**
(devtools·debugger와 달리 이 패키지만 프로덕션 번들에 실제로 들어간다). npm에는 발행하지
않으므로 harness GitHub Release tarball URL을 설치 스펙으로 준다 — 설치 후
`package.json`의 `dependencies` 키는 `@apps-in-toss/debug-console`, 값은 이 URL이 된다:

```bash
npm install "https://github.com/toss/apps-in-toss-harness/releases/download/debug-console-v0.2.0/apps-in-toss-debug-console-0.2.0.tgz"   # npm (기본)
pnpm add "https://github.com/toss/apps-in-toss-harness/releases/download/debug-console-v0.2.0/apps-in-toss-debug-console-0.2.0.tgz"      # pnpm
yarn add "https://github.com/toss/apps-in-toss-harness/releases/download/debug-console-v0.2.0/apps-in-toss-debug-console-0.2.0.tgz"       # yarn
bun add "https://github.com/toss/apps-in-toss-harness/releases/download/debug-console-v0.2.0/apps-in-toss-debug-console-0.2.0.tgz"        # bun
```

※ **설치 스펙(위 URL)과 import specifier(아래 §4)는 다르다.** URL은 "어디서 받는가"를
지정하는 설치 문맥 전용이고, 설치되고 나면 `node_modules` 상의 패키지 이름은 그대로
`@apps-in-toss/debug-console`이므로 코드에서는 항상 정식 스코프로 import한다.

## 4. 진입점 와이어업 (멱등)

진입점(`--entry` 없음 — 자동 감지 순서: `src/main.tsx` → `src/main.ts` → `src/index.tsx` →
`src/index.ts` → `index.tsx` → `index.ts`)을 `Read`로 열어 `@apps-in-toss/debug-console`이 이미
import되어 있는지 확인. 있으면:

```
@apps-in-toss/debug-console import가 이미 있습니다. 와이어업을 건너뜁니다.
```

없으면 두 가지 와이어업 방식 중 하나를 안내한다. 패키지 자체 README는 프로덕션 하드닝
관점에서 **방식 B**(build-gate)를 권장 순서상 먼저 제시한다 — 아래도 같은 순서로 싣는다.
다만 이 skill이 진입점에 **실제로 자동 삽입하는** 스니펫은 여전히 **방식 A**(`/auto`)다:
consumer 프로젝트마다 번들러 `define` 배선(`RELEASE_CHANNEL`↔`__DEBUG_BUILD__` 매핑 등)이
달라 이 skill이 임의로 방식 B를 강제 적용하면 소비자의 기존 빌드 설정과 충돌하거나
dogfood attach 플로를 조용히 깰 수 있기 때문이다 — 방식 B를 쓰려면 아래 안내를 참고해
사용자가 직접 선택·적용한다.

**방식 B — build-time `__DEBUG_BUILD__` 게이트 (권장, release 번들에서 완전히 제거하고 싶을 때)**:

```ts
declare const __DEBUG_BUILD__: boolean;

if (__DEBUG_BUILD__) {
  import('@apps-in-toss/debug-console').then((m) => m.maybeAttach());
}
```

`maybeAttach(gateResult?: GateResult): void`는 인자 없이 호출하면 내부적으로
`checkDebugGate()`(호스트 allowlist + `debug=1`/`relay=` opt-in + relay host allowlist +
TOTP 게이트)를 스스로 수행하는 self-gating 함수다 — 호출부에 별도 boolean 조건을 씌울
필요가 없고, 반환값은 `void`(Promise 아님). `__DEBUG_BUILD__`는 consumer 번들러의
`define`(예: Vite `define: { __DEBUG_BUILD__: 'false' }`)에 **사용자가 직접 추가해야
하는** 값이다 — 이 skill은 그 `define` 배선을 자동으로 하지 않는다. release 빌드에서
`false`로 두면 번들러가 `@apps-in-toss/debug-console` 그래프 전체를 dead-code-eliminate한다
(방식 A의 "잠든 청크"가 아예 남지 않는다). `__DEBUG_BUILD__`는 ambient global이므로
consumer 쪽에 `declare const __DEBUG_BUILD__: boolean;` 선언도 필수 스텝이다.

**방식 A — `/auto` self-gating entry (이 skill이 기본으로 적용, 대안)**:

```ts
import '@apps-in-toss/debug-console/auto';
```

런타임 self-gate다 — DEV 빌드이거나 URL에 `?debug=1`+`?relay=`가 함께 있을 때만(즉 환경 3
debug relay deep-link로 열렸을 때만) 활성화되고, 일반 프로덕션 로드에서는 아무 동작도
하지 않는다. 단 "번들에서 코드가 물리적으로 0바이트"까지는 보장하지 않는다 — 비활성
상태로 잠들어 있는 청크가 release 번들 안에 그대로 남는다. relay URL host allowlist
(`relay=`가 `*.trycloudflare.com` 또는 localhost가 아니면 거부)가 있어 그 잠든 청크가
임의의 relay에 attach되는 일은 없지만, 코드 자체를 물리적으로 지우는 것과는 다른 보장이다
— 그 보장이 필요하면 방식 B를 쓴다.

## 5. debug-console facet 완료 seam

```
@apps-in-toss/debug-console 설정 완료

변경 내용:
  - dependencies에 @apps-in-toss/debug-console 추가 (또는 이미 있어서 skip)
  - <진입점 파일>에 import '@apps-in-toss/debug-console/auto' 삽입 (또는 이미 있어서 skip)

[알아야 할 것]
  - @apps-in-toss/debug-console은 dependencies입니다 — 프로덕션 번들에 실제로 포함되는
    유일한 디버그 패키지입니다. attach 표면을 남기고 싶지 않으면 이 skill을
    실행하지 마세요.
  - /auto는 런타임 self-gate — DEV 빌드이거나 URL에 debug=1+relay=가 있을 때만 활성화,
    일반 프로덕션 로드에서는 no-op입니다. release 번들에서 코드 자체를 제거하려면
    __DEBUG_BUILD__ 빌드타임 게이트(방식 B, 위 §4)를 쓰세요.
  - 폰 화면 하단 막대가 연결 상태(차단 사유·연결 중·연결됨·세션 종료·코드 만료)를 알려 줍니다. 탭하면 닫힙니다.
  - 폰 안 콘솔이 필요하면 앱인토스 공식 웹 디버그 툴즈(더보기 메뉴)를 쓰세요.

다음 단계 (명령을 몰라도 됩니다 — 따옴표 안 문장을 그대로 말해도 같은 단계로 갑니다):
  RELEASE_CHANNEL=dogfood npm run build  # candidate 빌드에 attach 표면 포함
                                      #   (2.x 폴백은 npm run bundle:ait)
  /ait:debug                          # 환경 3 QR attach로 on-device 디버깅
                                      #   말로: "미니앱이 폰에서 이상하게 동작하는데 라이브 상태를 디버깅하고 싶어"

참고: https://github.com/toss/apps-in-toss-harness/tree/main/packages/debug-console · https://github.com/toss/apps-in-toss-harness/tree/main/packages/debugger
```

## debug-console facet 하지 말아야 할 것

- ❌ `dependencies` 대신 `devDependencies`에 설치 — 프로덕션 번들에 포함돼야 하는
  유일한 패키지다.
- ❌ 진입점 이외 파일에 자동 import 삽입.
- ❌ `@apps-in-toss/devtools`·`@apps-in-toss/debugger`와 혼동 — 이 facet은 온디바이스 attach
  전용이다. MCP 데몬 등록은 `/ait:setup-debugger`가 처리(`/ait:debug` 참조),
  브라우저 mock/panel은 `inject-devtools` facet.
- ❌ 생성·수정하는 내용에 과장·홍보성 문구. 생성하는 주석은 배선을 설명하는 최소한으로.
