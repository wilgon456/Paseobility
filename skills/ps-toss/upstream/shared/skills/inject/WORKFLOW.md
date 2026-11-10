---
name: inject
description: |
  Patch an existing Apps in Toss mini-app's build setup. Three facets:
  `/ait:inject-devtools` adds the `@apps-in-toss/devtools` unplugin for browser dev
  ("기존 Vite 프로젝트에 devtools 붙여줘"); `/ait:inject-debug-console` installs
  `@apps-in-toss/debug-console` (on-device attach) as a dependency;
  `/ait:inject-tossface` wires the Tossface emoji web font (CDN link or subset
  bundling) into a project's entry CSS. Idempotent, minimal edits. This skill only
  INSTALLS packages/assets into a build setup — it never diagnoses a running app.
  "폰에서 이상하게 동작하는데 디버깅하고 싶어" / "라이브 상태를 보고 싶어" is
  `debug`, not this.
argument-hint: ''
---

# inject skill

이 skill은 세 facet을 담는다 — `/ait:inject-devtools`(devtools unplugin 주입), `/ait:inject-debug-console`(on-device attach 패키지 설치), `/ait:inject-tossface`(이모지 서체 Tossface 배선). 셋 다 기존 프로젝트의 빌드 셋업을 최소 변경으로 패치하는 brownfield station 2 도구라 하나로 묶였다(agent-plugin#280 debug-console facet 추가). 사용자가 어느 command로 진입했는지에 따라 아래 해당 facet으로 분기한다 — 세 facet은 독립이며 서로를 자동 실행하지 않는다.

## 목적

이미 `@apps-in-toss/web-framework`를 쓰는 기존 미니앱 프로젝트의 개발 환경을 확장한다.
`new-miniapp`이 greenfield(빈 디렉토리)라면 이 skill은 **brownfield** — 기존 파일을 최소한으로
수정하고, 이미 설정이 있으면 skip한다. 어느 facet이든 생성·수정하는 파일에 과장·홍보성 문구를
넣지 않는다.

세 facet은 목적이 다르다:

- **devtools facet** (`/ait:inject-devtools`): `@apps-in-toss/devtools` unplugin을 빌드 config에
  추가해 토스 앱 없이 브라우저에서 mock SDK로 개발·테스트한다. 인자 없음.
- **debug-console facet** (`/ait:inject-debug-console`): `@apps-in-toss/debug-console`(on-device
  attach)을 **`dependencies`**로 설치하고 `/auto` self-gating import를 진입점에
  와이어업한다. 환경 3(intoss-private candidate) on-device 디버깅에 attach 표면을 남긴다.
  인자 없음.
- **tossface facet** (`/ait:inject-tossface`): 이모지를 토스페이스 글리프로 렌더하도록
  CDN 링크 또는 서체 subset 번들을 프로젝트 진입 CSS에 와이어업한다. `design` skill의
  서체 정책상 본문 서체는 금지 대상이지만 이모지 서체(Tossface)는 권장 대상이다. 인자 없음.

## devtools facet — `/ait:inject-devtools`

빌드 도구(Vite / Next.js / Rspack / Webpack)를 감지하고, lockfile로 패키지 매니저를 감지해
`@apps-in-toss/devtools`를 devDep으로 설치한 뒤, config 파일을 멱등하게 패치한다
(`aitDevtools.<bundler>({ panel: true })`). 이미 설정이 있으면 skip. 콘솔 인증 불필요 — 로컬
dev 전용이다.

핵심 절차: (1) `package.json` 확인 → (2) 빌드 도구 감지 → (3) PM 감지 → (4) idempotency
확인 → (5) devDep 설치 → (6) 번들러별 config 패치(Vite `optimizeDeps.exclude` 포함) →
(7) 완료 seam. 번들러별 정확한 패치 패턴·경고 처리·하지 말아야 할 것은 —

**상세가 필요하면 Read `<이 skill의 base directory>/references/devtools.md`.**

## debug-console facet — `/ait:inject-debug-console`

`@apps-in-toss/debug-console`을 **runtime dependency**로 설치하고(harness GitHub Release
tarball URL — npm 미발행), 진입점에 self-gating `import '@apps-in-toss/debug-console/auto'`를
멱등하게 삽입한다. 이 패키지는 예전
`@apps-in-toss/devtools`의 `./in-app` export였다 — devtools의 MCP 데몬·on-device attach
표면이 `debugger` 패키지(`@apps-in-toss/debugger` + `@apps-in-toss/debug-console`)로
분리되면서 나뉘었다.
**보안 스코프**: 두 패키지 중 프로덕션 미니앱 번들에 실제로 들어갈 수 있는 유일한
패키지라 `dependencies`로 설치한다(devtools는 devDep 전용) — 설치돼 있지
않으면 attach 코드가 번들에 구조적으로 들어갈 수 없다.
패키지 README는 프로덕션 하드닝 관점에서 build-time `__DEBUG_BUILD__` 게이트(방식 B)를
권장 순서상 먼저 제시하지만, 이 skill이 진입점에 실제로 자동 삽입하는 것은 여전히
`/auto`(방식 A)다 — consumer 번들러 `define` 배선이 프로젝트마다 달라 이 skill이
방식 B를 강제 적용하면 기존 빌드 설정과 충돌할 수 있기 때문이다. 방식 B는 사용자가
원할 때 참고할 대안으로 `references/debug-console.md`에 안내한다.

핵심 절차: (1) `package.json` 확인 → (2) 기존 설치 확인(idempotency) → (3) `dependencies`로
설치 → (4) 진입점 감지 + `/auto` import 삽입 → (5) 완료 seam. 하지 말아야 할 것은 —

**상세가 필요하면 Read `<이 skill의 base directory>/references/debug-console.md`.**

## tossface facet — `/ait:inject-tossface`

이모지를 토스페이스 글리프로 렌더한다. `design` skill의 서체 정책상 본문 서체(`Toss
Product Sans` 계열)는 금지지만, 이모지 서체 `Tossface`(`toss/tossface`로 공개 배포)는
금지 대상이 아니라 **권장 대상**이다 — 시스템마다 모양이 갈리는 이모지 대신 어디서나
같은 글리프로 렌더된다. 먼저 기존 배선 여부를 grep으로 확인해(idempotency) 이미 있으면
skip한다. 콘솔 인증 불필요 — 로컬 작업이다.

**두 모드 중 하나를 사용자 확인 후 진행한다** — **모드 A(CDN 링크)**는 번들 증가
0이고 토스 앱 webview에서 CDN 로드가 확인됐지만(2026-10-14, iOS·Android) 네트워크에 의존하고, **모드 B(subset 번들 포함)**는
네트워크 없이 결정적으로 동작하지만 담는 subset마다 약 520KB~1.9MB가 늘고 라이선스가
요구하는 저작권 고지·전문 동봉이 따른다.

핵심 절차: (0) 기존 배선 확인(idempotency) → (1) 두 모드 대가 계산 + 모드 확정 →
(2) 모드 A는 `@import`/`<link>` 삽입, 모드 B는 코드포인트 대조 → subset 선정(+ 선정
직후 재확정) → 원본 파일 배치 → 라이선스 동봉 → CSS 작성 → (3) `font-family` 맨
앞에 `Tossface` 추가 → (4) 완료 seam. `@import` 위치 제약(다른 규칙보다 항상 앞에
와야 한다)·정확한 CDN 스니펫·라이선스 근거는 —

**상세가 필요하면 Read `<이 skill의 base directory>/references/tossface.md`.**

## 다음 단계 (facet별 seam)

세 facet 모두 seam을 **슬래시 + 자연어 2표면**으로 인쇄한다(통일 규칙 —
로컬 `docs/design/skill-conventions.md`(repo 미포함 — maintainer-local) §9).

**devtools facet** 완료 후:

```
@apps-in-toss/devtools 설정 완료 · <config-file> 패치

다음 단계 (명령을 몰라도 됩니다 — 따옴표 안 문장을 그대로 말해도 같은 단계로 갑니다):
  npm run dev               # 브라우저에서 앱 실행 (하단에 AIT DevTools 패널)
                            #   말로: "브라우저에서 개발 서버 띄워줘"
  /ait:debug                # 브라우저 패널·window.__ait 상태로 디버깅
                            #   말로: "브라우저에서 앱 상태가 이상한데 디버깅해줘"
```

**debug-console facet** 완료 후:

```
@apps-in-toss/debug-console 설정 완료 · <진입점>에 /auto import 삽입

다음 단계 (명령을 몰라도 됩니다 — 따옴표 안 문장을 그대로 말해도 같은 단계로 갑니다):
  RELEASE_CHANNEL=dogfood npm run build  # candidate 빌드에 attach 표면 포함
                                      #   (2.x 폴백은 npm run bundle:ait)
  /ait:debug                          # 환경 3 QR attach로 on-device 디버깅
                                      #   말로: "미니앱이 폰에서 이상하게 동작하는데 라이브 상태를 디버깅하고 싶어"
```

**tossface facet** 완료 후:

```
Tossface 배선 완료 · <모드 A: CDN 링크 추가 | 모드 B: subset <N>개 번들, +<증가량>>

다음 단계 (명령을 몰라도 됩니다 — 따옴표 안 문장을 그대로 말해도 같은 단계로 갑니다):
  npm run dev               # 브라우저에서 이모지 렌더 확인
                            #   말로: "브라우저에서 개발 서버 띄워줘"
  /ait:design                # 화면 렌더 무결성(G7 등) 판정으로 이어서 확인
                            #   말로: "화면 디자인 품질 점검해줘"
```

각 facet의 완전한 완료 블록(변경 요약·주의사항 포함)은 세 facet 모두 위 references
파일에 있다.

## Out of scope (이 skill이 하지 않는 것)

- ❌ 새 프로젝트 생성 (greenfield) — `/ait:new` (`new-miniapp` skill).
- ❌ 콘솔 인증·등록·업로드 — console MCP 도구(`miniapp_create`/`bundle_upload`/
  `bundle_upload_complete`)의 역할.
- ❌ 번들 설정(`apps-in-toss.config.ts`) 최초 생성 — 정본 경로(create-ait-app)는
  `/ait:new`에 기본 포함, `--local` 폴백만 `new-miniapp`의 L-5 절차로 추가.
- ❌ (devtools) panel 마운트 E2E 검증 — 사용자가 직접 `npm run dev`로 확인.
- ❌ (devtools) Rollup/esbuild 라이브러리 빌드에 mock 주입 — 앱(미니앱) 전용.
- ❌ **실행 중인 앱을 진단하는 것** — 이 skill은 패키지를 *설치*할 뿐이다. "폰에서 이상하게 동작한다", "라이브 상태를 보고 싶다"는 `/ait:debug`(`debug` skill). debug-console facet은 그 진단을 *가능하게 하는 준비물*이지 진단 자체가 아니다.
- ❌ (debug-console) MCP 데몬 등록 — `/ait:setup-debugger`가 프로젝트 `.mcp.json`에 배선(`/ait:debug` §5 참조).
- ❌ (debug-console) `devDependencies` 설치 — 프로덕션 번들 포함이 목적이라 반드시 `dependencies`.
- ❌ (tossface) 재-subsetting·포맷 변환 — 원본 파일을 그대로만 배치한다
  (`references/tossface.md`의 "tossface facet 하지 말아야 할 것" 절 참조).
- ❌ (tossface) 본문 서체로 사용 — 이모지 서체다. 본문 서체 금지는 `design` skill의
  "토스 브랜드·UI 모방 금지" 절이 다루는 별개 축이다.

## 참고

- **create-ait-app 프로젝트에 IAP/IAA 예제 추가**: 이 skill의 두 facet과는
  무관한 별도 CLI 서브커맨드지만, 같은 brownfield 자리라 여기 남긴다 —
  `npx -y create-ait-app@latest add-sample [directory] --inline --sample iap,iaa`
  (`directory` 생략 시 기본값은 cwd `.`). 대상이 Apps in Toss 프로젝트로
  인식될 때만 동작하고(`inspectSampleProject()` — `@apps-in-toss/web-framework`
  의존성 또는 `apps-in-toss.config.ts` 존재로 판정, 아니면 즉시 거부),
  `--sample`을 생략하면 interactive checkbox 프롬프트로 빠진다. 이 skill은 이
  명령을 실행하지 않는다 — `new-miniapp` skill의 Step 6 완료 안내가 같은 명령을
  노출한다.
- 표준 dev 환경 셋업(브라우저 mock·실기기 미리보기) 등 주제별 가이드는 docs MCP
  (`searchDocumentation`/`getPage`)로 조회한다.
- devtools facet 상세: `<이 skill의 base directory>/references/devtools.md`
- debug-console facet 상세: `<이 skill의 base directory>/references/debug-console.md`
- tossface facet 상세: `<이 skill의 base directory>/references/tossface.md`
- 짝 skill: `new-miniapp` (새 프로젝트 생성 — create-ait-app 호출 + devtools 후처리 배선), `debug` (devtools facet이 깔아둔 브라우저 panel 또는 debug-console facet이 깔아둔 환경 3 attach 표면을 소비하는 디버깅), `design` (tossface facet 배선 후 화면 렌더 무결성 판정 — "토스 브랜드·UI 모방 금지" 절이 이모지 서체 정책의 정본).
- `@apps-in-toss/devtools`(mock+panel+unplugin, 브라우저 dev 전용) 소스 — 구 repo 이력에만 존재(재생성으로 링크 소멸, maintainer 로컬 백업 mirror에서 열람 가능)
- `@apps-in-toss/debug-console`(on-device attach): https://github.com/toss/apps-in-toss-harness/tree/main/packages/debug-console
- `@apps-in-toss/debugger`(MCP 데몬, `/ait:setup-debugger`가 프로젝트 `.mcp.json`에 배선): https://github.com/toss/apps-in-toss-harness/tree/main/packages/debugger
- `Tossface`(공개 배포 이모지 서체): https://github.com/toss/tossface (`LICENSE` 전문, 공개 안내 페이지 `https://toss.im/tossface/copyright`).
