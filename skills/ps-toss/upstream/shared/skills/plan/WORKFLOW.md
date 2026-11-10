---
name: plan
description: |
  Take a mini-app from a vague idea to a plan — ideate when the user has no
  concrete idea yet, shape a lightweight PRD, look up official docs for
  reference, then map it to the needed SDK domains, the runtime permissions
  they prompt for, and console terms (약관) that gate registration. Use when
  the user asks "미니앱 만들고 싶은데 뭘 만들지 모르겠어" or "미니앱 만들 건데
  필요한 SDK 도메인/권한/약관 먼저 정리해줘", or asks for a PRD ("출시 일정이랑
  범위 정리한 PRD 써줘") — requirements work, not a docs lookup. Writes at most one file (`PRD.md`); no CLI, no console calls.
  Hands off to `/ait:new`. Triggered by `/ait:plan [requirements]`.
argument-hint: '[requirements]'
---

# plan skill

## 목적

`/ait:plan`은 **아이디어가 없는 상태에서도** 시작할 수 있는 기획 station이다.
사용자가 서 있는 지점에 따라 세 구간을 이어서 진행한다:

1. **아이데이션** — 아이디어가 막연할 때 발산 → 실현성 필터 → 후보 1개로 수렴
2. **PRD 디스커션** — 미니앱용 경량 PRD 9섹션을 대화로 채워 `PRD.md`로 남김
3. **매핑** — 그 PRD에서 출시까지 필요한 세 가지를 뽑는다:
   - **SDK 도메인** — 어떤 `@apps-in-toss/web-framework` API 그룹이 필요한가
   - **권한(permissions)** — 그 도메인들이 런타임에 사용자에게 요청하는 권한
   - **약관(terms)** — 등록·배포 시 콘솔이 게이트하는 워크스페이스 약관

요구사항이 이미 또렷하면 1·2를 건너뛰고 3만 해도 된다(아래 "입력"의 모드 판정).

전제: 미니앱은 토스 앱 WebView에서 도는 **웹(React DOM) 앱**이지 React Native
앱이 아니다 — 계획·아키텍처를 웹 스택 기준으로 세우고 RN/네이티브 화면 경로를
전제하지 않는다. 이 전제와 검수 존재가 아이데이션의 실현성 필터를 이룬다.

이 skill은 harness의 **첫 station**이다(station 7 "plan"은 개발 순서상
마지막에 추가됐지만, 흐름상으로는 scaffold 앞에 온다). 빈 디렉토리에서
`/ait:new`로 프로젝트를 만들기 **전에**, 무엇을 쓰게 될지 미리 지도를 그려서
나중에 register/deploy에서 약관 게이트에 막혀 되돌아오는 일을 줄인다.

이 skill은 **기획만** 한다. CLI를 호출하지 않고, 아무것도 등록하지 않으며,
프로젝트를 만들지 않는다. 쓰는 파일은 `PRD.md` 하나뿐이다(아래 "산출물").
hand-off는 `/ait:new`다.

도메인·권한·약관 이름을 **지어내지 않는다**. 확신이 없으면 docs MCP
(`searchDocumentation`/`getPage`)로 문서를 조회하거나 사용자에게 되묻는다.
산출하는 계획·안내에 과장·홍보성 문구는 넣지 않는다.

## 입력

`$ARGUMENTS`를 읽고 **모드를 먼저 판정**한다. 모드가 실행 순서의 진입점을 정한다.

| 모드 | 판정 기준 | 진입 |
|---|---|---|
| A. 아이데이션 | 인자 없음, 또는 "뭘 만들지 모르겠다"류 | 1단계부터 |
| B. PRD | 아이디어 한 줄은 있으나 화면·범위가 안 잡힘 | 3단계부터 |
| C. 매핑 | 기능이 문장으로 나열될 만큼 또렷하거나 `PRD.md`가 이미 있음 | 5단계부터 |

- 모드 C의 `<요구사항>` 예:
  - `"사용자 위치 기반으로 주변 매장을 보여주고, 로그인하면 즐겨찾기를 저장한다"`
  - `"디지털 아이템을 인앱 결제로 판매하는 게임"`
