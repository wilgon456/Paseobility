# tossface facet — `/ait:inject-tossface` 상세

이모지를 토스페이스 글리프로 렌더하도록 CDN 링크 또는 서체 subset 번들을 프로젝트
진입 CSS/HTML에 와이어업한다. brownfield 진입점 — 기존 파일을 최소한으로 수정하고,
이미 배선이 있으면 skip한다. `/ait:inject-tossface`는 인자를 받지 않는다.

`design` skill의 서체 정책상 본문 서체(`Toss Product Sans` 계열)는 금지지만, 이모지
서체 `Tossface`(`toss/tossface`로 공개 배포)는 금지 대상이 아니라 권장 대상이다.

생성·수정하는 파일에 과장·홍보성 문구를 넣지 않는다. 생성하는 주석은 배선을 설명하는
최소한으로. 이 skill은 콘솔 인증을 요구하지 않는다 — 로컬 작업이다.

## 의존

- **인터넷 연결 필요**: 모드 A는 런타임에 브라우저가 CDN에서 CSS/폰트를 내려받고,
  모드 B는 절차 중 `curl`로 공식 `dist/tossface.css`와 subset 원본 `.woff2` 파일을
  받는다.
- 프로젝트 진입 CSS 또는 HTML 파일의 위치 — 프로젝트마다 다르므로 먼저 구조를
  확인한다.

## 0. 기존 배선 확인 (idempotency)

절차를 시작하기 전에 프로젝트에 이미 Tossface가 배선돼 있는지 먼저 훑는다:

```bash
grep -rn "Tossface" --include="*.css" --include="*.html" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" .
```

`@import`·`<link>`·`@font-face`·`font-family` 중 어디서든 `Tossface`가 잡히면 이미
배선된 것이다 — 어느 모드(A/B)로 배선돼 있는지 사용자에게 현황을 보고하고, 중복으로
다시 주입하지 않는다. 아무것도 안 잡히면 1단계로 진행한다.

### 스캐폴드 기본 배선을 만난 경우

`/ait:new`로 만든 프로젝트는 **모드 A가 이미 배선돼 있다** — 디자인 가이드 주입이
`src/styles/base.css` 첫 줄에 CDN `@import`를 넣고 `body` 폰트 스택 맨 앞에
`Tossface`를 둔다. 그러니 위 grep이 `src/styles/base.css`에서 두 군데를 잡는 것이
스캐폴드 직후의 정상 형상이다. 이 경우:

- **감지·보고만 한다.** `@import`를 또 넣거나 폰트 스택을 다시 손대지 않는다 —
  같은 CDN `@import`가 두 줄이 되면 뒤엣것은 무의미하고, 폰트 스택이 중복되면
  읽기만 어려워진다.
- 사용자가 `/ait:inject-tossface`를 부른 이유는 대개 "**오프라인에서도 확실히**"다.
  현황(모드 A 배선됨)을 한 줄로 알린 뒤, 모드 B(번들 포함)로 전환할지 물어본다.
  전환에 동의하면 아래 모드 B 절차를 그대로 밟되 마지막에 `base.css` 첫 줄의 CDN
  `@import`를 지워 두 경로가 겹치지 않게 한다.
- 모드 A를 유지하기로 하면 아무것도 바꾸지 않고 끝낸다. 실기기에서 실제 렌더와
  CDN 도달성을 확인하는 경로(`/ait:test-on-device`)만 안내한다.

`--no-tossface`·`--tds`로 만든 프로젝트, 또는 `/ait:new`를 거치지 않은 기존
프로젝트는 grep에 아무것도 안 잡힌다 — 그때가 아래 1단계부터 도는 정규 경로다.

## 1. 두 모드와 대가 확인 + 모드 확정

어느 쪽이 맞을지는 프로젝트가 쓰는 이모지 범위에 달려 있다. 실제 증가량을 계산해서
보여준 뒤 사용자가 고르게 한다:

