# `--local` 폴백 — 내장 react-vite 템플릿 복사 절차

`/ait:new`의 정본 경로는 create-ait-app 비대화형 호출(SKILL.md Step 2~6)이다.
이 문서는 **오프라인·네트워크 제한·create-ait-app 실행 불가** 상황의 폴백
절차다 — plugin에 동봉된 `react-vite` 템플릿(React 19 + Vite 8 + TS +
`@apps-in-toss/devtools` 배선 완료 + 디자인 가이드 프리베이크)을 복사한다.
SKILL.md의 Step 0(toolchain 검사)과 Step 1(입력 정규화 + 충돌 검사)은 이미 끝난
상태를 전제한다.

디자인 가이드는 이 템플릿에 **이미 들어 있다** — 정본 경로처럼 스캐폴드 뒤에
주입하는 게 아니라 파일로 동봉돼 있어서, 복사만으로 같은 형상이 된다
(`AGENTS.md`·`CLAUDE.md`·`docs/design-guide.md`·`src/styles/tokens.css`·
`src/styles/base.css`·`src/components/icons.tsx`, `src/main.tsx` 첫 줄의
`import './styles/base.css';`까지). 확인은 아래 L-3b에서 한다.

## L-1. 템플릿 위치 확인

Plugin이 설치된 경로에서 템플릿을 찾는다. SKILL.md가 있는 디렉토리 기준
세 단계 위가 plugin root다 (`shared/skills/new-miniapp/SKILL.md` →
`shared/skills/` → `shared/` → plugin root):

```bash
ls "<plugin-root>/shared/templates/react-vite/template.json"
```

없으면 가용 목록을 보여주고 중단: `ls "<plugin-root>/shared/templates/"`

## L-2. 디렉토리 복사

```bash
cp -R "<plugin-root>/shared/templates/react-vite/" "./<package_name>/"
rm "./<package_name>/template.json"   # 메타파일 — 사용자 프로젝트의 일부가 아니다
```

## L-3. 토큰 치환

`{{app_name}}`, `{{package_name}}`을 치환한다. **대상 파일은 `template.json`의
`substitute.files`가 source of truth** (react-vite: `package.json`,
`index.html`, `README.md` 3개). 그 외 파일은 건드리지 않는다 — 디자인 가이드
파일들(`AGENTS.md`·`CLAUDE.md`·`docs/design-guide.md`·CSS·아이콘)에는 토큰이
아예 없어서 치환 대상이 아니다.

| Token | 의미 | 예시 (`<app-name>` = "My Mini App") |
|---|---|---|
| `{{app_name}}` | 사람이 읽는 이름. 입력 그대로. | `My Mini App` |
| `{{package_name}}` | npm 호환 슬러그. | `my-mini-app` |

**토큰 규칙**: 토큰은 텍스트 파일에만 둔다. JSX/TSX 본문에서는 `{{...}}`이
JS 표현식으로 파싱돼 빌드를 깨뜨리니 `*.tsx`에는 절대 넣지 않는다. 치환은
단순 문자열 replace — `mustache`/`handlebars` 같은 deps 도입 금지. `Edit`
tool로 파일마다 치환하는 게 가장 안전하다. batch가 필요하면:

```bash
# macOS BSD sed: -i '' / GNU sed: -i
for f in ./<package_name>/package.json ./<package_name>/index.html ./<package_name>/README.md; do
  sed -i '' "s/{{app_name}}/${APP_NAME//\//\\/}/g; s/{{package_name}}/${PACKAGE_NAME}/g" "$f"
done
```

## L-3b. 디자인 가이드 확인 (프리베이크 검증)

템플릿이 이미 담고 있는 것이라 새로 넣을 일은 없지만, 실제로 다 왔는지는 한 번
확인한다. **정본 경로의 Step 2 체인(5-B)이 호출하는 것과 같은 스크립트를 같은
인자로 한 번 실행한다** — 정상이면 마지막 요약 줄이 전 항목 `skip`(`guide=skip tokens=skip
base=skip icons=skip entry=skip agents=skip(…) claude=skip`)으로 끝나고 파일이
하나도 새로 쓰이지 않는다. 그게 5-B 멱등 가드가 실제로 도는지 확인하는
자리이기도 하다. `entry=skip`은 템플릿 `src/main.tsx` 첫 줄의
`import './styles/base.css';`를 스크립트가 그대로 인정했다는 뜻이다.