- 인자 없이 호출되면 모드를 한 줄로 확인한다:

  ```
  만들고 싶은 미니앱이 정해져 있나요?
    - 아직 막연하다 → 아이디어를 같이 좁혀갑니다
    - 한 줄로는 있다 → PRD를 같이 채웁니다
    - 기능이 정해져 있다 → 그대로 알려주시면 SDK 도메인·권한·약관으로 정리합니다
  ```

모드 C에서도 도메인·약관 분기를 가르는 모호함이 있으면(결제가 토스페이
체크아웃인지 인앱 디지털 재화(IAP)인지, 로그인이 필요한지) 그 부분만 짧게
되묻는다. 과도한 인터뷰는 하지 않는다.

## 산출물

- **`PRD.md`** — 모드 A·B를 탄 경우 현재 디렉토리에 쓴다. 형식은
  `references/prd-template.md`의 9섹션 고정. 이미 파일이 있으면 덮어쓰지 않고
  이어서 갱신할지 묻는다. 모드 C(요구사항이 이미 또렷함)에서는 사용자가
  요청할 때만 쓴다.
- **계획 블록** — 대화 출력. SDK 도메인·권한·약관 + 다음 station seam(8단계).

`/ait:plan`은 scaffold 전에 도는 station이라 `PRD.md`는 보통 프로젝트 디렉토리가
생기기 전 위치에 놓인다. `/ait:new <app-name>` 후 `<app-name>/`으로 옮겨 두면
이후 station에서 참조하기 쉽다 — 옮기는 것은 사용자 몫이고 이 skill이 파일을
이동시키지 않는다.

## SDK 도메인 카탈로그 (참조 테이블)

매핑의 기준이 되는 도메인은 sdk-example이 실증하는 18개다(`Home`은 셸이라
도메인 분류에서 제외). 각 행의 "권한"과 "약관"이 비어 있으면 그 도메인은 별도
런타임 권한·콘솔 약관을 요구하지 않는다는 뜻이다. **이 표는 출발점이고,
정확한 메서드·권한 상수는 호출 시점에 docs MCP(`getPage`, topic 열의 경로)로
확인한다.**

| 도메인 | 무엇에 쓰나 | 권한(런타임) | 약관(콘솔) | docs MCP topic |
|---|---|---|---|---|
| `auth` | 토스 로그인 → id_token | — | `TOSS_LOGIN` | `guides/auth-flow` |
| `navigation` | 화면 전환·deep-link·뒤로가기 | — | — | `guides/navigation-flow` |
| `environment` | 디바이스·앱 환경 정보 조회 | — | — | `api/environment` |
| `permissions` | 권한 상태 조회·요청 | (요청하는 권한에 따름) | — | `guides/permissions-pattern` |
| `storage` | 키-값 로컬 저장 | — | — | `api/storage` |
| `location` | 현재 위치 | geolocation | — | `guides/location-permission-fallback` |
| `camera` | 카메라 촬영·스캔 | camera (스캔 시 microphone 가능) | — | `guides/camera-album-ux` |
| `contacts` | 연락처 읽기/쓰기 | contacts | — | `api/contacts/fetchContacts` |
| `clipboard` | 클립보드 읽기/쓰기 | clipboard | — | `api/clipboard` |
| `haptic` | 진동 피드백 | — | — | `api/haptic/generateHapticFeedback` |
| `iap` | 인앱 디지털 재화 결제 | — | `IAP` | `guides/iap-payment-flow` |
| `payment` | 토스페이 체크아웃(실물·외부 결제) | — | (결제 유형에 따라 콘솔 확인) | `guides/tosspay-checkout-flow` |
| `ads` | 인앱 광고 게재 | — | `IAA` | `guides/ads-integration` |
| `game` | 게임 세션·익명 키 | — | — | `guides/anonymous-key-game-session` |
| `analytics` | 이벤트 로깅 | — | — | `guides/event-logging` |
| `partner` | 파트너 연동 기능 | (기능별 확인) | (기능별 확인) | `api/partner` |
| `events` | SDK 이벤트 구독 | — | — | `guides/event-subscription` |
| `notification` | 푸시/로컬 알림 | — (OS 권한 없음 — `requestNotificationAgreement()` SDK 동의) | — | `api/notification` |

> `photos`(앨범) 권한은 카메라로 찍은 이미지를 앨범에서 고르거나 저장하는
> 흐름에서 함께 등장한다 — `camera`/`contacts`처럼 도메인에 1:1로 묶이기보다
> "사진을 다루는 기능"에 붙으므로, 그런 요구사항이 보이면 권한 목록에 `photos`를
> 추가한다. 정확한 권한 상수는 docs MCP(topic: `guides/permissions-pattern`)로 확인.