| 모드 | 무엇을 하나 | 번들 증가 | 대가 |
|---|---|---|---|
| **A. CDN 링크** | 진입 CSS/HTML에 `@import`/`<link>` 한 줄 추가 | 0 | 런타임에 필요한 subset만 CDN에서 내려받음 — 네트워크·CDN 도달성에 의존한다. 토스 앱 webview에서 jsdelivr CDN 로드는 확인됐다(2026-10-14, iOS 실기기·Android 에뮬레이터). |
| **B. 번들 포함** | 필요한 subset의 원본 파일을 프로젝트 정적 자산으로 배치 | 담는 subset마다 약 **520KB ~ 1.9MB** 증가(`dist/tossface.css`는 `unicode-range`로 나뉜 12개 subset `TossFaceFontMac-00`~`-11`의 모음이다) | 네트워크 없이 결정적으로 동작. 원본을 다른 소프트웨어와 번들·재배포하려면 저작권 안내 + 라이선스 전문 동봉이 라이선스 요건이다 |

**모드 B를 고른 경우 바로 진행하지 않는다** — 아래 모드 B 절차 2단계(subset 번호
결정) 직후, 실제로 담을 subset 개수와 파일별 실측 크기 합계를 사용자에게 보여주고
모드(A/B)를 다시 확정받는 마디를 거친다. 계산된 합계가 위 표의 대략치를 크게
벗어나거나(예: 이모지가 동적으로 정해지는 앱이라 사실상 전량이 필요한 경우) 사용자가
예상한 범위를 넘으면, 그 자리에서 모드 A로 되돌아갈 기회를 준다. 빌드가 끝난 뒤에야
용량이 드러나는 것을 막기 위한 확인이다.

### 모드 A 절차 — CDN 링크

**`@import`는 `@charset`을 제외한 다른 CSS 규칙보다 앞, 즉 진입 CSS 파일의 최상단에
와야 한다** — 이건 CSS 표준 동작이다. 다른 규칙 뒤나 파일 하단에 추가하면 브라우저가
에러 없이 조용히 무시하고 배선이 무효가 된다. 반드시 진입 CSS의 맨 위에 놓는다:

```css
@import url('https://cdn.jsdelivr.net/gh/toss/tossface/dist/tossface.css');
```

CSS `@import` 대신 HTML에 `<link>`로 넣을 수도 있다 — 공식 README가 안내하는 형태
그대로:

```html
<link rel="preconnect" href="https://cdn.jsdelivr.net" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
<link href="https://cdn.jsdelivr.net/gh/toss/tossface/dist/tossface.css" rel="stylesheet" type="text/css" />
```

그 뒤 `font-family` 스택 **맨 앞**에 `Tossface`를 추가한다(예:
`font-family: 'Tossface', -apple-system, system-ui, sans-serif;`). 이모지 서체에는
라틴·한글 글리프가 없으므로 본문 렌더는 영향받지 않는다 — 맨 앞에 두지 않으면 안
된다: iOS/macOS에서 `-apple-system`·`system-ui`는 Apple Color Emoji를 포함하는
합성(composite) 시스템 폰트라, 폴백 체인 끝에 두면 이모지 코드포인트가 그 안에서 이미
매칭돼 Tossface까지 내려오지 않는다(주 타깃인 토스 앱 iOS webview에서 배선이 조용히
무효가 되고 Android에서만 적용되는 결과). 이 모드는 파일을 새로 만들지 않는다 —
브라우저가 실제로 렌더하는 이모지의 코드포인트가 속한 subset만 그 시점에 내려받는다.