요약에 `skip`이 아닌 항목이 섞이면 템플릿이 정본 자산과 어긋난 것이고, 그 항목은
같은 실행에서 이미 채워졌다 — scaffold를 중단하지는 않는다.

`--no-design-guide`로 호출됐으면 그 파일들을 복사 직후 지우는 대신 **애초에 복사
대상에서 뺀다**: L-2의 `cp -R` 뒤에 `AGENTS.md`·`CLAUDE.md`·`docs/`·
`src/styles/`·`src/components/icons.tsx`를 제거하고, `src/main.tsx` 첫 줄의
`import './styles/base.css';`와 `src/App.tsx`가 쓰는 `var(--…)` 토큰이 함께
사라지므로 **`src/App.tsx`도 토큰 없는 최소 화면으로 되돌린다**. 이 조합은
번거로우니, 디자인 가이드를 원치 않으면 `--local`보다 정본 경로에
`--no-design-guide`를 주는 쪽을 권한다.

`--no-tossface`면 이 검증 호출에도 `--no-tossface`를 준다 — 프리베이크된
`src/styles/base.css`에도 그대로 적용돼(복사는 skip해도 sed는 돈다) 첫 줄의
Tossface CDN `@import`와 `body` `font-family` 스택 맨 앞의 `"Tossface", `가
지워지고, 요약에 `tossface=off`가 찍힌다.

## L-4. 의존성 설치 (옵션)

`--no-install`이 아니면:

```bash
npm --prefix ./<package_name> install
```

- `unmet peer react-native` 경고는 무시해도 된다 — 웹 미니앱은 RN을 쓰지
  않고 devtools가 dev 시점에 SDK를 mock으로 대체한다. 사용자에게도 한 줄로 알린다.
- npm은 Node에 동봉되므로 부재를 걱정할 필요가 없다 — 다른 매니저로 자동
  fallback하지 않는다는 원칙은 유지한다. 사용자가 명시적으로 pnpm/yarn을
  요구하면 "이 템플릿은 npm을 기본으로 가정합니다. 다른 매니저를 쓰려면
  `--no-install`로 만든 뒤 본인 환경에 맞게 설치하세요"로 안내하고 종료.

> **구세대(wf 2.x) 오프라인 폴백**: 이 폴백은 `@apps-in-toss/web-framework`
> 2.x + `granite.config.ts` 형상이다. 정본 경로(create-ait-app — 명시 핀 없이
> 항상 `@latest`)는 wf 3.x + `apps-in-toss.config.ts`를 쓰므로 산출물 형상이
> 서로 다르다 —
> 오프라인/네트워크 제한 환경 전용이며, 온라인이면 정본 경로(`/ait:new`의
> create-ait-app 호출)를 쓴다. 상향은 별도 트리거(devtools가 peer에 wf 3.x를
> 포함하는 릴리스) 전까지 보류한다.

## L-5. 번들 설정 추가 (배포 준비 시)

이 템플릿에는 **번들 설정이 없다**(create-ait-app 템플릿과 다른 점) — 사용자가
배포를 준비하는 시점에 아래를 추가한다:

1. devDependency 추가:

   ```bash
   npm --prefix ./<package_name> install -D @apps-in-toss/cli@^2.5.2
   ```

2. `./<package_name>/granite.config.ts` 생성:

   ```ts
   import { defineConfig } from '@apps-in-toss/web-framework/config';

   export default defineConfig({
     appName: '<appName>',
     brand: {
       displayName: '<displayName>',
       primaryColor: '<primaryColor>',
       icon: '', // 앱 아이콘 https:// URL — /ait:design 으로 생성 후 채운다
     },
     web: {
       host: 'localhost',
       port: <port>,
       commands: {
         dev: 'vite',
         build: 'vite build',
       },
     },
     permissions: [],
     outdir: 'dist',
   });
   ```

3. `package.json`에 `bundle:ait` 스크립트(`"ait build"`) 추가.
4. `.gitignore`에 `.granite/`, `*.ait`가 없으면 추가.