## 약관(terms) 카탈로그 (참조 테이블)

콘솔 약관은 5개 type으로 게이트된다. 등록은 해당 약관에 동의가 되어 있어야
통과한다 — `/ait:plan`은 어떤 약관이 **걸릴지**만 미리 알려주고, 실제 동의
처리는 콘솔 등록(console MCP `miniapp_create`) 시점에 이뤄진다. 약관 type:

| type | 게이트하는 것 | 트리거 도메인 |
|---|---|---|
| `BIZ_WORKSPACE` | app register · app deploy · 워크스페이스 관리 | (모든 출시의 기본 — 도메인 무관) |
| `TOSS_LOGIN` | 토스 로그인 scope · 로그인 사용 앱 등록 | `auth` |
| `IAP` | 인앱 디지털 재화 상품 등록·설정 | `iap` |
| `IAA` | 광고 캠페인 관리 | `ads` |
| `TOSS_PROMOTION_MONEY` | 프로모션 머니 캠페인 관리 | (프로모션 머니 사용 시) |

`BIZ_WORKSPACE`는 **어떤 미니앱이든 출시하려면 필요한 기본 약관**이므로 도메인과
무관하게 항상 계획에 포함한다. 나머지는 트리거 도메인이 계획에 들어왔을 때만
추가한다. type 이름·게이트 범위는 콘솔 등록(console MCP `miniapp_create`) 시점에
반환되는 안내로 확인한다 — 이 skill은 **콘솔 도구를 호출하지 않는다**(분석 전용).
type 매핑이 의심스러우면 사용자에게 그 점을 명시한다.

## 실행 순서

모드 A는 1단계부터, B는 3단계부터, C는 5단계부터 시작한다(위 "입력").

### 1. 아이데이션 — 발산

축 3개(불편 / 반복 / 역발상)로 사용자에게서 후보를 6개 이상 끌어낸다. 이
단계에서는 평가하지 않는다. 축별 질문과 진행 규칙은
**Read <이 skill의 base directory>/references/ideation.md**.

에이전트가 혼자 후보를 지어내 고르지 않는다 — 재료는 사용자에게서 나온다.

### 2. 아이데이션 — 실현성 필터 → 수렴

각 후보에 미니앱 제약 6개를 적용한다: 웹으로 되는가 / SDK 카탈로그 안에 있는가
/ 서버 없이 v1이 되는가 / 한 화면에서 가치가 나는가 / 검수를 통과할 수 있는가 /
권한을 거부해도 쓸모가 있는가. 떨어진 이유를 표로 보여준 뒤 후보 1개로 좁힌다
(상세·수렴 규칙은 `references/ideation.md`).

제약 판정이 불확실하면 4단계의 docs MCP 조회로 확인한다 — "될 것 같다"로 넘기지
않는다.

### 3. PRD 디스커션

`references/prd-template.md`의 9섹션을 **순서대로 하나씩** 채운다
(**Read <이 skill의 base directory>/references/prd-template.md** — 템플릿 전문과
가상 예시 1건). 섹션 5(도메인·권한)·7(수익화→약관)·8(검수 리스크)은 아래
5~7단계의 매핑 결과와 같은 값을 쓴다.

사용자가 모르는 항목은 에이전트가 초안을 제안하고 확인받는다. 확인되지 않은
것은 `(확인 필요)`로 남긴다. 채운 결과를 `PRD.md`로 쓴다(위 "산출물").

### 4. 참고 사례 조회 (docs MCP)

실현성·검수 리스크·화면 거동을 공식 문서로 대조한다. 도구는 docs MCP
(`apps-in-toss-docs`)의 4종뿐이다 — `searchDocumentation`·`getPage`·
`askQuestion`·`sendFeedback`. 단계별 질의어와 결과를 PRD에 반영하는 규칙은
**Read <이 skill의 base directory>/references/reference-lookup.md**.

**"다른 사람이 만든 미니앱 목록"을 조회하는 경로는 없다**(실측 2026-08-10 —
docs MCP는 위 4종이 전부이고, 콘솔 MCP tool은 전수가 자기 워크스페이스 scope다).
사용자가 그런 목록을 요청하면 없다는 것을 그대로 말하고 문서의 샘플·가이드로
대체한다. 목록·사례를 지어내지 않는다.

