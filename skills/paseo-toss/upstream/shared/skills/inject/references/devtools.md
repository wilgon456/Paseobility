# devtools facet — `/ait:inject-devtools` 상세

이미 `@apps-in-toss/web-framework`를 사용하는 기존 프로젝트에 `@apps-in-toss/devtools` unplugin을
추가해, 토스 앱 없이 브라우저에서 개발·테스트할 수 있게 한다. brownfield 진입점 — 기존
파일을 최소한으로 수정하고, 이미 설정이 있으면 skip한다. `/ait:inject-devtools`는 인자를
받지 않는다.

생성되는 파일/주석에 과장·홍보성 문구를 넣지 않는다. 생성하는 주석은 배선을 설명하는 최소한으로.
이 skill은 콘솔 인증을 요구하지 않는다 — devtools는 로컬 dev 전용.

## 의존

- **npm / pnpm / yarn / bun** 중 하나. 감지 순서: `package-lock.json` → `pnpm-lock.yaml` →
  `yarn.lock` → `bun.lockb`. 아무것도 없으면(lockfile 무신호) `npm`으로 가정.
- **`package.json`이 cwd에 있어야 한다**. 없으면 프로젝트 루트로 이동하도록 안내하고 중단.
- 인터넷 연결 필요 (`@apps-in-toss/devtools` npm 설치).

## 1. 프로젝트 루트 확인

```bash
ls package.json
```

없으면 즉시 중단:

```
package.json이 없습니다. 프로젝트 루트 디렉토리에서 다시 실행해주세요.
예: cd <project-root> && /ait:inject-devtools
```

## 2. 빌드 도구 감지

아래 순서로 감지한다. 첫 번째로 매칭된 것을 사용.

| 우선순위 | 감지 조건 | 빌드 도구 |
|---|---|---|
| 1 | `vite.config.ts` 또는 `vite.config.js` 존재 | **Vite** |
| 2 | `next.config.ts` 또는 `next.config.js` 또는 `next.config.mjs` 존재 | **Next.js** |
| 3 | `rspack.config.ts` 또는 `rspack.config.js` 존재 | **Rspack** |
| 4 | `webpack.config.ts` 또는 `webpack.config.js` 존재 | **Webpack** |

```bash
ls vite.config.ts vite.config.js next.config.ts next.config.js next.config.mjs \
   rspack.config.ts rspack.config.js webpack.config.ts webpack.config.js 2>/dev/null
```

감지 실패면:

```
빌드 도구를 감지하지 못했습니다.
현재 지원: Vite, Next.js, Rspack, Webpack.
config 파일(예: vite.config.ts)이 프로젝트 루트에 있어야 합니다.
```

중단하고 사용자가 빌드 도구를 알려주면 수동 가이드를 진행한다.

## 3. 패키지 매니저 감지

```bash
ls package-lock.json pnpm-lock.yaml yarn.lock bun.lockb 2>/dev/null
```

| lockfile | 매니저 |
|---|---|
| `package-lock.json` | npm |
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | yarn |
| `bun.lockb` | bun |
| (없음, 무신호) | npm (기본값) |

## 4. 이미 설치됐는지 확인 (idempotency)

`package.json`의 `devDependencies`에 `@apps-in-toss/devtools`가 있으면 설치 단계를 건너뛴다.
있더라도 config 패치 단계(step 6)는 진행한다 — config가 누락됐을 수 있기 때문.

```bash
grep '"@apps-in-toss/devtools"' package.json
```

## 5. 패키지 설치

Step 4에서 이미 있으면 skip.

```bash
npm install --save-dev @apps-in-toss/devtools # npm (기본)
pnpm add -D @apps-in-toss/devtools            # pnpm
yarn add -D @apps-in-toss/devtools            # yarn
bun add -d @apps-in-toss/devtools             # bun
```

설치 시 `unmet peer react-native` 경고가 나올 수 있다 — **무시해도 된다**. 웹 미니앱은 RN을
쓰지 않고, devtools가 dev 시점에 SDK를 mock으로 대체하기 때문.

## 6. config 파일 패치 (idempotency)

config 파일을 **Read**로 읽어 내용을 파악한 뒤, `@apps-in-toss/devtools/unplugin` import와 plugin
등록이 이미 있으면 skip. 없으면 최소 변경으로 추가. **idempotency 체크**: config 파일에
`@apps-in-toss/devtools` 문자열이 있으면 skip:

```
이미 @apps-in-toss/devtools 설정이 있습니다. 설정 파일을 확인하고 필요하면 수동으로 조정하세요.
```

### Vite (`vite.config.ts` / `vite.config.js`)

import를 파일 맨 위 기존 import 블록 끝에 추가하고, `plugins` 배열에 `aitDevtools.vite()`를
추가한다.

**패턴: `plugins` 배열이 이미 있는 경우**

