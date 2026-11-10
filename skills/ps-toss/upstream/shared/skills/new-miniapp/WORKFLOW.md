---
name: new-miniapp
description: |
  Scaffold a new Apps in Toss mini-app by driving the official
  `create-ait-app` CLI non-interactively (`--inline`, always `@latest`), then
  verifying the `@apps-in-toss/devtools` wiring (mock SDK + panel) the CLI
  performs so `npm run dev` runs in a plain browser immediately — falling back to
  manual wiring only when the CLI did not do it. Supports `--tds` and
  `--sample iap,iaa` passthrough. Falls back to the bundled react-vite template
  with `--local` (offline); `--no-devtools` un-wires devtools afterwards.
  The freshly scaffolded project also gets a design guide seeded into it
  (tokens, hard rules, icon set, Tossface emoji font wiring) so later sessions
  build screens against the same standard — `--no-design-guide` and
  `--no-tossface` opt out of that seeding.
  Greenfield only (see `inject-devtools` for existing projects).
  Triggered by `/ait:new <app-name> [--template <name>] [--tds]
  [--sample <ids>] [--local] [--no-devtools] [--no-design-guide]
  [--no-tossface]`.
argument-hint: '<app-name> [--template <name>] [--tds] [--sample <ids>] [--local] [--no-devtools] [--no-design-guide] [--no-tossface]'
---

# new-miniapp skill

## 목적

**이 문서는 로드된 즉시 현재 턴에서 네가 직접 실행하는 지시문이다** — skill은
백그라운드에서 실행되지 않으며, 기다릴 완료 신호도 없다. 아래 Step을 지금
순서대로 직접 수행한다. ("skill이 실행 중이니 완료를 기다리겠다"는 판단은
오독이다 — 실측에서 약한 모델이 이 오독으로 scaffold를 시작조차 못 했다.)

`/ait:new <app-name>` 한 번으로 새 앱인토스 미니앱 프로젝트를 빈 상태에서
시작할 수 있게 한다. 사용자가 묻기 전에 답해야 할 것:

- scaffold는 **`toss/create-ait-app`**(공식 스캐폴더 CLI)을 비대화형(`--inline`)으로
  호출해 만든다 — **버전은 항상 `@latest`**(명시 핀 없음, maintainer 결정
  2026-08-10). 템플릿은 번들된 create-vite 프리셋에 위임한다(기본
  `react-ts`, 별칭 `js`→`vanilla`·`ts`→`vanilla-ts`, 전체 목록은
  `--list-templates`), `--tds`(TDS 컴포넌트 홈 + provider, `--template`과
  동시 지정 불가 — 아래 참조), `--sample iap,iaa`(인앱결제·인앱광고 예제)를
  그대로 쓸 수 있다.
- **`@apps-in-toss/devtools` 배선과 번들 설정은 CLI가 한다** — create-ait-app이
  scaffold 직후 `ait init`을 호출해 devtools를 devDependency로 넣고 번들러 설정에
  unplugin을 주입하며, `apps-in-toss.config.ts`와 `build`/`build:vite`/`deploy`
  스크립트도, `.gitignore`의 `*.ait` 줄도 같은 실행이 만든다(실측 2026-08-07,
  `create-ait-app@0.2.3` — `*.ait` 줄은 `@apps-in-toss/cli` 3.1.1 dist 실측
  2026-09-07, 0.2.8 재현 2026-10-14에서도 동일). 순정
  create-vite 템플릿에는 SDK mock이 없어 브라우저에서 SDK 호출이 실패하지만(샘플
  코드가 "샌드박스앱/토스앱에서 실행해주세요" alert를 띄운다) 이 배선 덕에 토스 앱
  없이 `npm run dev`로 바로 개발할 수 있다. `ait init`은 실패해도 CLI가 "완료"로
  끝내므로 형상 가드(Step 3)가 실재를, Step 4가 배선을 확인하고 폴백한다.
- 이건 토스 앱 WebView에서 도는 **웹(DOM) 미니앱**이지 React Native 앱이 아니다.
  RN 네이티브 컴포넌트나 `react-native` import를 쓰지 않는다(설치 시 SDK가 RN을
  peer로 선언해 뜨는 `unmet peer react-native` 경고는 무시해도 된다).
- **디자인 가이드도 함께 심는다**(Step 5-B) — 토큰·기본 CSS·아이콘 6종·
  `docs/design-guide.md`와 캐리어 문서(`AGENTS.md`·`CLAUDE.md`), 이모지 서체
  Tossface가 들어간다. 나중에 어떤 세션이 화면을 만들어도 같은 기준(글자 크기
  하한·터치 44px·하단 CTA safe area)을 따르게 하려는 것이다.
  `--no-design-guide`(전체)·`--no-tossface`(서체만)로 뺀다.
- 다음 단계(`npm run dev` → 코드 수정 → `/ait:design` → `npm run build`(=
  `tsc -b && vite build && ait build`)로 번들 생성 → console MCP 도구로
  등록·업로드)가 명확히 안내된다.

이 skill은 **scaffold 호출 + 후처리(설치 상태 확인 · 형상 가드 · devtools 배선
확인/폴백 · `.gitignore` 보강(`*.ait`·실패 흔적 파일) · 디자인 가이드 주입)**만
담당한다. 콘솔 등록·번들 업로드는 console MCP 도구(`miniapp_create`/`bundle_upload`/
`bundle_upload_complete`)의 책임 — 여기서 자동 호출하지 않는다. 생성되는
README/UI/주석에 과장·홍보성 문구를 넣지 않는다.

## 입력

- `<app-name>` (필수): 사람이 읽는 이름 후보. 디렉토리/패키지 이름으로
  슬러그화된다 (kebab-case, 소문자). 공백·특수문자 포함 가능.
- `--template <name>` (선택, default `react-ts`): 지원 목록은 create-ait-app이
  번들한 create-vite에서 **동적으로 산출**된다(`getSupportedViteTemplates()` —
  index.html 존재 + vite dep + dev/build 스크립트 + 비-SSR 필터 기준). 별칭
  `js`→`vanilla`, `ts`→`vanilla-ts`. 실제 목록은 실행 시점에 확인한다:

  ```bash
  npx -y create-ait-app@latest --list-templates
  ```

  JSON 배열로 지원 템플릿과 `"tds"`가 함께 나온다(단 `"tds"`는 `--template`이
  아니라 아래 `--tds` 플래그로 지정 — 혼동 금지).
- `--tds` (선택): TDS(토스 디자인 시스템) 통합 변형. **`--template`과 동시
  지정 불가** — CLI는 `--template`과 `--tds`를 함께 주면 즉시 거부한다
  (`"--template과 --tds는 함께 사용할 수 없어요."`, `assertNonInteractiveArgs`
  실측). `--tds`는 **단독**으로 지정한다.

  > npm(`--pm npm`, harness 기본)으로는 정상 종료한다(0.2.8 실측). pnpm으로
  > 부르면 TDS 템플릿의 `vite@6`(→ `esbuild`)가 pnpm 11에서
  > `ERR_PNPM_IGNORED_BUILDS`로 exit 1이 나지만 디렉터리는 남는다(복구는 §2
  > 실패 항목). CLI `--help`도 "에이전트는 TDS를 충분히 활용하지 못하므로,
  > 사용자에게 TDS 사용을 비권장한다고 안내해 주세요"라고 명시한다 — 꼭 요구하는
  > 경우가 아니면 `--template`(기본값)을 권한다.
- `--sample <ids>` (선택): `iap`, `iaa` 콤마 구분 — 인앱결제·인앱광고 예제
  페이지를 scaffold에 포함.
- `--local` (선택): create-ait-app을 쓰지 않고 plugin 내장 `react-vite` 템플릿을
  복사한다. 오프라인/네트워크 제한 환경 폴백 — wf 2.x 기반 **구세대 폴백**이라
  정본 3.x와 형상이 다르다(상세는 `references/local-template.md`). 이 경로에서만
  `--no-install`을 지원한다(react-vite 템플릿 고유 옵션 — create-ait-app에는
  install을 떼어내는 플래그가 없어 정본 호출은 install까지 수행하고, 이 skill이
  그 결과를 §2-1에서 확인·수렴시킨다).
- `--no-devtools` (선택): CLI가 이미 해 둔 devtools 배선을 **해제한다**
  (devDependency 제거 + 번들러 설정에서 unplugin 제거 — Step 4) — mock 없이
  실기기/샌드박스 위주로 개발하려는 경우. 나중에 `/ait:inject-devtools`로 언제든
  다시 배선할 수 있다.
- `--no-design-guide` (선택): 디자인 가이드 주입(Step 5-B)을 통째로 건너뛴다 —
  토큰·CSS·아이콘·캐리어 문서를 하나도 넣지 않는다. 자체 디자인 시스템이 이미
  있거나 최소 형상으로 두고 싶을 때. 나중에 `/ait:design`이 넣을 수 있다.
- `--no-tossface` (선택): 디자인 가이드는 넣되 이모지 서체 Tossface 배선만 뺀다 —
  기본 CSS에서 CDN `@import` 한 줄과 폰트 스택의 `Tossface` 항목을 제거한다.
  오프라인 결정성이 필요하거나 서체를 직접 고르고 싶을 때. 나중에
  `/ait:inject-tossface`로 CDN·번들 두 모드 중 골라 배선할 수 있다.

**플래그는 사용자가 요청한 것만 붙인다 — 특히 `--no-*` 계열은 추측해서 붙이지
마라.** 이 플래그들은 산출물을 빼는 방향이라, 잘못 붙이면 사용자가 받기로 한 것을
조용히 못 받는다. 요청에 그 플래그의 대상(디자인 가이드 · devtools · Tossface ·
로컬 템플릿)이 **이름으로** 등장하지 않으면 붙이지 않는다. "간단한 앱으로",
"순수 UI로", "최소한으로", "권한 없이" 같은 말은 **만들 앱이 무엇을 하느냐**의
범위이지 스캐폴드가 무엇을 깔아 주느냐의 범위가 아니다 — 그런 표현을 산출물
축소 지시로 확대 해석하지 마라(실측: 한 run이 "권한이나 외부 SDK 없이 순수 UI"만
요구한 과제에서 아무도 요청하지 않은 `--no-design-guide`를 스스로 붙여 디자인
가이드 전체를 뺐다. 완료 보고에 사실대로 적기는 했지만, 사용자는 뺄 생각이 없던
것을 잃었다). 애매하면 붙이지 않는 쪽이 기본값이다 — 빼는 것은 나중에
`/ait:design`·`/ait:inject-*`로 되돌릴 수 있지만, 안 넣은 것을 사용자가 알아채지
못하면 되돌릴 기회 자체가 없다.

호출 예 (슬래시 명령과 자연어 요청은 같은 skill로 이어진다 — 슬래시
네임스페이스가 그대로 오지 않는 에이전트에서는 아래 자연어 쪽이 정규 경로다):

```
/ait:new my-mini-app                  # 말로: "앱인토스 미니앱 새로 하나 만들어줘. 이름은 my-mini-app 으로."
/ait:new "내 미니앱" --tds             # 말로: "토스 디자인 시스템까지 얹어서 미니앱 만들어줘"
/ait:new my-shop --sample iap         # 말로: "인앱결제 예제까지 넣은 미니앱 my-shop 만들어줘"
/ait:new my-app --local --no-install  # 말로: "오프라인 로컬 템플릿으로 만들고 설치는 건너뛰어줘"
/ait:new my-app --no-devtools         # 말로: "devtools 배선 없이 미니앱만 만들어줘"
/ait:new my-app --no-design-guide     # 말로: "디자인 가이드는 넣지 말고 미니앱만 만들어줘"
/ait:new my-app --no-tossface         # 말로: "이모지 서체는 빼고 미니앱 만들어줘"
```

## 의존