### 5. 요구사항 → SDK 도메인 매핑

요구사항(모드 A·B를 탔으면 `PRD.md`의 1~4번 섹션)의 각 기능 문장을 위
"SDK 도메인 카탈로그"의 도메인에 매핑한다.
- 명시적으로 언급된 기능(위치, 결제, 로그인 등)을 먼저 잡는다.
- 거의 항상 필요한 보조 도메인을 함께 본다: 화면이 여럿이면 `navigation`,
  값을 로컬에 저장하면 `storage`, 권한을 다루면 `permissions`, 사용 분석이
  필요하면 `analytics`.
- 카탈로그에 없거나 메서드 수준 확인이 필요하면 docs MCP(`searchDocumentation`/
  `getPage`)로 조회한다. 추측으로 메서드/도메인을 지어내지 않는다.

### 6. 도메인 → 권한 도출

매핑된 각 도메인의 "권한" 열을 모아 **중복 제거**한 런타임 권한 목록을 만든다
(예: `geolocation`, `camera`, `contacts`, `microphone`, `photos`).
권한이 없는 도메인(haptic, storage 등)은 권한 목록에 기여하지 않는다.
권한 상수의 정확한 이름이 필요하면 docs MCP(topic: `guides/permissions-pattern`)로
확인한다.

### 7. 능력(capability) → 약관 도출

매핑된 도메인에서 약관 트리거를 모은다(위 "약관 카탈로그"). 항상:
- `BIZ_WORKSPACE`를 기본으로 포함한다.
- `auth` → `TOSS_LOGIN`, `iap` → `IAP`, `ads` → `IAA`를 트리거 도메인이 있을 때 추가.
- 프로모션 머니 사용이 보이면 `TOSS_PROMOTION_MONEY`.

`payment`(토스페이) 약관 매핑이 불확실하면 그 점을 계획에 명시하고, 콘솔 등록
시점에 확인하도록 안내한다 — 임의 type을 만들어내지 않는다.

### 8. 구조화된 계획 출력 + 다음 station seam

아래 형식 한 블록으로 마무리한다. 표는 "이 미니앱에 실제로 필요한 것"만 담고,
카탈로그 전체를 덤프하지 않는다.

```
계획: <앱 한 줄 요약>
PRD: ./PRD.md   # 모드 A·B로 작성한 경우에만. 없으면 이 줄을 생략

SDK 도메인 (필요)
| 도메인 | 왜 필요한가 | docs MCP topic |
|---|---|---|
| auth        | 토스 로그인으로 사용자 식별            | guides/auth-flow |
| location    | 현재 위치로 주변 매장 정렬             | guides/location-permission-fallback |
| storage     | 즐겨찾기를 로컬에 저장                  | api/storage |
| navigation  | 목록 ↔ 상세 화면 전환                   | guides/navigation-flow |

런타임 권한 (사용자에게 요청)
  - geolocation     # 위치 기반 정렬

콘솔 약관 (등록 시 게이트)
  - BIZ_WORKSPACE   # 모든 미니앱 출시의 기본 약관
  - TOSS_LOGIN      # 토스 로그인 사용
  → 동의 처리는 콘솔 등록(console MCP miniapp_create) 시점에 이뤄진다
    (지금 동의하지 않는다 — /ait:plan은 무엇이 걸릴지만 알려준다)

확인이 필요한 항목 (있으면)
  - <불확실한 매핑 — docs MCP 또는 사용자 확인 필요>

다음 단계 (명령을 몰라도 됩니다 — 따옴표 안 문장을 그대로 말해도 같은 단계로 갑니다):
  /ait:new <app-name>     # 이 계획대로 빈 프로젝트 생성 (scaffold — 번들 설정 포함)
                          # 말로: "이 계획대로 미니앱 프로젝트 만들어줘. 이름은 <app-name> 으로."
                          # 이후: npm run dev → /ait:design (화면·등록 이미지 자산) →
                          #       ait build → console MCP로 등록·업로드
```

