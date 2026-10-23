# templates/

`new-miniapp` skill의 **`--local` 폴백 전용** 템플릿 디렉토리. scaffold 정본
경로는 `toss/create-ait-app` 비대화형 호출로 전환됐다(harness#6) — 이
디렉토리는 오프라인/네트워크 제한 환경 폴백으로만 유지되며, 정본 경로
안정화 후 단계적으로 폐기한다(폐기 시 `validate-plugin.mjs` A3
token-contract 검사도 함께 재편).

## 현재 상태

| 템플릿 | 설명 | 의존 | 상태 |
|---|---|---|---|
| `react-vite/` | 기본 React 19 + Vite + `@apps-in-toss/devtools` dev-dep | `@apps-in-toss/devtools` 3.0.x npm(공개 발행, 2026-08-04) | ✅ `--local` 폴백 전용 |

(react-vite-supabase 계획은 철회 — 해당 변형은 create-ait-app의 옵션/샘플로
upstream 조율한다.)

## 원칙

- **단순한 파일 복사 + 변수 치환**으로 동작. 복잡한 템플릿 엔진 도입 금지.
- 변수는 `{{PROJECT_NAME}}` 같은 double-brace 형태로 표시. `new-miniapp`
  skill이 `Edit` tool로 치환.
- **Double-brace는 텍스트 전용 파일에만 사용** (`package.json`, `README.md`,
  `*.config.ts` 주석, `.env.example` 등). JSX/TSX 내부에서는 `{{...}}`가 JS
  표현식(객체 리터럴)으로 파싱되므로 JSX 파일 안 문자열 치환이 필요하면
  `%PROJECT_NAME%` 같은 별도 토큰을 쓰고 각 템플릿의 `template.json`에 명시.
- 각 템플릿 루트에 `template.json` 메타파일(설명, 필수 변수 목록, 치환 규칙,
  post-init instructions)을 둔다.

상위 설계는 `../../CLAUDE.md`의 "Templates" 섹션 참고.