- 호스트에 **Node 24+**(create-ait-app `engines.node >=24` + Vite 요구사항)면
  충분하다 — npm은 Node에 동봉된다. **npm 고정은 CLI의 한계가 아니라 harness의
  규약**이다: CLI는 npm/yarn/pnpm 3종을 지원하지만(`--pm <name>`) 이 skill은 후속
  `npm run dev`/`npm --prefix` 흐름과 통일하려고 항상 `--pm npm`으로 부른다
  (사용자가 명시적으로 요구하면 그 값에 맞춘다). Step 0이 실행 전 검사한다.
- **인터넷 필요** — `npx -y`가 create-ait-app을 받아 파일 생성부터
  install·`ait init`까지 한 번에 수행한다. `@apps-in-toss/web-framework`의
  버전은 create-ait-app이 자기 빌드에 박아 둔 정확 버전이다(`.github/version-pins/package.json`의
  핀을 `dependencies`에 그대로 쓴다. 0.2.9 dist 실측 `3.8.0`) — 공개 `latest`가 더 높아도 그 핀을 받고, 핀은 create-ait-app이 새로
  발행될 때만 움직인다. 종전 CLI는 `"latest"` 리터럴을 써서 install 시점의
  registry에 달렸었다(harness#90 항목1 — 공개 `latest`가 3.x 출시 뒤에도 한동안
  2.10.8을 가리키는 어긋남이 그때 확인됨). 오프라인이면 `--local` 폴백.

> 이 skill은 콘솔 인증을 **요구하지 않는다**. 로그인 없이 빈 프로젝트만
> 만들고 끝낸다. 콘솔 등록은 사용자가 준비됐을 때 별도로.

## 실행 순서

### Step 0 — toolchain 사전 검사

`node --version`(24+)을 확인한다. npm은 Node에 동봉되므로 `npm --version`이 정상
응답하는지만 가볍게 본다. 비개발자가 raw 셸 오류를 마주치지 않도록, **Node
없음/24 미만**이면 여기서 멈추고 nvm(`nvm install 24 && nvm use 24`) 또는
https://nodejs.org/en/download/ 를 한 블록으로 안내한 뒤 종료한다(Node를 설치하면
npm도 함께 들어온다).

### 1. 입력 정규화 + 충돌 검사

- `<app-name>`이 비었으면 되묻는다 (예: `"앱 이름을 알려주세요 (예: my-mini-app)"`).
- `package_name = slugify(app_name)` — 소문자 → 비-alphanumeric을 `-`로 →
  연속 `-` 압축 → 양 끝 trim. 빈 문자열/숫자 시작이면 npm 호환 이름을 되묻는다.
- 콘솔 등록 시 `appName`(=`package_name`)에는 별도 규칙이 있다고 보고됐다
  (harness#90 항목3, 2026-08-07 — 이 skill이 콘솔 공식 문서로 직접 검증한 것은
  아니다): 영문 소문자·숫자·하이픈, 63자 이하, `toss` 포함 금지(`apps-in-toss`도
  부분 문자열로 포함하므로 `/toss/` 하나면 된다). CLI도 slugify도 이걸 검사하지
  않아 위반은 콘솔 등록(`miniapp_create`) 단계에서야 거부된다 — scaffold 전에
  여기서 먼저 막는다. 63자 초과이거나 `toss`를 포함하면 시작하지 않고 되묻는다:

  ```
  package_name이 콘솔 appName 규칙(영문 소문자·숫자·하이픈, 63자 이하,
  "toss" 포함 불가)을 위반합니다 — 다른 이름을 알려주세요.
  ```
- 대상은 **현재 cwd 하위 `<package_name>/`**. 이미 존재하고 비어있지 않으면 거부:

  ```
  ./<package_name> 디렉토리가 이미 있습니다. 다른 이름을 쓰거나 디렉토리를
  먼저 정리해주세요. 자동으로 덮어쓰지 않습니다.
  ```

  (create-ait-app도 같은 상황에서 exit 1 하지만, 우리가 먼저 검사해 명확한
  한국어 안내를 준다. CLI에는 `--force`/overwrite가 없다.)

`--local`이면 여기서 **`references/local-template.md`를 Read**해 그 절차(복사 +
토큰 치환 + 디자인 가이드 확인 + install + 안내)로 진행하고, 아래 2~6은 건너뛴다.
예외는 5-B 하나 — 그 문서의 L-3b가 확인 목적으로 같은 스크립트를 부르고, 템플릿이
자산을 프리베이크로 담고 있어 정상이면 전 항목이 skip으로 끝난다.

### 2. scaffold — create-ait-app 비대화형 호출

scaffold는 **명령 하나**다 — CLI가 파일 생성 → `npm install` →
`ait init --app-name <name> --skip-input`(devtools·번들 설정 배선)까지 전부
수행한다. install을 떼어낼 방법은 없다(`--skip-install`은 없다 — 지정하면
`알 수 없는 옵션이에요: --skip-install`로 즉사하고 산출물이 0이다, 0.2.3 실측
2026-08-10, 0.2.8 플래그 표에도 없다). 디자인 가이드 주입(5-B)도 같은 체인에 잇는다 — 별도 단계로
미루면 일부 run이 건너뛰는 실측 사례가 있어, scaffold가 성공한 모든 run이
반드시 주입까지 실행하도록 명령 레벨에서 결합했다:

```bash
npx -y create-ait-app@latest <package_name> --inline --pm npm --template react-ts && bash "<이 skill의 base directory>/../design/scripts/inject-project-guide.sh" "./<package_name>"
```