> **도달성**: 토스 앱 webview에서 jsdelivr CDN 로드를 확인했다(2026-10-14, iOS 실기기·
> Android 에뮬레이터). iOS는 CSS·폰트가 약 0.3초 안에 로드됐고, Android는 폰트 로드에
> 약 2초가 걸려 첫 화면에서 시스템 이모지가 잠깐 보일 수 있다. 사용자 네트워크에서
> CDN이 막힌 환경이면 모드 B로 폴백한다. **자기 앱에서 확인하려면
> `/ait:test-on-device`(번들 업로드 → 콘솔 컴파일 확인 → 토스 앱에서 열어 이모지 렌더
> 확인)로 한다** — 이 skill은 로컬 배선만 하고 실기기 확인은 하지 않는다.

### 모드 B 절차 — 번들 포함

원본 파일을 **수정하지 않은 채** 12개 subset 중 앱이 실제로 쓰는 것만 골라 담는다.
재-subsetting이나 포맷 변환은 하지 않는다(하지 말아야 할 것의 라이선스 근거 참조).

1. 프로젝트 소스(문자열·JSX 텍스트)에서 이모지 문자를 훑어 코드포인트 집합을 만든다.
2. 공식 `toss/tossface` 저장소의 `dist/tossface.css` 원문을 그대로 받는다(`WebFetch`는
   본문을 모델이 가공해 돌려주는 경로라 `unicode-range` 값 전수를 정확히 보존한다는
   보장이 없으므로 쓰지 않는다):

   ```bash
   curl -sSL https://cdn.jsdelivr.net/gh/toss/tossface/dist/tossface.css
   ```

   각 `@font-face` 블록의 `unicode-range`와 1번의 코드포인트 집합을 대조해서 필요한
   subset 번호(`TossFaceFontMac-00`~`-11`)를 정한다. 코드포인트가 여러 subset에
   걸치면 걸친 것을 모두 담는다. **이모지가 동적으로 정해지는 앱(사용자 입력·서버
   응답)이면 사실상 전량(12개, 약 13.2MB)이 필요하다는 뜻이므로, 그 경우 모드 A를
   권한다.**

   **여기서 멈춘다** — 정한 subset 번호의 개수와, 각 subset 파일의 실측 크기(공식
   `dist/`에서 `curl -sI`로 `Content-Length`를 확인하거나 위 표의 subset당
   520KB~1.9MB 범위로 어림)를 합산해 사용자에게 보여주고, 위 1단계에서 예고한 모드
   확정 마디를 지금 거친다. 사용자가 진행을 확정해야 3번으로 넘어간다.
3. 고른 subset마다 `TossFaceFontMac-NN.woff2` 파일을 **원본 그대로** 받아 프로젝트
   정적 자산 디렉토리(예: `public/fonts/tossface/` — 실제 위치는 프로젝트 구조를
   먼저 확인)에 배치한다:

   ```bash
   curl -sSL -o public/fonts/tossface/TossFaceFontMac-<NN>.woff2 \
     https://cdn.jsdelivr.net/gh/toss/tossface/dist/TossFaceFontMac-<NN>.woff2
   ```

   `<NN>`은 2번에서 정한 subset 번호(`00`~`11`)로 치환한다. 파일을 다시 subsetting하거나
   포맷 변환하지 않는다.
4. **라이선스 요건을 충족한다**: 같은 디렉토리에 저장소의 `LICENSE` 전문을 그대로
   두고, 프로젝트 CSS의 `@font-face` 블록 위에 저작권 안내 주석을 남긴다(예:
   `Copyright (c) 2022, 2023 Viva Republica, with Reserved Font Name Tossface.` — 공식
   `dist/tossface.css` 첫 줄의 저작권 표기 그대로). 이 단계를 건너뛰면 번들·재배포
   조건을 어긴다.