> **알려진 위험(harness#90 보고, 2026-08-07 — 이 문서가 직접 재현·확인한
> 것은 아님)**: `brand.icon`을 빈 값으로 둔 채 빌드한 번들은 콘솔 컴파일은
> 통과(`CREATED`)하지만 앱 실행 시점에 "잠시 문제가 생겼어요"로 실패했다는
> 보고가 있다. 아이콘을 콘솔에 먼저 업로드해 그 URL로 `brand.icon`을 채운
> 뒤 빌드하기를 권장한다.

## L-6. 다음 단계 안내 + dev 서버 기동

```
<app-name> 생성 완료 (./<package_name>/)
디자인 가이드 포함: AGENTS.md·CLAUDE.md · docs/design-guide.md · src/styles/(tokens|base).css · src/components/icons.tsx · 이모지 서체 Tossface

다음 단계 (명령을 몰라도 됩니다 — 따옴표 안 문장을 그대로 말해도 같은 단계로 갑니다):
  cd <package_name>
  npm run dev       # 브라우저에서 devtools panel과 함께 실행
                     # 말로: "브라우저에서 개발 서버 띄워줘"
  /ait:design       # 화면을 만들거나 고침 (템플릿에 담긴 디자인 가이드를 그대로 따릅니다)
                     # 말로: "화면이 좀 구려 보여. 예쁘게 고쳐줘."

배포 준비가 되면:
  /ait:design       # 등록용 로고·썸네일·스크린샷 산출 (앱 아이콘은 등록 전제)
                     # 말로: "등록용 로고랑 스크린샷 만들어줘"
                     # → 호스팅한 아이콘 https:// URL을 (L-5로 만들) granite.config.ts의
                     #   brand.icon에 채운다 (빈 값이어도 ait build는 통과한다 —
                     #   스캐폴드 기본값 자체가 icon: '' 이다. 다만 빈 값으로
                     #   빌드한 번들이 콘솔 컴파일(CREATED)까지는 통과하되 앱
                     #   실행 시점에 "잠시 문제가 생겼어요"로 실패했다는 보고가
                     #   있음 — harness#90, 이 문서가 직접 재현·확인한 것은
                     #   아님. brand.icon을 채우고 빌드하는 경로가 이 보고와
                     #   무관한 정상 경로다)
  (L-5로 번들 설정 추가) → ait build → console MCP(miniapp_create →
  bundle_upload → bundle_upload_complete)로 등록·업로드
  (최초 1회 /mcp 에서 ait-console 인가 필요)

문서가 필요하면 docs MCP(searchDocumentation/getPage)로 조회하세요.
```

`--no-install`이었으면 안내에 `npm install`을 한 줄 추가하고, dev 서버
자동 기동은 **하지 않는다**(사용자가 workspace 통합·lockfile 수동 관리를
의도한 신호). install을 했다면 SKILL.md Step 6의 "dev 서버 자동 기동"과
동일하게 `npm --prefix <project_abs_path> run dev`를 `run_in_background: true`로
기동하고 Local URL을 파싱해 알린다.

## 유지보수 노트

- 이 폴백 경로와 `shared/templates/react-vite/`는 create-ait-app 정본 경로가
  안정화되면 **단계적으로 폐기**한다 (harness#6). 폐기 시
  `scripts/validate-plugin.mjs`의 A3 token-contract 검사도 함께 재편한다.
- 템플릿 추가/수정 시 `template.json`의 `tokens` ↔ `substitute.files` 정합은
  A3가 커밋 시점에 강제한다.
- 템플릿의 디자인 가이드 파일 6종은 `design` skill의
  `assets/project/`에서 **복사한 사본**이다(`tokens.css`·`base.css`·`icons.tsx`·
  `design-guide.md`는 바이트 동일, `AGENTS.md`는 `memory-digest.md`를 마커로
  감싼 것). 값이 바뀌면 사본을 손으로 고치지 말고 정본을 고친 뒤 다시 복사한다 —
  두 곳에서 따로 편집하면 정본 경로(5-B 주입)와 `--local` 경로가 서로 다른
  디자인을 내놓는다.