위 fence는 기본값 `--template react-ts`가 이미 채워진 **그대로 실행되는 명령**이다 —
템플릿 요청이 없으면 한 글자도 바꾸지 않고 실행한다. 바꿔 넣는 자리는 셋뿐이다:
사용자가 다른 템플릿을 지정했으면 `react-ts` 자리에 그 이름, `--tds`면
`--template react-ts`를 통째로 `--tds`로 교체(둘을 같이 주면 CLI가 거부한다 —
이때 주입 스크립트 인자에도 `--tds`를 붙인다), `--sample`을 요구했으면
`--template react-ts` 뒤에 `--sample iap,iaa`를 덧붙인다. **"템플릿 얘기가 없었으니
`--template`은 빼자"가 가장 흔한 낭비였다** — 이전 표기 `(--template <template> |
--tds)`를 모델이 채우지 않고 지워 CLI의 `비대화형 실행에 필요한 값이 빠졌어요`를
받고서야 다시 넣었다(실측: 25 run 중 19가 첫 호출에서 이 왕복을 했고, 그 재시도가
백그라운드 전환·타임아웃 탈선의 출발점이 된 run이 셋이다). 기본값이 fence에 박혀
있으니 이 왕복은 없어야 한다.

> **핀을 쓰지 않는 이유와 남는 위험**: `create-ait-app`은 항상 `@latest`로
> 부르는 것이 정책이다(maintainer 결정 2026-08-10) — 명시 핀은 upstream
> 개선(이 skill이 우회하던 결함의 수정 포함)을 받지 못하게 막는 쪽이 더 컸다.
> `@apps-in-toss/web-framework`의 버전은 이 skill이 정하지 않는다 —
> create-ait-app이 자기 빌드에 박아 둔 정확 버전을
> 쓰므로 "최신 create-ait-app이 고른 wf"를 받는 셈이고, 공개 `latest`보다 뒤일
> 수 있다. 대신 산출물 형상은 매 run 후처리 0(Step 3)이 검사하므로,
> 형상이 바뀌면 조용히 깨지는 대신 그 자리에서 멈춘다. **다만 형상 가드가
> 잡지 못하는 축이 남는다** — CLI의 *동작* 변화(예: `ait init` 자동 호출이
> 사라지거나 배선 대상이 바뀌는 것)는 산출물 파일 목록이 같으면 통과할 수
> 있다. Step 4가 devtools 배선을 실물로 확인하는 이유가 이것이고, 그래도
> 어긋나면 아래 "호출 규칙" 말미의 원칙(CLI 에러를 그대로 전하고 중단)을
> 따른다. `create-ait-app@latest`의 dist-tag 자체가 환경마다 다르게 해석될 수
> 있다는 위험은 아래
> "버전 해석이 실패하는 경우" 항목에서 다룬다.

호출 규칙 (create-ait-app 0.2.3·0.2.8 소스 실측 근거 — 실행 버전은 `@latest` 해석에
따른다):

- **`<package_name>`(positional)·`--pm npm`·`--template react-ts`(또는 `--tds`)를
  전부 명시** — `--inline`이면 이 중 하나만 빠져도 CLI가 **에러로 즉시 중단**한다
  (`assertNonInteractiveArgs`). 프롬프트로 빠지는 게 아니라 실패한다. fence에
  `--template react-ts`가 이미 들어 있다 — 그것을 지우는 것이 곧 이 에러다.
- **스캐폴더는 `create-ait-app` 하나다** — `npm create @apps-in-toss/app` 같은
  변형 명칭을 기억으로 지어내 시도하지 마라(존재하지 않는 패키지라 404가 난다 —
  실측). 위 fence의 `npx -y create-ait-app@latest` 형태 그대로 쓴다.
- **생성 위치는 positional 경로로 지정한다** — `--cwd` 플래그는 없다(알 수 없는
  옵션으로 즉시 에러). 현재 디렉터리에 만들려면 positional에 `.`을 준다
  (`npx -y create-ait-app@latest . --inline …`). positional은 하나만 받는다 —
  두 개 이상이면 `알 수 없는 인수예요`로 거부한다.
- **현재 작업 디렉터리에서 실행한다 — 명령 앞에 `cd`를 붙이지 마라.** 사용자가
  위치를 명시하지 않았다면 세션의 작업 디렉터리가 곧 프로젝트를 둘 자리다.
  scaffold 앞에 `cd /tmp`·`cd ~` 같은 이동을 붙이면 산출물이 사용자가 찾을 수
  없는 곳에 생긴다 — 이후 후처리가 전부 통과해도 사용자 눈에는 결과물이 없는
  실패다(실측 사례 있음). 도구 셸의 cwd가 호출 사이에 리셋되는지 유지되는지는
  **실행 환경마다 다르다 — 어느 쪽도 가정하지 마라**(리셋을 가정하고 상대 경로를
  다시 쓰다 유지 환경에서 어긋난 사례, 그 반대 사례 둘 다 실측됐다). `cd`를 안
  붙이면 cwd는 어느 환경에서든 작업 디렉터리에 머물러 이 차이가 문제되지 않는다 —
  Step 3 이후의 모든 후처리 fence도 `cd` 없이 적힌 그대로(작업 디렉터리 기준
  `./<package_name>/…` 상대 경로) 실행한다. 상대 경로가 갑자기 어긋나면("no such
  file" 등) 경로를 바꿔가며 추측을 거듭하지 말고 `pwd` 한 번으로 현재 위치부터
  확인한다. "Shell cwd was reset" 알림도 확정 신호가 아니다 — 알림과 실제 cwd가
  어긋나는 환경이 있으니, 보이면 `cd`로 되받아치지 말고 프로젝트가
  `./<package_name>`에 있는지부터 재확인한다.
- **`--skills`·`--skip-install`은 존재하지 않는다** — 플래그 표는 값
  플래그 `--pm`·`--sample`·`--template`, 불리언 플래그
  `--help`·`--inline`·`--list-templates`·`--tds`·`--version`이 전부다(0.2.8 dist 실측). 없는
  플래그는 즉시 에러이므로 "혹시 되나" 식으로 붙이지 않는다. `--skills`를 피하던
  이유도 유효하다 — 에이전트용 지식 주입은 이 plugin의 skill 체제가 담당한다.
- **`npx -y`를 쓴다** — `-y`는 npx 최초 실행 시 나오는 설치 확인 프롬프트를
  비대화형으로 넘긴다(non-TTY 세션이 이 프롬프트에서 멈추는 것을 막는다).
- **`&&` 뒤 주입 세그먼트는 조립할 때 빼먹기 가장 쉬운 부분이다 — 생략하지
  마라.** 세그먼트를 뺄 수 있는 경우는 `--no-design-guide` 하나뿐이고, 그 외에는
  위 fence의 두 명령을 그대로 **한 번의 Bash 호출**로 실행한다 — 주입을 뒤로
  미뤄 별도 호출로 쪼개지 않는다. **재시도에도 그대로 적용된다** — scaffold가
  실패해 같은 명령을 다시 돌릴 때도 주입 세그먼트가 붙은 전체 한 줄을
  재실행한다. 스캐폴더 부분만 따로 재실행하면 주입이 조용히 빠진다(실측: 재시도
  run이 체인을 쪼갠 채 주입을 한 번도 실행하지 않았다). 인자 규칙: `--tds`로
  스캐폴드하면 스크립트에도 `--tds`를, `--no-tossface`면 `--no-tossface`를
  덧붙인다.
- **스크립트 경로는 기억으로 지어내지 않는다** — 시스템이 이 skill을 로드할 때
  표시한 base directory 문자열 뒤에 `/../design/scripts/inject-project-guide.sh`를
  그대로 붙인다. 그 문자열을 눈으로 다시 확인하고 옮겨라. `$PWD`·`dirname`
  조합으로 새로 만들거나 `find`로 찾아 헤매지 말고, `$HOME/.claude/skills/…`처럼
  "보통 여기 있겠지" 하는 위치를 써 넣지도 마라 — 그렇게 만든 경로는 실측에서
  대부분 틀렸다(실측: 한 run은 `$HOME` 기반 경로를, 다른 run은 skill 이름
  세그먼트가 빠진 경로를 써서 스크립트를 아예 못 찾았다). "No such file"이 나도
  거기서 포기하지 마라 — Step 3의 디자인 가이드 fence가 **후보 다섯 곳을 스스로
  훑어 스크립트를 다시 찾고, 그래도 없으면 자산 폴백으로 넘어가므로**, 이 자리에서
  경로가 틀렸어도 그 fence가 복구한다.
  스크립트 파일을 Read로 열어 보지 마라 — 내용을 알 필요 없이 이 호출 하나면
  된다. 출력 해석·보고 규칙은 5-B 절.
- **이 규칙과 실제 CLI가 어긋나면 CLI 에러가 최신 규칙이다** — `@latest`가
  여기 적힌 0.2.9보다 새 버전을 받으면 플래그·인자 규칙이 달라질 수 있다.
  그때는 플래그를 빼고 다시 넣어 보는 식으로 우회하지 말고, 에러 문구를 그대로
  사용자에게 전하고 중단한다(그 자리에서 `--help`로 현재 규칙을 확인해 함께
  보고하는 것까지는 해도 된다).

**성공 판정은 exit code로 한다** — 완료 메시지 문구는 버전마다 다르다(0.2.3은
`✅ 프로젝트가 생성됐어요.`를 낸다). 문구 문자열 매칭으로 판정하면 CLI가 문구를
바꿀 때 조용히 오탐한다. 주입 스크립트는 내부가 fail-soft라 항상 exit 0이므로
`&&` 체인이 exit code의 의미를 바꾸지 않는다 — 0이 아니면 scaffold/install
실패다. 에러로 끝나면 stderr를 그대로 사용자에게 전하고 중단한다:

- **완전 오프라인**으로 보이면 `--local` 폴백을 안내한다.
- **`create-ait-app@latest`의 버전 해석이 실패하는 경우** — 일부 사내망 프록시
  환경은 특정 버전·dist-tag를 못 내려주거나, `latest`를 공개 registry와 다르게
  준다(최신을 숨겨 구버전을 주기도 하고 공개에 없는 prerelease를 주기도 한다 —
  그래서 해석 실패를 "그 버전이 없다"로 단정하면 안 된다). 공개
  미러(`registry.npmmirror.com`)·jsdelivr로 교차 확인하고, 그 프로젝트 전용
  `.npmrc`의 registry override나 `--local` 폴백으로 우회한다(호스트명을
  하드코드하지 않는다).
- **scaffold 단계 install이 실패한 경우** — 0.2.4부터 CLI는 생성 디렉터리를
  지우지 않고 남긴 채 `cd <dir>` 이어하기 안내를 낸다(0.2.8 실측). 이 실패는
  `ait init` **앞**에서 난 것이라 안내대로 install만 다시 하면 devtools와
  `apps-in-toss.config.ts`가 없는 프로젝트가 된다. 에러를 그대로 보고하고,
  원인을 고친 뒤 `npm --prefix ./<package_name> install`로 install을 마치고
  §2-1 2번의 `ait init` 재실행으로 이어 가거나, 선택지로 `--local` 폴백을
  안내한다. 주입 세그먼트는 그 뒤에 따로 실행한다(`bash "<base>/../design/scripts/inject-project-guide.sh" "./<package_name>"`).
  pnpm(11)에서 `--tds`가 `ERR_PNPM_IGNORED_BUILDS: esbuild`로 실패한 경우는
  `pnpm-workspace.yaml`의 `allowBuilds`에 `esbuild: true`를 추가하고
  `pnpm install`을 다시 한 뒤 같은 `ait init` 재실행을 한다(0.2.8 재현으로
  복구 확인).
- **`package.json`의 `@apps-in-toss/web-framework`는 create-ait-app이 박은
  정확 버전이다**(자기 저장소 `.github/version-pins/package.json`의 핀을
  빌드에 넣는다. 0.2.9 실측 `"3.8.0"`). 그래서 wf 버전은
  실행된 create-ait-app 버전에 따라가고, `create-ait-app@latest` 해석이 환경마다
  다르면 wf도 따라 달라진다. 종전 CLI는 `"latest"` 리터럴을 써서 install 시점마다
  달랐다(실측: 공개 `latest`가 `3.0.1`인 시점에 `3.0.0`이 설치됨). 검증·측정
  맥락에서는 실제로 설치된 버전을 `npm --prefix ./<package_name> ls
  @apps-in-toss/web-framework`로 확인해 항상 함께 기록한다. 어느 경로든 build
  전에 잡는 게이트는 후처리 0(Step 3)의 major 확인이다 — 아래 그 절차를 반드시
  거친다.
- **온라인인데 특정 transitive dep 설치만 실패하는 경우**(프록시/미러
  registry가 일부 버전을 못 주는 환경 — 실측)는 `--local`도 같은 vite
  툴체인을 설치하다 같은 문제를 밟을 수 있다. 디렉터리가 남아 있다면(=
  `ait init` 단계에서 죽은 경우) `package.json`에 `overrides`를 더해 문제
  패키지를 미러에 존재하는 인접 버전으로 고정한 뒤 `npm --prefix
  ./<package_name> install`을 재실행하는 회피를 안내한다. scaffold
  단계에서 죽었다면 위 실패 항목으로 처리한다.

  어느 인접 버전이 미러에 실재하는지는 후보 버전의 tarball URL을 `curl -I`로
  HEAD 요청해 200/404로 확인한다(실측: `baseline-browser-mapping@2.11.7`이
  404, 인접한 `2.11.1`이 200) — 에러 메시지의 registry URL 패턴에서 버전만
  바꿔가며 확인하면 된다:

  ```bash
  curl -sI "<실패한 tarball URL에서 버전만 인접 버전으로 치환>" | head -1
  ```

### 2-1. 설치 상태 수렴

**scaffold가 exit 0으로 끝나도 의존성이 다 깔렸다는 뜻은 아니다.** CLI는 install을
두 번 한다 — 자기 `npm install` 한 번, `ait init`이 devtools를 배선하며 한 번. 이
중 **`ait init` 쪽 실패는 CLI가 삼킨다**: `⚠️ ait init 실행에 실패했어요: …`
경고만 찍고 `✅`와 exit 0을 낸다(0.2.3 dist 실측, 0.2.8 재현에서도 같다).
그래서 scaffold 직후 **항상** 아래 수렴 절차를 돈다(출력 파싱에 의존하지 않는다).
npm은 postinstall을 기본 실행하므로 남는 실패 원인은 네트워크·registry 문제로
좁혀진다.

절차:

1. 설치 상태를 확인 겸 수렴시킨다 — 이미 완전히 설치돼 있으면 사실상 no-op이고,
   미설치·부분설치면 이 명령이 마저 채운다:

   ```bash
   npm --prefix ./<package_name> install
   ```

   이 명령이 `ETARGET`(`No matching version found for
   @apps-in-toss/devtools@…`)으로 죽으면 아래 3번으로 간다 — 원인도 복구도
   거기 있다.
2. install이 정상화된 뒤 `./<package_name>/apps-in-toss.config.ts`가 없으면
   `ait init`이 중간에 죽은 것이므로, CLI가 안내하는 그대로 한 번 재실행한다
   (이제 install이 정상이라 성공할 가능성이 높다):

   ```bash
   (cd ./<package_name> && npx -y ait init --app-name <package_name> --skip-input)
   ```

   그래도 실패하면 stderr를 그대로 보고하고, 아래 Step 3(형상 가드)에서
   중단된다.
3. **devtools가 devDependencies 문자열이 아니라 실물로 설치됐는지 확인한다.**
   `--no-devtools`가 지정됐으면 이 확인도 재핀도 하지 않는다 — 배선을 떼어낼
   것이므로 Step 4의 4-b(배선 해제)가 받는다.
   `ait init`은 `@apps-in-toss/devtools`를 CLI 자기 버전에 맞춘
   `^<version>`으로 devDependencies에 **먼저 쓰고 나서** `npm install`을 부르는
   순서라, 그 버전이 공개 npm에 아직 없으면 install이 `ETARGET`으로 실패해도
   문자열은 파일에 그대로 남는다(cli가 "changesets fixed 그룹" 전제로 자기
   버전을 그대로 쓰는데, devtools만 별도 changeset 그룹에도 걸려 있어 발행이
   지연되면 이 전제가 깨진다 — 문자열 검사만으로는 이 어긋남을 못 잡는다).
   그래서 1번의 install이 exit 0이어도 실물 로드까지 확인한다:

   ```bash
   node -e "require.resolve('@apps-in-toss/devtools/unplugin', { paths: ['./<package_name>'] })"
   ```

   exit 0이면 실물이 있는 것이니 넘어간다. `Cannot find module`로 실패하면
   `npm --prefix ./<package_name> ls @apps-in-toss/devtools`로 원인을 눈으로 확인만
   해 두고, 순서는 건너뛰지 않는다 — Step 3(형상 가드)을 먼저 통과한 뒤 Step 4에
   들어가 거기서 "devtools 재핀 폴백"을 맨 먼저 수행한다. 여기서 바로 재핀하지
   않는 이유는 Step 4가 devDep 문자열·번들러 배선까지 한 번에 보고 판단하기
   때문이고, Step 3을 건너뛰지 않는 이유는 그 형상 가드가 후처리 전체의 전제라
   어긋난 형상 위에서는 재핀도 헛돌기 때문이다.

### 3. 후처리 0 — 형상 가드 + 디자인 가이드 주입

아래 Step 4·5의 전제는 "`ait init`이 끝까지 돌아 번들 설정과 빌드 스크립트가
배선된 산출물"이다. **핀이 없으므로 이 전제는 매 run 확인한다** — 새 버전이
산출물 형상을 바꾸면 여기서 멈춰야, 어긋난 형상 위에서 후처리가 헛돌지 않는다.

형상 확인과 디자인 가이드 주입은 **한 fence가 함께** 한다. 나눠 두면 형상 fence는
매번 실행되는데 주입 쪽만 조용히 빠진다(실측: 열 run 중 셋 — 아래 "디자인 가이드 판정
읽기" 참고). 실행 여부를 판단에 맡기면 확률적으로 빠지므로, 빠질 수 있는 fence를
없앴다.

**고칠 자리는 1행의 값 넷과 경로 문자열 하나뿐이다**: `D`(`--no-design-guide`면
1)·`T`(`--tds`면 1)·`N`(`--no-tossface`면 1)·`P=`의 `<package_name>`, 그리고
`<이 skill의 base directory>`(같은 문자열이 2군데 나오니 둘 다 Step 2와 같은 규칙으로
채운다). 그 밖에는 한 글자도 고치지 마라 — 특히 `bash "$G" "$P" "$@"` 두 자리에
플래그를 손으로 덧붙이지 마라. 스크립트 인자는 1행의 `T`/`N`에서 셸이 파생한다.

```bash
{ D=0; T=0; N=0; P="./<package_name>"; MK='ait:design-guide'; R=""; OK=1; G=""; S=""; DG=""; TF=""; TE=""; MV=""; E=""; IF=0
test -f "$P/apps-in-toss.config.ts" && node -e "const p=require(require('node:path').resolve('$P','package.json')); process.exit((p.dependencies?.['@apps-in-toss/web-framework'] && /\bait build\b/.test(p.scripts?.build ?? '')) ? 0 : 1)" && echo "형상 일치" || echo "형상 불일치"
if [ "$D" = 1 ]; then echo "디자인 가이드 없음(--no-design-guide — 닫힘 ②)"
elif [ ! -d "$P" ] || [ ! -f "$P/package.json" ]; then echo "디자인 가이드 주입 보류(프로젝트 경로 아님=$P) — 닫힘이 아니다: 경로 치환을 고쳐 이 fence를 다시 실행한다"
else
touch "$P/.ait-design-guide-failed" 2>/dev/null
if [ "$T" = 1 ] && [ "$N" = 1 ]; then set -- --tds --no-tossface; elif [ "$T" = 1 ]; then set -- --tds; elif [ "$N" = 1 ]; then set -- --no-tossface; else set --; fi
dgico() { if node -e "process.exit(require(require('node:path').resolve('$P','package.json')).dependencies?.react?0:1)" 2>/dev/null; then [ -s "$P/src/components/icons.tsx" ]; else [ -s "$P/src/assets/icons/close.svg" ]; fi; }
dgent() { for C in src/index.css src/main.tsx src/main.ts src/index.tsx src/index.ts index.tsx index.ts index.html; do grep -qs 'styles/base.css' "$P/$C" && return 0; done; for C in src/index.css src/main.tsx src/main.ts src/index.tsx src/index.ts index.tsx index.ts index.html; do [ -f "$P/$C" ] && return 1; done; return 0; }
dgok() { grep -qs "<!-- $MK v" "$P/AGENTS.md" && grep -qs "<!-- $MK v" "$P/CLAUDE.md" && [ -s "$P/docs/design-guide.md" ] && { [ "$T" = 1 ] || { [ -s "$P/src/styles/tokens.css" ] && [ -s "$P/src/styles/base.css" ] && dgico && dgent; }; }; }
if dgok; then rm -f "$P/.ait-design-guide-failed"; echo "디자인 가이드 있음(이미 있음)"
else
for C in "<이 skill의 base directory>/../design/scripts/inject-project-guide.sh" "$CLAUDE_PLUGIN_ROOT/shared/skills/design/scripts/inject-project-guide.sh" "$CLAUDE_PLUGIN_ROOT/skills/design/scripts/inject-project-guide.sh" .claude/skills/design/scripts/inject-project-guide.sh "$HOME/.claude/skills/design/scripts/inject-project-guide.sh"; do
[ -f "$C" ] && { G="$C"; break; }
done
[ -n "$G" ] && { bash "$G" "$P" "$@"; dgok || bash "$G" "$P" "$@"; }
if dgok; then rm -f "$P/.ait-design-guide-failed"; echo "디자인 가이드 있음(스크립트로 보완됨 — 스크립트=$G)"
else
for C in "<이 skill의 base directory>/../design/assets/project" "$CLAUDE_PLUGIN_ROOT/shared/skills/design/assets/project" "$CLAUDE_PLUGIN_ROOT/skills/design/assets/project" .claude/skills/design/assets/project "$HOME/.claude/skills/design/assets/project"; do
[ -s "$C/memory-digest.md" ] && [ -s "$C/design-guide.md" ] && { [ "$T" = 1 ] || { [ -s "$C/tokens.css" ] && [ -s "$C/base.css" ] && [ -s "$C/icons.tsx" ] && [ -s "$C/icons/close.svg" ]; }; } && { S="$C"; break; }
done
if [ -z "$S" ]; then
echo "디자인 가이드 주입 실패(스크립트=${G:-못찾음} · 자산=못찾음)"
echo "완료 블록에 그대로 넣을 줄: 디자인 가이드: 주입 실패 — /ait:design으로 나중에 넣을 수 있습니다"
else
DG="$S/memory-digest.md"
if [ "$T" = 1 ]; then
TF="$(mktemp "${TMPDIR:-/tmp}/ait.XXXXXX" 2>/dev/null)"
if [ -n "$TF" ] && awk '/^아이콘: React/{print "이 프로젝트는 TDS 기반이다 — 색·크기·아이콘은 TDS 컴포넌트가 주는 것을 쓴다(위 토큰 목록과 아이콘 파일 경로는 이 프로젝트에 없다)."; next} /^아이콘: vanilla/{print "1층 하드 규칙은 플랫폼 제약이라 그대로 적용된다 — 꺾쇠·닫기·검색은 TDS 아이콘 컴포넌트로 충족하고, 텍스트 글리프로 대체하는 것은 여전히 금지다."; next} {print}' "$S/memory-digest.md" > "$TF" 2>/dev/null && [ -s "$TF" ]; then DG="$TF"; else DG=""; OK=0; R="$R digest=FAIL"; fi
fi
mkdir -p "$P/docs" 2>/dev/null
[ -f "$P/docs/design-guide.md" ] || cp "$S/design-guide.md" "$P/docs/design-guide.md" 2>/dev/null
[ -f "$P/docs/design-guide.md" ] || { OK=0; R="$R guide=FAIL"; }
if [ "$T" = 1 ]; then R="$R css=tds-skip icons=tds-skip entry=tds-skip"; else
mkdir -p "$P/src/styles" 2>/dev/null
[ -f "$P/src/styles/tokens.css" ] || cp "$S/tokens.css" "$P/src/styles/tokens.css" 2>/dev/null
[ -f "$P/src/styles/tokens.css" ] || { OK=0; R="$R tokens=FAIL"; }
[ -f "$P/src/styles/base.css" ] || cp "$S/base.css" "$P/src/styles/base.css" 2>/dev/null
[ -f "$P/src/styles/base.css" ] || { OK=0; R="$R base=FAIL"; }
if [ "$N" = 1 ] && grep -q 'tossface\.css' "$P/src/styles/base.css" 2>/dev/null; then
sed -i.aitbak -e '/tossface\.css/d' -e 's/"Tossface", -apple-system/-apple-system/' "$P/src/styles/base.css" 2>/dev/null; rm -f "$P/src/styles/base.css.aitbak"
grep -q 'tossface\.css' "$P/src/styles/base.css" 2>/dev/null && R="$R tossface=FAIL" || R="$R tossface=off"
fi
if node -e "process.exit(require(require('node:path').resolve('$P','package.json')).dependencies?.react?0:1)" 2>/dev/null; then
mkdir -p "$P/src/components" 2>/dev/null
[ -f "$P/src/components/icons.tsx" ] || cp "$S/icons.tsx" "$P/src/components/icons.tsx" 2>/dev/null
[ -f "$P/src/components/icons.tsx" ] || { OK=0; R="$R icons=FAIL"; }
else
mkdir -p "$P/src/assets/icons" 2>/dev/null; IF=0
for I in chevron-down chevron-left chevron-right chevron-up close search; do
[ -f "$P/src/assets/icons/$I.svg" ] || cp "$S/icons/$I.svg" "$P/src/assets/icons/$I.svg" 2>/dev/null
[ -f "$P/src/assets/icons/$I.svg" ] || IF=1
done
[ "$IF" = 0 ] || { OK=0; R="$R icons=FAIL"; }
fi
E=""
for C in src/index.css src/main.tsx src/main.ts src/index.tsx src/index.ts index.tsx index.ts; do
[ -f "$P/$C" ] && { E="$P/$C"; break; }
done
if [ ! -f "$P/src/styles/base.css" ]; then R="$R entry=skip"
elif [ -n "$E" ] && grep -q 'styles/base.css' "$E" 2>/dev/null; then R="$R entry=skip"
elif [ -n "$E" ] && [ "${E%index.css}" != "$E" ]; then
TE="$(mktemp "${TMPDIR:-/tmp}/ait.XXXXXX")" && printf '%s\n' "@import './styles/base.css';" | cat - "$E" > "$TE" && mv "$TE" "$E" && R="$R entry=index.css" || { OK=0; R="$R entry=FAIL"; }
elif [ -n "$E" ] && { [ -f "$P/src/vite-env.d.ts" ] || [ -n "$(find "$P" -maxdepth 1 -name 'tsconfig*.json' -exec grep -l '"vite/client"' {} + 2>/dev/null)" ]; }; then
TE="$(mktemp "${TMPDIR:-/tmp}/ait.XXXXXX")" && printf '%s\n' "import './styles/base.css';" | cat - "$E" > "$TE" && mv "$TE" "$E" && R="$R entry=js" || { OK=0; R="$R entry=FAIL"; }
elif [ -f "$P/index.html" ] && ! grep -q 'styles/base.css' "$P/index.html" 2>/dev/null; then
TE="$(mktemp "${TMPDIR:-/tmp}/ait.XXXXXX")" && awk '/<\/head>/&&!d{print "    <link rel=\"stylesheet\" href=\"/src/styles/base.css\" />";d=1}{print}' "$P/index.html" > "$TE" && mv "$TE" "$P/index.html" && R="$R entry=index.html" || { OK=0; R="$R entry=FAIL"; }
else R="$R entry=skip"; fi
fi
if [ "$OK" = 1 ] && [ -n "$DG" ]; then
MV="$(grep -o "$MK v[0-9]*" "$P/AGENTS.md" 2>/dev/null | head -1)"
if [ -n "$MV" ]; then R="$R agents=skip($MV)"
elif { [ -s "$P/AGENTS.md" ] && printf '\n'; printf '<!-- %s v2 -->\n' "$MK"; cat "$DG"; printf '<!-- /%s -->\n' "$MK"; } >> "$P/AGENTS.md" 2>/dev/null; then R="$R agents=new"
else OK=0; R="$R agents=FAIL"; fi
[ "$OK" = 1 ] && { grep -qs "$MK v" "$P/CLAUDE.md" || { { [ -s "$P/CLAUDE.md" ] && printf '\n'; printf '<!-- %s v2 -->\n@AGENTS.md\n<!-- /%s -->\n' "$MK" "$MK"; } >> "$P/CLAUDE.md" 2>/dev/null || { OK=0; R="$R claude=FAIL"; }; }; }
fi
rm -f "$TF" 2>/dev/null
if [ "$OK" = 1 ] && dgok; then rm -f "$P/.ait-design-guide-failed"; echo "디자인 가이드 있음(자산 폴백으로 보완됨 —$R)"
else
echo "디자인 가이드 주입 실패(스크립트=${G:-못찾음} · 자산 폴백 —$R)"
echo "완료 블록에 그대로 넣을 줄: 디자인 가이드: 주입 실패 — /ait:design으로 나중에 넣을 수 있습니다"
fi
fi
fi
fi
fi; }
```

**이 fence는 통째로 한 번의 Bash 호출로 실행한다.** 검사 항목을 추려 자기 식으로 다시
조립하지 마라 — 자체 조립한 run이 끝 세그먼트만 빼먹은 것이 실측됐다(Step 2 fence를
한 줄로 만든 것과 같은 이유다). 앞을 자르든 뒤를 자르든 셸 문법 오류로 죽는다(그게
안전장치다). 실행할지 말지도 판단하지 마라 — 디자인 가이드가 이미 들어가 있으면 fence가
스스로 `있음(이미 있음)`을 찍고 아무것도 하지 않는다.

fence는 두 줄을 찍는다. 첫 줄이 형상 판정, 둘째 줄이 디자인 가이드 판정이다.

형상은 세 가지를 본다: `apps-in-toss.config.ts` 존재, `dependencies`의
`@apps-in-toss/web-framework`, `scripts.build`의 `ait build`. 앞뒤 둘은 `ait init`이
만들고(create-ait-app dist에는 이 설정 파일도 `build` 스크립트도 쓰는 코드가
없다) 가운데 하나만 create-ait-app이 직접 쓴다 — 이 부분이 "CLI가 자기 몫과
`ait init` 몫을 둘 다 끝냈는가"를 판정한다. 디자인 가이드 판정은 이 가드와 별개라
바로 아래 "하나라도 실패하면 중단"의 대상이 **아니다**(fail-soft). `형상 불일치`로
중단할 때 디자인 가이드 줄을 중단 보고에 섞지 마라 — 그 줄은 Step 6의 완료 블록에서만
쓴다.

- **통과해도 아직 Step 4로 가지 않는다** — 바로 아래 **wf major 확인 → `ait` bin
  확인** 두 서브체크까지 이어서 하고, 셋을 다 통과한 뒤에 Step 4로 간다.
- **하나라도 실패하면** Step 4·5를 진행하지 않고 즉시 중단한다. §2-1 2번의
  `ait init` 재실행을 아직 안 했다면 그것만 먼저 시도하고, 그러고도 실패하면
  사용자에게 한 블록으로 보고하고 멈춘다:

  ```
  scaffold 산출물이 예상한 형상(apps-in-toss.config.ts + package.json의
  @apps-in-toss/web-framework 의존성 + ait build를 포함한 build 스크립트)과
  다릅니다 — create-ait-app이 새 버전에서 산출물 형상을 바꾼 것으로 보입니다.
  이후 후처리를 진행하지 않고 여기서 중단합니다.
  ```

**설치된 `@apps-in-toss/web-framework`의 major도 함께 확인한다** — 형상 파일
체크만으로는 부족하다. 현재 create-ait-app은 wf를 정확 버전으로 박지만,
`create-ait-app@latest`가 구버전으로 해석되는 환경(프록시가 최신을 숨기는 경우)이나
`"latest"` 리터럴을 쓰던 종전 CLI가 내려온 경우에는 2.x가 조용히 들어올 수 있다(npm의
`latest` dist-tag가 3.x 출시 이후에도 한동안 2.10.8을 가리킨 어긋남 — harness#90
항목1, 2026-08-07 실측). 아래 `ait` bin 확인은 이걸 못 잡는다(2.10.8도 `ait` bin을
준다):

```bash
node -p "require('./<package_name>/node_modules/@apps-in-toss/web-framework/package.json').version"
```

(npm의 flat node_modules를 전제한 경로다 — 모노레포 등 형상이 다르면 이 경로도
깨진다. 아래 devtools `sdkVersion` auto-detect와 같은 부류의 제약이다.)

major가 `3`이 아니면(예: `2.10.8`) **사용자 응답을 기다리지 않고 지금 바로**
아래를 직접 수행한다 — 읽어주고 끝내는 안내문이 아니라 실행하는 복구 절차다.
`./<package_name>/package.json`을 `Edit`으로 열어 `"@apps-in-toss/web-framework"`의
값(`"latest"` 리터럴이든 2.x 정확 버전이든)을 `"^3.0.2"`로 고치고,
`npm --prefix ./<package_name> install`을 실행한 뒤, 위 major 확인 커맨드를 다시
돌려 `3.`으로 시작하는지 본다. **3.x가 재확인되기 전에는 아래 `ait` bin 확인
이하로 넘어가지 않는다** — 재확인 없이 진행하면 이 가드가 없는 것과 같다.

세 단계를 마친 뒤, 사용자에게는 결과만 한 블록으로 보고한다:

```
설치된 @apps-in-toss/web-framework가 <원래 출력된 버전>(2.x)이었습니다 — 정본
산출물은 3.x입니다(구버전 create-ait-app이나 registry 응답 어긋남으로 2.x가
들어오는 알려진 사례가 있습니다, harness#90). package.json을 "^3.0.2"로 고치고
재설치해 3.x 설치를 확인했습니다.
```

재설치 후에도 major가 `3`이 아니면(예: 재설치가 여전히 2.x를 해석하는 등) 더
이상 자동 재시도하지 않고 중단해, 재확인 결과를 그대로 사용자에게 보고한다.

major 확인이 1차 게이트다. 통과했으면 같은 자리에서 `ait` bin 존재도 보조로
확인한다 — 단독으로는 2.x/3.x를 구분하지 못하지만(2.10.8도 `ait` bin을 제공한다
— harness#90 실측, `granite` bin이 wf 2.x 전용이다) major 확인 이후엔 설치 과정의
다른 이상으로 bin이 안 생겼는지 잡아준다. 이게 없으면 이후 `npm run
build`/`ait build`가 조용히 실패한 채로 후처리가 계속된다. 위 승격은 "하지 말아야
할 것"의 2.x 강등 금지와 모순되지 않는다 — 잘못 설치된 2.x를 정본 3.x로 올리는
것이다:

```bash
ls ./<package_name>/node_modules/.bin/ait
```

없으면 중단하고 `npm --prefix ./<package_name> explain @apps-in-toss/web-framework`
출력을 사용자에게 보고한다. **`@apps-in-toss/web-framework`를 2.x로 강등하는
명령은 어떤 형태로도 실행하지 않는다** — 정본 산출물은 3.x이고, 강등은 그걸
되레 깨뜨린다.

**디자인 가이드 판정 읽기** — 위 fence의 둘째 줄이 정본이다. 여기서 따로 실행할
블록은 없다. 종전에는 같은 내용의 블록이 이 자리에 따로 있었고, 실측에서 빠진 것이
바로 그것이다 — 열 run 중 셋이 형상 fence·wf major·`ait` bin을 정상 수행하고 네
번째인 그 블록만 건너뛰었다. 그래서 블록을 형상 fence에 합쳐 Step 3에 남는 셸 호출을
하나로 줄였다.

그 한 줄이 탐지·스크립트 경로 탐색·호출·재시도·자산 폴백·최종 판정의 결과를 전부
담는다. 판정과 보완을 여러 턴에 걸쳐 조율하게 하면 확률적으로 누락된다 — 자산 폴백이
5-B에 있던 시절엔 다섯 run 중 둘이 자산이 멀쩡히 있는데도 폴백을 시도하지 않고 실패로
닫았고, 폴백을 블록 안으로 들인 뒤에는 블록 자체가 열 run 중 셋에서 실행되지 않았다.
고친 이동과 실제로 남아 있던 이동이 달랐던 것이라, 이번에는 이동이 아니라 fence 수를
줄였다.

이 fence는 어떤 경로로도 `디자인 가이드`로 시작하는 줄을 **정확히 하나** 찍는다. 그
줄이 안 보이면 fence가 실행되지 않은 것이니 통째로 다시 실행한다. 괄호 안이 원인을
함께 알려준다 — `스크립트=<경로>`는 스크립트를 찾아 돌렸다는 뜻이고
`스크립트=못찾음`은 다섯 후보 어디에도 없었다는 뜻이다.

- `디자인 가이드 있음(이미 있음 | 스크립트로 보완됨 — … | 자산 폴백으로 보완됨 — …)`
  — 닫힘 ①로 진행한다.
- `디자인 가이드 없음(--no-design-guide — 닫힘 ②)` — 닫힘 ②. 완료 블록에서 가이드
  줄 자체를 인쇄하지 않는다.
- `디자인 가이드 주입 실패(…)` — 닫힘 ③. **둘째 줄이 완료 블록에 그대로 넣을
  문장이다** — 그때 새로 짓지 말고 그 줄을 옮긴다. 더 반복하지 말고, 손으로 파일을
  만들지 마라.
- `디자인 가이드 주입 보류(프로젝트 경로 아님=…)` — **닫힘이 아니다.** 아무것도 쓰지
  않고 멈춘 것이니 경로 치환을 고쳐 fence를 다시 실행한다.

`있음`은 **캐리어 마커와 산출물이 전부 자리에 있을 때만** 찍힌다 — `AGENTS.md`와
`CLAUDE.md`의 마커, `docs/design-guide.md`, 그리고 비-TDS면 `tokens.css`·`base.css`·
프로젝트 계열에 맞는 아이콘(React면 `icons.tsx`, vanilla면 svg)·entry 배선까지 실재를
본다. 정본 스크립트는 개별 항목이 실패해도 마커를 붙이므로 마커만으로는 성공이
아니고, fence가 그걸 알고 산출물 실재로 다시 판정한다. 파일 몇 개만 들어갔는데 성공으로
보고되는 경로는 없고, 그렇게 걸린 형상은 그 자리에서 폴백이 채워 복구한다 — entry
배선만 빠진 프로젝트에 fence를 다시 돌리면 배선이 붙는다. 실패는 프로젝트 안 `.ait-design-guide-failed` 흔적
파일로도 남아, 완료 블록 직전 Step 5의 `.gitignore` fence가 같은 문장을 한 번 더
찍는다.

**폴백이 산문 절차가 아니라 이 fence 안에 있는 이유** — 프로젝트로 옮겨지는 내용은
`cp`/`cat`이 원본 바이트를 그대로 넘긴 것이다. 원본을 열어 옮겨 적는 절차를 산문으로
맡기면 확률적으로 어긋난다(실측: 스크립트 파일만 지우고 `design/assets/project/`는
멀쩡히 남겨 둔 조건에서 수동 폴백을 시도한 두 run이 **둘 다 원본을 한 번도 `Read`하지
않고 지어냈다**. 한 run은 `find … -name "tokens.ts"`로 확장자를 잘못 짚어 빈손이 되자
그대로 창작해 파일명·Tossface CDN URL·팔레트가 전부 원본과 달랐는데 완료 보고에는 그
창작 팔레트를 "토스 공식 색상"이라고 적었고, 다른 run은 검색 시도 자체 없이 바로
`mkdir`+`Write`로 지어내 `--space-1`~`--space-6`이 통째로 빠졌다).

**어느 실패든 대체물을 지어내지 마라.** 토큰 값·하드 규칙·아이콘·다이제스트 본문의
정본은 `design` skill의 `assets/project/` 파일이고, 그 바이트를 옮기지 못했으면 주입은
실패한 것이다 — 그럴듯한 팔레트나 규칙을 창작해 채우지 말고 닫힘 ③으로 정직하게
닫아라(실측: 한 run이 원본을 한 번도 읽지 않은 채 임의 팔레트로 파일 5종을 지어내고
완료 보고에는 `디자인 가이드: 포함`으로 적었다 — 파일은 있지만 프로젝트가 따를 기준은
없는 상태이므로, 이것은 성공이 아니라 위장이다). 지어낸 대체물을 정규 산출물처럼
보고하는 것은 금지다. **이 fence 밖에서
`tokens.css`·`base.css`·`icons.tsx`·아이콘 svg·`docs/design-guide.md`·`AGENTS.md`의
`ait:design-guide` 블록을 손으로 `Write`하는 것도 같은 금지에 들어간다** — 이
산출물들은 이 fence의 `cp`/`cat` 결과로만 존재해야 한다. fence가 셸 오류로 죽었으면
그대로 한 번 더 실행하고, 그래도 죽으면 손으로 만들지 말고 닫힘 ③으로 간다 — 1행의
흔적 `touch`는 이미 실행됐으므로 fence가 통째로 죽어도 Step 5가 실패 문장을 완료
블록으로 실어 나른다.

캐리어 마커는 여는 줄 `<!-- ait:design-guide v3 -->`과 닫는 줄
`<!-- /ait:design-guide -->`이고, grep 가드가 네 상황을 전부 처리한다 — 파일 없음(새로
생성)·마커 없음(파일 끝에 append, 기존 내용 무손상)·`v3`(skip)·다른 버전(skip). 요약에
v2가 아닌 버전이 찍히면(`agents=skip(ait:design-guide v0)`) 덮어쓰지 말고 "가이드
버전이 다릅니다 — `/ait:design`으로 갱신할 수 있습니다"만 알린다. `AGENTS.md`에
들어가는 본문은 `memory-digest.md` 원문 그대로다(한 글자도 고쳐 쓰지 않는다).
`CLAUDE.md`에는 `@AGENTS.md` 한 줄만 넣는다 — 같은 본문을 두 파일에 넣으면 세션마다
두 배로 실린다. entry 배선 우선순위는 `src/index.css` 최상단 `@import` → JS entry 첫
import → `index.html`의 `<link>`이고, 첫 번째로 해당되는 하나만 쓴다.

이 판정은 Step 2가 백그라운드로 넘어갔다 끝난 경우에도 건너뛰지 않는다 — 출력
줄(`5-B:`)을 놓쳤어도 파일 실재가 최종 판정이다. 스크립트는 멱등이라 이미 주입된
프로젝트에 다시 돌아도 전 항목 skip으로 끝나 무해하다.

**이 판정이 닫히기 전에는 Step 6의 완료 블록을 인쇄하지 않는다.** 닫힘은 세
가지뿐이다: ① `있음` 확인, ② `--no-design-guide`의 의도된 `없음`, ③ 실패 —
③은 완료 보고에 `디자인 가이드: 주입 실패 — /ait:design으로 나중에 넣을 수 있습니다`
줄을 반드시 포함해야 닫힌 것이다. **실패 항목을 완료 보고에서 조용히 빼고 성공처럼
보고하는 것도, 성공도 실패도 말하지 않고 항목 자체를 통째로 빼는 것도 금지다**(실측:
한 run은 완료 표에서 그 항목만 누락시켰고, 다른 run은 판정을 정확히 찍고도 13턴 뒤
완료 보고에서 "디자인 가이드"를 한 번도 쓰지 않았다). 그래서 이 문장을 기억에 맡기지
않는다 — 위 fence가 실패 시 흔적 파일을 남기고, Step 5의 `.gitignore` fence가 완료 블록
직전에 그 흔적을 보고 같은 문장을 한 번 더 찍는다.

### 4. 후처리 B — devtools 배선 확인 (브라우저 dev 활성화)

배선은 **CLI(`ait init`)가 이미 한다** — 이 단계는 그 결과를 확인하고, 안 돼
있을 때만 직접 배선한다. 먼저 세 가지를 본다:

```bash
node -e "const p=require('./<package_name>/package.json'); console.log('devDep:', p.devDependencies?.['@apps-in-toss/devtools'] ?? '(없음)')"
ls ./<package_name>/vite.config.*
node -e "require.resolve('@apps-in-toss/devtools/unplugin', { paths: ['./<package_name>'] })" && echo "실물: 있음" || echo "실물: 없음"
```

두 번째로 나온 그 설정 파일을 `Read`해 `@apps-in-toss/devtools/unplugin` import와
`plugins` 배열의 `aitDevtools.vite(...)` 항목이 있는지 확인한다(실측 2026-08-07
산출물: devDependencies에 `"@apps-in-toss/devtools": "^3.0.2"`, `vite.config.ts`에
`import aitDevtools from "@apps-in-toss/devtools/unplugin";` +
`plugins: [aitDevtools.vite(), react()]`).

- **devDep·unplugin·실물이 셋 다 있으면 이 단계는 끝이다** — 아무것도 바꾸지 않고
  Step 5로 넘어간다. CLI가 만든 형태(`aitDevtools.vite()` 인자 없음 등)를 취향으로
  고쳐 쓰지 않는다.
- **devDep 문자열은 있는데 실물이 없으면** — `ait init`이 package.json에
  `@apps-in-toss/devtools`를 쓰고 나서 `npm install`을 부르는 순서라 그
  install만 실패해도 문자열은 남는다(cli가 자기 버전에 맞춰 쓴 `^<version>`이
  공개 npm에 아직 없는 경우가 실제 원인 — 배경은 아래 "devtools 재핀 폴백"
  참고). 이땐 vite.config 확인으로 넘어가지 말고 먼저 아래 "devtools 재핀
  폴백"부터 수행한다 — `--no-devtools`면 해당 없이 아래 "배선 해제"로 간다.
- **devDep·unplugin 중 하나라도 없으면(재핀 이후에도)** 아래 4-a 폴백을 순서대로
  수행한다.
- **`--no-devtools`가 지정됐으면** 확인 결과와 무관하게 아래 "배선 해제" 절로
  간다.

#### devtools 재핀 폴백 — devDep 문자열은 있는데 실물이 없을 때

`@apps-in-toss/cli`(`ait init`을 수행하는 실체)는 devtools를 **자기 자신의
버전**에 맞춰 `^<cli 버전>`으로 devDependencies에 적는다 — cli·web-framework·
devtools가 changesets fixed 그룹으로 함께 발행된다는 전제다. 이 전제는 devtools가
그 fixed 그룹과 별도의 ignore 설정에도 동시에 걸려 발행이 지연되면 깨진다 — cli는
이미 새 버전을 냈는데 그 버전의 devtools가 공개 npm에 없으면, `npm install`이
`ETARGET`(`No matching version found for @apps-in-toss/devtools@^<cli 버전>`)으로
죽고 나머지 install은 진행되지 않는다. package.json의 devDependencies 문자열은
CLI가 install 실행 전에 이미 써 둔 것이라 이 실패 이후에도 그대로 남는다 — 위 세
확인 중 devDep·unplugin만 보면 "배선됨"으로 오판하는 이유다. **되돌리지
마라**: 이 재핀 단계를 지우면 그 오판이 다시 살아난다.

복구는 실패한 정확 버전 고정을 버리고 공개 npm의 최신으로 다시 잡는 것이다 —
아래 4-a가 하는 "devDep이 아예 없을 때"의 신규 설치와 같은 명령이지만, 이미 있는
(깨진) 지정을 덮어쓰는 것이므로 먼저 실행한다:

```bash
npm --prefix ./<package_name> install -D @apps-in-toss/devtools@latest
```

일부 환경은 registry 프록시가 최신 버전을 숨기거나 낡은 dist-tag만 내려줄 수 있다
(루트 CLAUDE.md "dist-tag quirk" 참고) — 위 명령이 같은 이유로 또 실패하면
공개 미러를 강제한 뒤 재시도한다:

```bash
npm_config_registry=https://registry.npmmirror.com/ npm --prefix ./<package_name> install -D @apps-in-toss/devtools@latest
```

**해석된 정확 버전을 인용해 사용자에게 보고한다** — "latest를 넣었다"고만 말하지
않는다:

```bash
npm --prefix ./<package_name> pkg get devDependencies.@apps-in-toss/devtools
```

`npm install -D <pkg>@latest`는 이 skill의 다른 자리(`web-framework` major
복구, 위 Step 3)처럼 caret 범위(`^3.2.0` 형태)로 기록한다 — 정확 버전 고정으로
바꿔 쓰지 않는다. 위 세 확인(devDep·unplugin·실물)을 다시 수행해 셋 다 통과하면
Step 5로 넘어가고, unplugin 배선만 빠져 있으면 아래 4-a로 간다. 재설치 후에도
실물이 안 잡히면 더 자동 재시도하지 않고 `npm --prefix ./<package_name> ls
@apps-in-toss/devtools` 출력을 그대로 사용자에게 보고한 뒤 중단한다.

#### 4-a. 폴백 — CLI가 배선하지 않았을 때

`inject` skill의 devtools facet과 같은 패턴을 이 자리에서 수행한다 (idempotent —
이미 된 부분은 건드리지 않는다). 상세 패치 패턴이 필요하면 **Read <이 skill의 base
directory>/../inject/references/devtools.md**.

> `@apps-in-toss/devtools`(공개 npm 발행본, 2026-08-04부터 `@apps-in-toss/*`)는
> peer로 `@apps-in-toss/web-framework >=2.6.0 <3.0.0 || >=3.0.1 <4.0.0`을 선언해
> 정확히 `3.0.0`만 범위에서 빠진다. 설치된 wf가 그 gap이면 `unmet peer` 경고가
> 뜨지만 설치 자체는 막히지 않으니 넘어가면 된다.

1. devDep이 없을 때만:

   ```bash
   npm --prefix ./<package_name> install -D @apps-in-toss/devtools
   ```
2. vite.config 파일을 수정한다. **실제 존재하는 파일을 먼저 확인**한다:

   ```bash
   ls ./<package_name>/vite.config.*
   ```

   확장자는 템플릿의 **TypeScript 여부**로 갈린다 — TS 계열(`react-ts`·`ts`·
   `--tds`) → `vite.config.ts`, JS 계열(`react`·`js`) → `vite.config.js`.
   **존재하지 않는 확장자로 새 파일을 만들지 않는다**: Vite는 `.js`를 `.ts`보다
   먼저 탐색하므로 `vite.config.js`가 있는 프로젝트에 `.ts`를 새로 만들면 그
   파일이 조용히 무시돼 배선이 침묵 실패한다. 둘 다 없으면 중단하고 산출물 목록을
   보고한다.

   확인된 그 파일에:
   - `import aitDevtools from '@apps-in-toss/devtools/unplugin';`
   - `plugins` 배열에 `aitDevtools.vite({ panel: true })` 추가 (배열이 없으면 생성 —
     vanilla `js`/`ts` 템플릿도 Vite이므로 동일하게 적용된다).
   - `optimizeDeps.exclude`에 `@apps-in-toss/web-framework` 계열 추가
     (내장 react-vite 템플릿의 vite.config.ts와 같은 형태).

이 배선이 환경 1(브라우저 + mock SDK + panel)을 여는 것이다 — 없으면
`--sample`로 넣은 IAP/IAA 예제가 브라우저에서 "샌드박스앱/토스앱에서
실행해주세요" alert만 띄운다.

#### 4-b. 배선 해제 — `--no-devtools`

`--no-devtools`는 "설치 제외"가 아니라 **배선 해제**다 — CLI에 배선을 끄는
플래그가 없어 사후에 떼어내는 것 말고 방법이 없다. 위 확인에서 배선이 없었다면
아무것도 하지 않는다.

1. devDependency 제거:

   ```bash
   npm --prefix ./<package_name> uninstall @apps-in-toss/devtools
   ```
2. 확인된 vite.config 파일에서 `@apps-in-toss/devtools/unplugin` import 줄과
   `plugins` 배열의 `aitDevtools.vite(...)` 항목을 `Edit`으로 제거한다. 배열
   자체나 다른 플러그인(`react()` 등)은 그대로 둔다.

해제한 경우 Step 6 완료 안내에서 `npm run dev` 줄의 설명을 조정하고
`/ait:inject-devtools` seam을 알린다.

> **`@apps-in-toss/devtools`(`3.0.2`)의 mock은 wf 2.x·3.x 두 표면을 모두
> 지원한다** — `./mock/2x`(flat 함수 API)와 `./mock/3x`(네임스페이스 API:
> `Clipboard.*`·`Device.*`·`Screen.*`·`TossPay.*`·`createAsyncBridge` 등)가 둘 다
> 들어 있고, unplugin의 `sdkVersion`(기본 `'auto'` — 소비자 프로젝트의 wf major를
> 자동 감지)이 하나를 고른다. 이 skill의 scaffold(wf 3.x)에서는 3x facade가 골라져
> 두 표면 다 브라우저에서 동작한다. **주의**: 모노레포·virtual store처럼
> auto-detect가 실제 major를 못 읽는 환경에서는
> `aitDevtools.vite({ sdkVersion: '3' })`로 명시해야 한다 — 잘못된 표면을 고르면
> 그 표면에 없는 API가 브라우저에서 `undefined`가 된다.

### 5. 후처리 C — .gitignore

create-ait-app 템플릿은 `.gitignore`를 **이미 포함**한다(create-vite
경로·TDS 경로 모두 — TDS는 `_gitignore`를 rename해서 만든다). `*.ait`도 대개
이미 들어 있다 — `ait init`이 devtools 배선과 같은 실행에서 `.gitignore` 끝에
`*.ait`를 조건 없이 append한다(`@apps-in-toss/cli` 3.1.1 dist 실측 2026-09-07:
`appendFile(".gitignore", "\n*.ait\n")`). 그래서 이 fence가 실제로 더하는 줄은 보통
Step 3의 실패 흔적 파일 이름 하나이고, `*.ait`는 `ait init`이 넣지 않은 산출물(그
줄을 쓰지 않는 다른 버전의 CLI)에만 보충한다. 두 줄은 **각각** 없을 때만 append한다 —
종전에는 `*.ait` 부재를 조건으로 두 줄을 한 번에 넣어서, `ait init`이 `*.ait`를 먼저
넣은 현재 산출물에서는 흔적 파일 줄이 한 번도 들어가지 않았다(0.1.32 실측):

```bash
{ D=0; P="./<package_name>"
if [ -f "$P/.ait-design-guide-failed" ]; then echo "완료 블록에 그대로 넣을 줄: 디자인 가이드: 주입 실패 — /ait:design으로 나중에 넣을 수 있습니다"
elif [ "$D" = 0 ] && ! grep -qs '<!-- ait:design-guide v' "$P/AGENTS.md"; then echo "디자인 가이드 fence 미실행 — Step 3의 fence를 지금 그대로 실행하고 그 판정 줄을 쓴다"
fi; test -f "$P/.gitignore" && { grep -qx '\.ait-design-guide-failed' "$P/.gitignore" || { if grep -qx '\*\.ait' "$P/.gitignore"; then printf '\n# Apps in Toss design-guide failure trace\n.ait-design-guide-failed\n'; else printf '\n# Apps in Toss bundle artifacts\n*.ait\n.ait-design-guide-failed\n'; fi >> "$P/.gitignore"; }; }; }
```

`.gitignore`와 무관한 세그먼트가 앞에 하나 붙어 있다 — 디자인 가이드 상태의 마지막
재인쇄이자, Step 3 fence를 아예 실행하지 않은 경우를 잡는 감지기다. 세 갈래로 갈린다:
흔적 파일이 있으면 실패로 닫힌 것이니 완료 블록에 넣을 문장을 한 번 더 찍고, 흔적도
캐리어 마커도 없으면 fence가 실행된 적이 없다는 뜻이라 지금 실행하라고 찍고, 그 밖에는
아무것도 찍지 않는다(성공=닫힘 ①, `--no-design-guide`=닫힘 ②).

**여기서 재판정은 하지 않는다** — 판정 권한은 Step 3의 fence 하나에 있다. 흔적 검사가
1순위인 것이 그 보장이다: 마커 검사는 흔적이 **없을 때만** 발화하므로 실패를 성공으로
덮을 수 없다. 마커만 보는 검사를 판정으로 승격시키면 안 되는 이유는 그대로다 — fence는
마커에 더해 산출물 실재까지 보는데 이 자리는 `--tds` 여부를 몰라 같은 판정을 재현할 수
없다. 종전에는 흔적 파일의 부재가 성공과 미실행 둘 다를 뜻해 미실행이 조용히 통과했다
(실측: 한 run은 `✅ 디자인 가이드 상태 정상`을, 다른 run은 경로를 잘못 짚은 자기 식
검사를 지어내 아무 출력도 안 나온 것을 정상으로 읽었다 — 둘 다 완료 보고에 디자인
가이드 줄이 아예 없었다). 흔적 파일 이름을 `.gitignore`에 함께 넣는 것은 실패한
프로젝트에 상태 파일이 커밋되지 않게 하려는 것이다. 이 fence는 완료 블록
직전의 마지막 필수 셸 호출이라, Step 6은 열몇 턴 전 판정을 되짚지 않고 방금 나온 이
출력만 보면 된다. 세그먼트를 빼고 `.gitignore` 부분만 추려 실행하지 마라(실측 선례:
자체 조립한 run이 형상 fence 끝의 세그먼트만 빼먹었다).

(`test -f` 가드가 반드시 앞에 있어야 한다 — 없으면 `grep -qx ... "$P/.gitignore"`가
파일 부재로 실패했을 때 `||`가 `printf ... >>`를 그대로 실행해 `*.ait`·흔적 줄만 든 불완전한
`.gitignore`를 **새로 만들어 버린다**(실측 확인) — 아래 문단이 말하는 "없으면 만들지 않고
중단"이 명령 레벨에서 무력화된다.)

`.gitignore` 자체가 없으면(예상 밖 형상) 새로 만들지 않고 중단해 후처리
0(형상 가드)로 되돌아간다 — create-vite 기반 산출물이라면 없을 수 없는
파일이라, 없다는 건 형상 가정이 다시 틀렸다는 신호다.

(`git init` 자체는 하지 않는다 — 사용자 결정. Out of scope 참조.)

### 5-B. 후처리 D — 디자인 가이드 주입

갓 만든 프로젝트에 디자인 가이드를 심는다 — `src/styles/`의 토큰·기본 CSS,
아이콘 6종, `docs/design-guide.md`, 그리고 에이전트 메모리로 읽히는 캐리어 문서
(본문 정본 `AGENTS.md` + 그것을 가리키는 `CLAUDE.md` 한 줄)다. 그래야 이
프로젝트에서 나중에 어떤 세션이 화면을 만들어도 같은 기준을 따른다. 절차의 정본은
`design` skill의 `references/project-guide.md`다.

`--no-design-guide`면 이 단계 전체가 없던 것이 된다(Step 2에서 주입 세그먼트를 뺐고,
Step 3의 fence는 1행 `D=1`로 그 사실을 받아 `없음(닫힘 ②)`으로 닫았다) — 사용자가
명시적으로 뺀 것이라 실패 보고도 하지 않고 바로 Step 6으로 간다.

**실행은 Step 2의 명령 체인에서 이미 일어났다.** 이 절은 그 출력 끝의 `5-B:`
요약 한 줄을 해석해 보고하는 곳이다. 플래그 효과: `--tds`는 CSS·아이콘·entry
배선을 빼고 다이제스트의 `아이콘:` 두 줄만 TDS 문구로 바꾸며, `--no-tossface`는
`base.css`의 Tossface CDN `@import`와 폰트 스택 항목만 지운다(`.tf` 클래스는
남긴다).

Step 2 출력에 `5-B:` 줄이 없어도 여기서 새로 할 일은 없다 — Step 3의 fence가 파일
실재로 이미 판정하고 필요하면 보완했다. 그 fence를 한 번도 실행하지 않았다면 여기서 새
fence를 만들지 말고 Step 3의 그 fence를 그대로 실행한다.

전 항목이 `test -f`/`grep` 멱등 가드를 인라인으로 갖고(이미 있으면 건드리지
않는다), 개별 실패가 나머지를 죽이지 않으며(`set -e`를 쓰지 않는다), 마지막 줄이
항목별 수행/스킵을 한 줄로 요약한다. 스캐폴드가 만들어 둔 `src/index.css`·
`src/App.css`는 고치지 않는다 — 파일을 더할 뿐 기존 스타일을 대체하지 않는다.

**이 단계는 scaffold를 중단시키지 않는다.** Step 3(형상 가드) 실패는 이후 후처리가
딛고 설 산출물 자체가 없다는 뜻이라 즉시 멈추지만, 디자인 가이드는 나중에
`/ait:design`으로 다시 넣을 수 있는 부가물이다 — 요약에 `FAIL`이 섞여도 Step 6까지
간다. 결과 보고는 여기서 따로 문장을 짓지 않는다 — Step 3 fence의 판정 줄이 정본이고,
완료 블록에 무엇을 인쇄할지는 그 절의 닫힘 규칙과 Step 6의 인쇄 규칙이 정한다. 이미
있어서 skip된 항목은 나열하지 않는다.

요약에 `assets=UNRESOLVED`나 `FAIL`이 섞였어도 여기서 폴백을 다시 돌릴 것은 없다 —
자산 폴백은 Step 3 fence 안에 있고, 그 fence가 산출물 실재로 최종 판정을 이미 냈다.
**여기서 새 fence를 만들 것도, 빠진 파일을 손으로 `Write`할 것도 없다** — 지어내기 금지와
`Write` 금지, 마커 규약, entry 우선순위는 전부 Step 3 "디자인 가이드 주입" 절에 있다.

### 6. 다음 단계 안내 + dev 서버 기동

생성이 끝나면 한 블록으로 마무리:

```
<app-name> 생성 완료 (./<package_name>/)
디자인 가이드 포함: AGENTS.md·CLAUDE.md · docs/design-guide.md · src/styles/(tokens|base).css · src/components/icons.tsx · 이모지 서체 Tossface

다음 단계 (명령을 몰라도 됩니다 — 따옴표 안 문장을 그대로 말해도 같은 단계로 갑니다):
  cd <package_name>
  npm run dev       # 브라우저에서 devtools panel과 함께 실행
                     # 말로: "브라우저에서 개발 서버 띄워줘"
  /ait:design       # 화면을 만들거나 고침 (방금 넣은 디자인 가이드를 그대로 따릅니다)
                     # 말로: "화면이 좀 구려 보여. 예쁘게 고쳐줘."

배포 준비가 되면 (번들 설정은 템플릿에 이미 포함):
  /ait:design       # 등록용 로고·썸네일·스크린샷 산출
                     # 말로: "등록용 로고랑 스크린샷 만들어줘"
  npm run build     # tsc -b && vite build && ait build → 프로젝트 디렉터리 안에 <package_name>.ait 생성 (package.json 옆)
  console MCP       # miniapp_create → bundle_upload → bundle_upload_complete 로 등록·업로드
                     # (최초 1회 /mcp 에서 ait-console 인가 필요)
  /ait:test-on-device # 위 빌드·업로드·컴파일 확인을 한 번에 (실기기 확인의 정규 경로)
                     # 말로: "만든 미니앱을 실제 토스 앱에서 돌려보고 싶어"

주의: ait build를 단독으로 실행하면 dist/가 없어 실패합니다 — 항상 npm run build
  (또는 vite build 이후)로 실행하세요. 빌드가 오래 걸려도 .ait는 완료 후
  프로젝트 디렉터리 바로 아래(package.json 옆)에 생깁니다 — 상위 폴더가 아니라
  프로젝트 안입니다. 완료 전에 없다고 판단해 재빌드하지 마세요. 확인은 현재
  위치를 추측하지 말고 ls ./<package_name>/*.ait ./*.ait 2>/dev/null 한 호출로
  — 나오는 쪽이 산출물입니다.

참고: 브라우저 mock은 web-framework 2.x(flat 함수)·3.x(네임스페이스,
  Clipboard.* 등) 표면을 모두 지원하며, 이 프로젝트(wf 3.x)에서는 자동
  감지(sdkVersion: 'auto')로 3.x 표면이 선택됩니다. 모노레포 등 자동 감지가
  어긋나는 환경이면 vite.config의 sdkVersion을 명시적으로 지정하세요.

문서가 필요하면 docs MCP(searchDocumentation/getPage)로 조회하세요.
```

첫 줄 뒤의 `디자인 가이드 포함:` 줄은 **5-B가 실제로 넣은 것만** 나열한다 —
`--tds`면 CSS·아이콘이, `--no-tossface`면 서체 항목이 빠지고, `--no-design-guide`
면 줄 자체를 인쇄하지 않는다. 5-B 요약에서 실패한 항목도 빼고 적는다. 단,
**바로 앞 Step 5의 fence가 `완료 블록에 그대로 넣을 줄:`을 찍었으면 이 줄을
생략하는 게 아니라 그 콜론 뒤의 문장(`디자인 가이드: 주입 실패 — /ait:design으로
나중에 넣을 수 있습니다`)으로 바꿔 인쇄한다** — 닫힘 규칙 ③이다. 몇 턴 전 판정을
기억해내 문장을 새로 짓지 말고, 방금 그 출력을 그대로 옮긴다. 항목을 조용히 빼면
사용자는 주입이 됐는지 안 됐는지 알 수 없다. 판정 줄이 여러 번 나왔으면 **가장 나중
것이 이긴다** — 한 fence 안에서 스크립트가 실패한 뒤 자산 폴백으로 회복한 경우가 있다.
`디자인 가이드 주입 보류(…)`는 닫힘이 아니다 — 완료 블록을 인쇄하지 말고 Step 3의
경로 치환을 고쳐 그 fence를 다시 실행한다.

이모지 서체(Tossface)는 **기본으로 배선된다**(5-B가 넣은 `src/styles/base.css`
첫 줄의 CDN `@import`). 번들 용량은 늘지 않지만 CDN에 닿지 못하는 환경에서는
시스템 이모지로 조용히 폴백하므로, 완료 블록 아래에 두 줄을 항상 덧붙인다:

```
오프라인에서도 이모지 서체를 확실히 렌더하려면: /ait:inject-tossface
                     # 말로: "이모지를 토스페이스 서체로 렌더하고 싶어"
```

`--no-tossface`·`--no-design-guide`·`--tds`로 만들어 서체 배선이 없으면 첫 줄을
`이모지 서체가 필요하면:`으로 바꿔 인쇄한다 — 배선이 있는 프로젝트와 없는
프로젝트에 같은 문장을 쓰면 사용자가 현재 상태를 오해한다.

`--no-devtools`로 만들었으면 완료 블록에서 `npm run dev` 줄의 주석을
`# 브라우저 실행 (devtools 미배선 — SDK 호출은 실기기/샌드박스 필요)`로 바꾸고,
그 아래에 `나중에 브라우저 mock 개발이 필요하면: /ait:inject-devtools`와 그
자연어 동치(`말로: "이 프로젝트에 앱인토스 devtools 패널을 붙여줘"`) 두 줄을
덧붙인다.

`--sample` 없이 만들었으면(= 정본 호출) "배포 준비가 되면" 블록 아래에 한 줄을
덧붙인다:

```
나중에 인앱결제/인앱광고 예제가 필요해지면:
  cd <package_name> && npx -y create-ait-app@latest add-sample . --inline --sample iap,iaa
```

(create-ait-app의 `add-sample` 서브커맨드 — Apps in Toss 프로젝트로 인식되는
디렉터리에서만 동작하고 `--sample`을 생략하면 interactive 프롬프트로 빠진다.
자세한 제약은 Out of scope 참조.)

#### dev 서버 자동 기동

안내 블록 인쇄 직후, 에이전트가 dev 서버를 백그라운드로 직접 기동한다. Bash
호출 간 cwd가 유지되지 않으므로 **절대 경로**를 쓴다:

```bash
# <project_abs_path> = cwd(scaffold 시점) + "/" + package_name
npm --prefix <project_abs_path> run dev
```

`run_in_background: true`로 실행한다. `dev` 스크립트는 순정 create-vite 그대로
`vite`라 stdout에 표준 배너(`VITE v… ready` + `Local: http://localhost:<port>`)가
뜬다 — 그 패턴을 파싱해 URL을 알린다(기본 포트 5173, 형식이 다르면 포트 폴백):

```
dev 서버가 http://localhost:<port> 에서 실행 중입니다.
브라우저에서 이 주소를 열어주세요. (브라우저는 직접 여세요 — 에이전트는 URL만 알려드립니다.)
```

이어서 다음 한 블록을 덧붙인다:

```
지금 만들어지는 화면 보기:
  - 데스크탑 브라우저 기본 폭은 미니앱 레이아웃이 깨져 보입니다 — 모바일 폭으로
    봐야 정상적으로 보입니다.
  - 화면 하단의 AIT 버튼을 눌러 devtools panel을 열고 Viewport 탭에서
    iPhone/Galaxy 프리셋을 고르면 모바일 폭·orientation으로 렌더됩니다.
  - 실기기 렌더링 차이는 desktop 브라우저로는 확인할 수 없습니다 — 최종
    확인은 /ait:debug의 on-device 경로(환경 3)로 하세요.
```

`--no-devtools`로 만들었다면 AIT 버튼·Viewport 탭이 없으므로 둘째 항목만
`브라우저 자체 개발자 도구(Chrome 기기 툴바/반응형 디자인 모드)로 iPhone/Galaxy
프리셋을 켜세요`로 바꿔 인쇄한다.

> (station 2(dev)는 station map상 의도적으로 `/ait` 명령이 아니라 `npm run dev`
> 원시 명령이다 — dev는 일회성 액션이 아니라 연속 프로세스라 슬래시 명령으로
> 감싸지 않는다. station 1→2 hand-off는 이 안내 블록이 `npm run dev`를 직접
> 인쇄하는 것으로 충분하다.)

## Out of scope (이 skill이 하지 않는 것)

- ❌ 콘솔 등록·번들 업로드 — console MCP 도구(`miniapp_create`/`bundle_upload`/
  `bundle_upload_complete`)의 역할. 인가는 `/mcp`에서 `ait-console`
  1회 승인(브라우저 OAuth)으로 끝난다.
- ❌ 기존 프로젝트에 devtools 주입 — `/ait:inject-devtools`
  (`inject` skill의 devtools facet).
- ❌ 기존 프로젝트에 IAP/IAA 샘플 추가 — create-ait-app의 `add-sample`
  서브커맨드가 brownfield를 지원한다(`npx -y create-ait-app@latest add-sample
  [directory] --inline --sample iap,iaa`, `directory` 생략 시 cwd `.`). 대상이
  Apps in Toss 프로젝트가 아니면 즉시 거부한다(0.2.3의 `inspectSampleProject()`
  실측 — 판정은 `dependencies`/`devDependencies`의
  `@apps-in-toss/web-framework` 또는 `apps-in-toss.config.ts` 존재, 실패
  메시지는 "Apps in Toss 프로젝트에서만 예제 코드를 추가할 수 있어요."다. 0.2.1이
  쓰던 `package.json`의 `createAitApp` 메타데이터 기준은 폐기됐고 0.2.3은 남아
  있는 걸 발견하면 오히려 지운다). `--sample`을 생략하면 interactive checkbox
  프롬프트로 빠지므로 비대화형 호출에는 항상 명시한다. 이 skill은 greenfield
  전용이라 자동 호출하지 않는다.
- ❌ 서버 스캐폴드. 다만 사용자가 파트너 API를 부르는 서버(mTLS, Cloudflare
  Workers 등)를 함께 요청하면, 서버 코드 작업은 `/ait:server`로 넘기며, 직접 쓸 때도 서버 코드를 쓰기 전에 **`<이 skill의 base
  directory>/../launch/references/server-runtime.md`**를 읽고 그 기준(인증서는
  사용자가 콘솔에서 발급, 키 임시 디렉터리 정리, 정확한 CORS origin, 응답 가공,
  우회 플래그 없이 가짜 mTLS 바인딩으로 로그인 경로 테스트, 서버 배포 후 클라이언트
  빌드)을 따른다.
- ❌ Workspace 등록 / 멤버 초대 / billing — 콘솔 UI의 책임.
- ❌ Git 초기화 — 사용자가 결정 (`.gitignore`에는 빠진 줄(`*.ait`·실패 흔적 파일
  이름)만 덧붙인다 — 파일 생성은 하지 않는다. 템플릿이 이미 `.gitignore`를
  포함하고 `ait init`이 `*.ait`까지 넣어서다).
- ❌ create-ait-app 자체의 버그 수정 — upstream(toss/create-ait-app) 이슈로.
  이 skill의 후처리는 관측된 CLI 동작에 대한 우회일 뿐, upstream이 그 동작을
  고치면 해당 후처리는 제거한다.

## 하지 말아야 할 것

- ❌ 기존 디렉토리 덮어쓰기 (`<package_name>/`이 이미 있으면 즉시 중단).
- ❌ create-ait-app에 `--skip-install`·`--skills` 플래그 — 존재하지
  않는다(알 수 없는 옵션으로 즉시 에러, 산출물 0). install을 떼어내는 설계는
  더 이상 성립하지 않는다.
- ❌ `--pm` 생략 — non-TTY에서 PM 프롬프트로 멈출 수 있다.
- ❌ `--cwd` 플래그 — 존재하지 않는다(알 수 없는 옵션으로 에러). 현재
  디렉터리에 만들려면 positional에 `.`을 준다.
- ❌ `--template`과 `--tds` 동시 지정 — CLI가 거부한다(`"--template과 --tds는
  함께 사용할 수 없어요."`). 둘 중 하나만 쓴다.
- ❌ `npm` 실패 시 pnpm/yarn으로 자동 fallback. 매니저 차이는 사용자가
  의식하고 결정해야 한다.
- ❌ 생성된 프로젝트에 과장·홍보성 문구 삽입. 생성하는 README/주석은 배선을
  설명하는 최소한으로.
- ❌ `@apps-in-toss/web-framework`를 2.x로 강등하는 명령 — 정본 3.x 산출물을
  깨뜨린다(어떤 형태로도 남기지 않는다).
- ❌ (`--local` 경로) JSX/TSX 안에 토큰을 두거나 템플릿 엔진 도입 —
  `references/local-template.md`의 토큰 규칙 참조.

## 참고

- 짝 skill: `inject`(devtools facet — 기존 프로젝트에 devtools 추가,
  debug-console facet — on-device attach 패키지 설치, tossface facet — 이모지
  서체를 번들 포함 모드로 전환), `design`(화면 생성·개선 + 등록 이미지 자산 생성
  — 5-B가 넣는 자산과 주입 절차의 정본 `assets/project/`·
  `references/project-guide.md`를 이 skill이 소유한다).
- 공식 스캐폴더: https://github.com/toss/create-ait-app — 번들된 create-vite에
  위임하는 템플릿(+ `--tds` 변형), IAP/IAA 샘플, brownfield `add-sample`
  서브커맨드. 이 skill의 호출 규칙·후처리 근거는 `create-ait-app` 0.2.3·0.2.8 소스
  실측이다(0.2.9는 2026-10-15 기준 공개 latest — 0.2.8과는 wf 핀·IAP 예제 주석만 다르다) — `@latest`가 그보다 새 버전을 받아
  어긋나면 CLI의 에러·`--help`를 정본으로 본다.
- devtools (mock + panel + unplugin) 소스 — 구 repo 이력에만 존재(재생성으로 링크 소멸, maintainer 로컬 백업 mirror에서 열람 가능)
- 브라우저 mock dev 환경 등 주제별 가이드는 docs MCP(searchDocumentation/
  getPage)로 조회한다.
- `--local` 폴백 템플릿 정책: `shared/templates/README.md` (react-vite는 wf
  2.x 기반 구세대 오프라인 폴백으로 유지, 단계적 폐기 예정).
