# {{app_name}}

`agent-plugin`의 `react-vite` 템플릿에서 시작한 Apps in Toss 미니앱 프로젝트입니다.

## 스택

- React 19 + Vite + TypeScript (strict)
- [`@apps-in-toss/web-framework`](https://www.npmjs.com/package/@apps-in-toss/web-framework) — 미니앱 SDK
- `@apps-in-toss/devtools` —
  브라우저에서 SDK API를 mock해 토스 앱 없이 개발할 수 있게 해주는 dev 전용 도구.
  Production 빌드에서는 자동으로 비활성화됩니다.

## 디자인 가이드

화면 규칙과 토큰이 프로젝트 안에 함께 들어 있습니다. 에이전트 세션은 `AGENTS.md`
(와 그것을 참조하는 `CLAUDE.md`)를 자동으로 읽어 같은 기준으로 화면을 만듭니다.

| 파일 | 내용 |
|---|---|
| `AGENTS.md` · `CLAUDE.md` | 하드 규칙·토큰 요약 — 매 세션 자동으로 읽힙니다 |
| `docs/design-guide.md` | 3층 규칙 전문(하드·권장·자유) |
| `src/styles/tokens.css` | 색·타이포·간격 토큰 — 값의 정본입니다 |
| `src/styles/base.css` | 기본 요소 스타일 + 이모지 서체 Tossface 배선 |
| `src/components/icons.tsx` | 꺾쇠·닫기·검색 아이콘 6종(`currentColor`) |

토큰은 브랜드에 맞게 `src/styles/tokens.css`에서 직접 고쳐 쓰면 됩니다 —
`--brand-primary`는 중립 기본값이라 바꾸는 것이 정상입니다.

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 열리면 우하단의 devtools panel로 mock SDK 상태를 확인할 수 있습니다.

## 빌드

```bash
npm run build      # tsc -b && vite build
npm run preview    # 로컬에서 빌드 결과 확인
```

## 배포

번들 빌드 환경(`granite.config.ts` + `@apps-in-toss/cli`)이 아직 없다면 `agent-plugin`의
`/ait:new` 또는 `new-miniapp` skill(L-5 절차)로 추가한 뒤:

```bash
ait build
```

로 `.ait` 번들을 만듭니다. 콘솔 등록·업로드는 `agent-plugin`을 설치한 에이전트 세션에서
`/mcp`로 `ait-console`을 1회 승인한 뒤 콘솔 MCP 도구(`miniapp_create` →
`bundle_upload` → `bundle_upload_complete`)로 진행하세요.

## 다음 단계

- `src/App.tsx`에서 화면을 수정합니다.
- `@apps-in-toss/web-framework`에서 필요한 SDK API를 import해서 호출합니다.
  개발 중에는 devtools가 자동으로 mock으로 대체합니다.
- 화면을 새로 만들거나 고칠 때는 `/ait:design`을 부르세요 — 위 디자인 가이드를
  그대로 따라 화면 파일을 쓰고 고칩니다.
- 처음 배포 전에 콘솔에 워크스페이스/앱이 등록되어 있는지
  콘솔 MCP 도구(`miniapp_get_status`)로 확인하세요.