```ts
// 추가 후
import aitDevtools from '@apps-in-toss/devtools/unplugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), aitDevtools.vite({ panel: true })],
  // SDK와 bridge/analytics 엔트리를 Vite dep pre-bundle에서 제외한다.
  // unplugin의 resolveId가 enforce:'pre'라 이게 없어도 source import는
  // mock으로 정상 rewrite되지만, 빼두면 Vite가 실 @apps-in-toss/web-*를
  // 쓸데없이 pre-bundle하지 않고(orphan dead weight 방지) 향후 번들러
  // ordering 변화에도 안전하다. greenfield 템플릿과 동일하게 맞춘다.
  optimizeDeps: {
    exclude: [
      '@apps-in-toss/web-framework',
      '@apps-in-toss/web-bridge', // 2.x back-compat
      '@apps-in-toss/web-analytics', // 2.x back-compat
      '@apps-in-toss/webview-bridge', // 3.0+ (unplugin이 함께 intercept)
    ],
  },
});
```

**패턴: `plugins`가 없는 경우** — `defineConfig({})` 객체에 `plugins` 키를 추가.
`optimizeDeps.exclude`도 위 패턴과 동일하게 함께 추가해야 한다.

**Vite 8 주의 (rolldown)**: `vite.config.ts`가 `"type": "module"` ESM 환경이고
`@apps-in-toss/web-framework` alias를 `resolve.alias`로 직접 걸어두는 프로젝트는 plugin의
`mock: false`로 두는 게 안전하다. 이 경우는 고급 설정이므로 일반 사용자에게는
기본값(`aitDevtools.vite()`)을 권장하고, 문제가 생기면 수동 조정을 안내한다.

### Next.js (`next.config.ts` / `next.config.js` / `next.config.mjs`)

Next.js는 `webpack()` 플러그인을 사용한다. `config.plugins` 배열에 push하는 패턴을 따른다.

```ts
import aitDevtools from '@apps-in-toss/devtools/unplugin';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack(config) {
    config.plugins.push(aitDevtools.webpack());
    return config;
  },
};
export default nextConfig;
```

`webpack` 함수가 없으면 `nextConfig` 객체에 `webpack` 키를 추가(기존 설정 유지).

### Rspack (`rspack.config.ts` / `rspack.config.js`)

```ts
import aitDevtools from '@apps-in-toss/devtools/unplugin';

export default {
  // 기존 설정 유지
  plugins: [aitDevtools.rspack()],
};
```

### Webpack (`webpack.config.ts` / `webpack.config.js`)

```ts
import aitDevtools from '@apps-in-toss/devtools/unplugin';

module.exports = {
  // 기존 설정 유지
  plugins: [aitDevtools.webpack()],
};
```

**config 파일 수정 원칙**:
- `Edit`로 최소 변경. 기존 코드 포맷·주석·설정은 유지.
- `aitDevtools.vite({ panel: true })`로 쓴다 — `panel: true`가 정본이며 템플릿·sdk-example과
  동일하게 맞춘다.
- `production` 빌드에서는 unplugin이 자동으로 비활성화된다(`NODE_ENV=production` 감지). 빌드
  결과물에 mock이 포함되지 않으므로 추가 조건 분기는 불필요.

## 7. devtools facet 완료 seam

```
@apps-in-toss/devtools 설정 완료

변경 내용:
  - devDependencies에 @apps-in-toss/devtools 추가 (또는 이미 있어서 skip)
  - <config-file>에 unplugin 설정 추가 (또는 이미 있어서 skip)

다음 단계 (명령을 몰라도 됩니다 — 따옴표 안 문장을 그대로 말해도 같은 단계로 갑니다):
  npm run dev                # (또는 pnpm dev / yarn dev / bun dev)
                            #   말로: "브라우저에서 개발 서버 띄워줘"
  /ait:debug                # 브라우저 패널·window.__ait 상태로 디버깅
                            #   말로: "브라우저에서 앱 상태가 이상한데 디버깅해줘"

브라우저에서 앱을 열면 하단에 AIT DevTools 패널이 나타납니다.
패널에서 mock 상태(권한, 위치, IAP 등)를 실시간으로 제어할 수 있습니다.

참고:
  - AIT DevTools 패널은 진입점(main/index/entry/app.{ts,tsx,js,jsx})에 자동으로 마운트됩니다 — 별도 설정 불필요.
  - 진입점 파일명이 위 패턴과 다르면 패널이 자동 주입되지 않을 수 있습니다. 그럴 때만 진입점에 수동으로 추가하세요:
      import '@apps-in-toss/devtools/panel';
  - devtools는 NODE_ENV=development 에서만 활성화됩니다 (production 빌드엔 미포함).
  - 문서: 구 repo 이력에만 존재하던 devtools 소스 트리(재생성으로 링크 소멸, maintainer 로컬 백업 mirror에서 열람 가능)
```

## devtools facet 하지 말아야 할 것

- ❌ config 파일을 완전히 재작성. **최소 변경 only** (`Edit` 사용).
- ❌ `devDependencies`에서 `dependencies`로 옮기기. devtools는 반드시 `devDependencies`.
- ❌ production 빌드에 devtools를 강제로 포함시키기 — `NODE_ENV=development`에서만
  활성화되도록 두어야 한다(production 산출물에 mock이 섞이면 앱 스토어 심사에서 문제가 될 수
  있다). 옵션으로 dev-mode를 강제하지 말 것.
- ❌ `@apps-in-toss/devtools` 외의 다른 패키지 설치·변경.
- ❌ devtools를 Rollup/esbuild 라이브러리 빌드에 주입 — 앱(미니앱) 전용.
- ❌ 사용자 프로젝트에 홍보성 주석·배너 삽입. 생성하는 주석은 배선을 설명하는 최소한으로.