"확인이 필요한 항목"이 없으면 그 섹션은 생략한다. seam의 핵심은 **다음 station이
`/ait:new`**라는 것 — 계획이 곧바로 scaffold로 이어진다. seam은 슬래시 명령과
자연어 동치를 **함께** 인쇄한다(통일 규칙 — 로컬 `docs/design/skill-conventions.md`
(repo 미포함 — maintainer-local) §9) — 슬래시 네임스페이스가 그대로 오지 않는 에이전트에서는 자연어 쪽이 정규
경로다.

## Out of scope (이 skill이 하지 않는 것)

- ❌ 프로젝트 scaffold — 그건 `/ait:new` (`new-miniapp` skill). 코드·설정 파일도
  만들지 않는다(쓰는 파일은 `PRD.md` 하나).
- ❌ CLI·console MCP 도구 호출 — `ait`도 console MCP 도구도 실행하지 않는다(약관
  확인 포함). 조회하는 MCP는 docs MCP뿐이다.
- ❌ 공개 미니앱 목록·사례 카탈로그 조회 — 그런 tool은 존재하지 않는다(4단계).
  "웹 미니앱 포털"은 harness 산출물이 아니라 제품 결정 항목이다.
- ❌ 콘솔 등록·번들 업로드 — console MCP 도구(`miniapp_create`/`bundle_upload`/
  `bundle_upload_complete`)의 역할.
- ❌ 약관 동의 실행 — 어떤 약관이 걸릴지만 예고하고, 실제 동의 처리는 콘솔 등록
  (console MCP `miniapp_create`)에서 이뤄진다.
- ❌ 권한 상수·메서드 이름 지어내기 — 불확실하면 docs MCP로 확인하거나
  명시적으로 "확인 필요"로 남긴다.
- ❌ 화면 디자인·이미지 자산 산출 — 디자인 station(`/ait:design`)의 책임.

## 하지 말아야 할 것

- ❌ 카탈로그에 없는 도메인·권한·약관 type을 그럴듯하게 지어내기. 모르면 "확인 필요"로 남긴다.
- ❌ `ait`(= `@apps-in-toss/cli`, 번들러)와 console MCP(콘솔 등록/업로드/조회)를
  혼동. 번들은 `ait build`, 등록·업로드·상태는 console MCP 도구다.
- ❌ 전체 카탈로그 덤프. 출력은 "이 미니앱에 필요한 것"만 추린다.
- ❌ 약관에 자동 동의하거나, 동의가 이미 됐다고 가정. plan은 예고만 한다.
- ❌ 사용자에게 묻지 않고 아이디어 후보를 지어내 그중 하나로 확정하기. 발산의
  재료는 사용자에게서 나오고, 최종 선택도 사용자가 한다.
- ❌ 실현성 필터를 건너뛴 후보를 PRD로 넘기기. 웹뷰 제약·SDK 카탈로그·검수를
  통과하지 못하는 아이디어는 PRD 중반에 무너진다.
- ❌ 실존 서비스를 그대로 모방하는 후보나 예시를 권하기. 토스 브랜드·화면을
  흉내 내는 기획도 마찬가지다.
- ❌ 기존 `PRD.md`를 확인 없이 덮어쓰기.
- ❌ 시장 규모·사용자 수·매출 같은 근거 없는 숫자를 PRD에 넣기.
- ❌ 산출하는 계획·안내에 과장·홍보성 문구.

## 참고

- 상세가 필요하면 Read <이 skill의 base directory>/references/ideation.md
  (발산 축·실현성 필터 6개·수렴 규칙), references/prd-template.md (PRD 9섹션
  템플릿 + 가상 예시), references/reference-lookup.md (docs MCP 질의어·조회 경로
  판정).
- 짝 skill: `new-miniapp` (`/ait:new`) — 이 계획대로 빈 프로젝트를 만드는 다음 station.
- 약관 동의·매니페스트 등록은 console MCP 도구(`miniapp_create`)가 실제로
  수행한다 — 인가는 `/mcp`에서 `ait-console` 1회 승인(브라우저 OAuth).
- 주제별 가이드(권한 패턴·로그인 흐름·IAP 결제 흐름 등)는 docs MCP
  (`searchDocumentation`/`getPage`)로 조회한다.
- `auth` 도메인(토스 로그인) 화면을 실제로 디자인할 때는 `design` skill의
  "토스 브랜드·UI 모방 금지" 절을 따른다 — 토스 로그인 화면을 시각적으로
  흉내 내지 않는다.