5. 고른 subset의 `@font-face` 블록만 로컬 경로로 프로젝트 CSS에 작성한다 —
   `unicode-range`는 공식 CSS의 값을 그대로 유지한다(브라우저가 필요할 때만 파일을
   받는다). **`src`는 3단계에서 실제로 받아 배치한 포맷만 남긴다** — 공식 블록은
   `.woff2`와 `.woff` 두 파일을 나열하지만, 3단계는 `.woff2`만 받으므로 그대로
   옮기면 존재하지 않는 `.woff` 참조가 남는다. `.woff`도 배치했으면 그 항목을 남겨도
   된다. 이 CSS도 **진입 CSS 파일의 최상단**(다른 규칙보다 앞)에 두거나 별도 파일로
   분리해 진입 CSS에서 최상단에 import한다 — `@font-face` 자체는 `@import`와 달리
   위치 제약이 없지만, 진입점 초반에 두면 폰트 로딩이 화면 렌더보다 늦게 시작되는
   것을 줄인다.
6. `font-family` 스택 **맨 앞**에 `Tossface`를 추가한다(모드 A와 같은 이유 — 위
   모드 A 절차 참조).
7. 빌드 산출물에 폰트가 실제로 포함됐는지와 늘어난 용량을 확인해 사용자에게 보고한다.

각 단계의 정적 자산 디렉토리 위치·진입 CSS 파일은 프로젝트마다 다르므로, 먼저
프로젝트 구조를 확인하고 그에 맞춰 진행한다 — 파일로 확인하지 못한 명령을 지어내지
않는다.

## 2. tossface facet 완료 seam

```
Tossface 배선 완료 · <모드 A: CDN 링크 추가 | 모드 B: subset <N>개 번들, +<증가량>>

변경 내용:
  - 모드 A: 진입 CSS/HTML에 CDN @import 또는 <link> 추가
    모드 B: 정적 자산 디렉토리에 subset .woff2 <N>개 + LICENSE 배치, CSS에
            @font-face 블록 추가
  - font-family 스택 맨 앞에 Tossface 추가

다음 단계 (명령을 몰라도 됩니다 — 따옴표 안 문장을 그대로 말해도 같은 단계로 갑니다):
  npm run dev               # 브라우저에서 이모지 렌더 확인
                            #   말로: "브라우저에서 개발 서버 띄워줘"
  /ait:design                # 화면 렌더 무결성(G7 등) 판정으로 이어서 확인
                            #   말로: "화면 디자인 품질 점검해줘"

실기기(토스 앱 webview)에서 실제 렌더·CDN 도달성을 확인하려면:
  /ait:test-on-device         # 번들 업로드 → 콘솔 컴파일 확인 → 토스 앱에서 열기
                            #   말로: "번들 올려서 폰에서 확인해줘"

참고: https://github.com/toss/tossface (LICENSE 전문, 공개 안내 페이지
  https://toss.im/tossface/copyright)
```

## tossface facet 하지 말아야 할 것

- ❌ 재-subsetting·포맷 변환 — 라이선스 전문에는 "Reserved Font Name" 조항이 없다.
  실제 근거는 정의절의 '수정본'("포맷의 변경"을 명시적으로 포함) 정의와, 허가 조건
  1항(허용되지 않은 수정본 금지)·3항(저작권자·저자 이름을 수정본 사용 유도·광고
  목적으로 쓰는 것 제한)이다. (공식 `dist/tossface.css`의 저작권 주석은 `with
  Reserved Font Name Tossface`라고 표기하지만, 이는 CSS 파일의 저작권 고지 문구일
  뿐 라이선스 전문의 별도 조항이 아니다 — 위 4단계의 저작권 안내 주석에는 이 표기를
  그대로 옮기되, 재-subsetting 금지의 법적 근거로 인용하지 않는다.)
- ❌ 폰트 자체의 판매·재배포 상품화.
- ❌ 본문 서체로 사용 — Tossface는 이모지 서체다(`design` skill "토스 브랜드·UI 모방
  금지" 절 참조 — 본문 서체는 별도로 금지된 축이다).
- ❌ 라이선스 파일 없이 번들 (모드 B에서 `LICENSE` 동봉을 건너뛰는 것).
- ❌ `@import`를 다른 CSS 규칙 뒤나 파일 하단에 추가 — CSS 표준상 조용히 무효가
  되고, 에러가 나지 않아 원인 파악이 어렵다.
