---
name: ux-writing
description: |
  Rewrite mini-app screen copy against measurable UX writing principles.
  Use when the user asks "문구 다듬어줘", "카피 점검해줘", or "UX 라이팅
  기준으로 봐줘" — invoke it right away even with no screen or file named
  yet, it surveys the current project's screen copy first, so do not ask
  a clarifying question or answer with generic advice instead of running
  it. This is a structured rewrite pass, not a one-off inline answer:
  collect every string, check it against the standard, propose
  before/after pairs, apply only what the user confirms. Covers loading
  states, empty results, network failures, permission denials, submit
  CTAs, terms agreements, amount/period notices. Turns design skill's G6
  copy grading ("조정 필요") into concrete before/after proposals —
  user-as-subject phrasing, no loss-framing, no assumed emotions, no
  crammed conditions, no repeated claims, error copy with cause + next
  action, clear CTA labels, consistent tone. Never mass-replaces strings
  without confirmation. Hands off to `/ait:design` for G6 re-grading.
  Triggered by `/ait:ux-writing [screen or files]`.
argument-hint: '[screen or files]'
---

# ux-writing skill

## 목적

화면 문구가 이미 있고 더 낫게 다듬어야 할 때 쓰는 재작성 조력 skill이다.
판정(카피가 기준에 맞는가)은 `design` skill의 quality bar G6(카피)·G8
(다크패턴)이 하고, 이 skill은 **어떻게 고칠 것인가**를 담는다 — 같은 규칙을
두 곳에서 다시 정의하지 않고, 여기서는 재작성 원칙·절차·before/after 예시만
다룬다.

산출은 항상 **제안**이다. 코드나 문구 파일을 실제로 고치기 전에 사용자
확인을 받는다 — 확인 없이 문자열을 일괄 치환하지 않는다.

## 언제 쓰나

- 화면에 이미 문구가 있고, 더 나은 카피로 다듬고 싶을 때.
- `design` skill의 품질 판정에서 G6(카피)에 "조정 필요"가 나와서 실제로
  손을 대야 할 때.

```
/ait:ux-writing [화면 또는 파일]
                          # 말로: "이 화면 문구를 UX 라이팅 기준으로 다듬어줘"
```

대상을 지정하지 않고 불러도 된다 — 1단계에서 현재 프로젝트의 화면 문구를
먼저 훑어 대상 목록을 함께 확인한다.

## 문구 원칙

아래 축으로 문구를 점검하고 고친다. 괄호 안 표기는 `design` skill의
`references/quality-bar.md`에 있는 대응 판정 항목이다 — 이 skill은 그
기준을 참조할 뿐 다시 정의하지 않는다.

- **사용자가 하는 일을 주어로 쓴다** — "시스템이 처리 중입니다" 같은
  수동 문장 대신 사용자가 지금 무엇을 기다리는지, 무엇을 하는지로 쓴다.
  (판정 항목 아님 — 재작성 관점. quality-bar에 대응 항목이 없다.)
- **얻는 것으로 말한다** — 손실·불안을 자극하는 프레이밍("놓치면
  손해")을 쓰지 않는다(G6-6).
- **확인 가능한 사실로 쓴다** — 사용자의 감정을 대신 단정하지 않는다
  (G6-7).
- **문장을 나눈다** — 한 문장에 조건·수치를 몰아넣지 않는다(G6-8).
- **반복하지 않는다** — 같은 주장을 제목·부제·본문에서 표현만 바꿔
  되풀이하지 않는다(G6-9).
- **원인과 다음 행동을 함께 말한다** — 에러 문구는 "오류가
  발생했습니다"로 끝내지 않는다(G6-2).
- **버튼은 결과를 말한다** — "확인"·"완료" 같은 모호한 라벨 대신 눌렀을
  때 일어나는 일을 라벨에 담는다. (판정 항목 아님 — 재작성 관점. quality-bar에
  대응 항목이 없다.)
- **어투를 일관되게 유지한다** — 존댓말 수준·숫자 단위 표기를 화면
  전반에서 통일한다(G6-1).
- **언어를 섞지 않는다** — 한 화면 안에서 한국어와 다른 언어를 섞어
  쓰지 않는다(G6-4).
- **사용자를 몰아붙이지 않는다** — 선택을 왜곡하거나 재촉하는 문구를
  쓰지 않는다. 패턴 차원(가짜 버튼·닫기 함정 등)의 판정은 G8이 한다 —
  여기서는 문구 표현 차원만 본다.

## 작업 절차

1. **전수 수집** — 대상 화면의 코드·시안에서 사용자 문구를 훑어 화면별
   표로 정리한다: `화면 | 위치(파일·컴포넌트) | 원문`.
2. **축별 점검** — 위 "문구 원칙"의 각 축을 원문에 대조해 위반을 짚는다.
   위반이 없으면 그 축은 통과로 표시한다.
3. **before/after 제안** — 위반이 있는 문구마다 대안 문구를 만들고,
   무엇이 바뀌었는지 한 줄로 붙인다.
4. **사용자 확인 후 적용** — 제안을 표로 보여주고, 사용자가 승인한
   항목만 실제 코드·문구 파일에 반영한다. 승인 없이 진행하지 않는다.
5. **design G6 재판정으로 hand-off** — 반영이 끝나면 `design` skill로
   넘겨 G6를 다시 채점한다(아래 "design과의 관계").

## before/after 예시

아래는 이 skill이 새로 쓴 예시다(실제 제품 문구를 그대로 옮긴 것이
아니다). 실제 대상 화면에서는 3단계 절차로 표를 만들어 제안한다.

**어투 자체는 이 skill의 축이 아니다** — 어투(습니다체/해요체 등)는 화면 전반의
일관성만 판정하고(G6-1), 아래 예시에 쓰인 어투는 임의다. 몇몇 예시는 프레이밍을
고치는 김에 어투도 함께 해요체로 바뀌어 보이지만, 이 skill이 실제로 판정·제안하는
축은 프레이밍·구조·정보 완결성이지 어투 그 자체가 아니다.

**로딩**
- Before: "시스템이 데이터를 처리하고 있습니다."
- After: "쿠폰을 불러오는 중이에요."
- 무엇이 바뀌었나: 시스템을 주어로 한 수동 문장 → 사용자가 기다리는
  대상을 주어로.

**결과 0건 (빈 상태)**
- Before: "검색 결과가 없습니다."
- After: "조건에 맞는 쿠폰이 아직 없어요. 지역이나 기간을 넓혀서
  다시 찾아보세요."
- 무엇이 바뀌었나: 사실 통보만 하던 문구에 다음 행동을 덧붙임(G6-9의
  단순 반복과 달리, 정보 부재를 알리는 데서 그치지 않고 대안을 제시).

**네트워크 실패** (Before/After 모두 해요체 — 어투는 그대로 두고 프레이밍만 바꾼 예시)
- Before: "오류가 발생했어요."
- After: "네트워크 연결을 확인할 수 없어요. Wi-Fi나 데이터 연결을 확인한
  뒤 다시 시도해주세요."
- 무엇이 바뀌었나: 원인·다음 행동이 없는 뭉뚱그린 에러 문구 → 원인과
  다음 행동을 함께 명시(G6-2). 어투(해요체)는 바뀌지 않았다.

**권한 거부** (Before/After 모두 해요체 — 어투는 그대로 두고 프레이밍만 바꾼 예시)
- Before: "위치 권한이 거부되어 이 기능을 사용할 수 없어요."
- After: "주변 매장을 보려면 위치 권한이 필요해요. 설정에서 위치 접근을
  허용해주세요. 권한 없이도 지역을 직접 검색해 매장을 찾을 수 있어요."
- 무엇이 바뀌었나: 막다른 통보 → 권한이 필요한 이유 + 거부해도 쓸 수
  있는 대안 경로 제시. 어투(해요체)는 바뀌지 않았다.

**제출 CTA**
- Before: "확인"
- After: "쿠폰 신청하기"
- 무엇이 바뀌었나: 눌렀을 때 무슨 일이 일어나는지 모호한 라벨 → 결과를
  구체적으로 말하는 라벨.

**약관 동의**
- Before: "동의하지 않으면 서비스를 이용할 수 없습니다. 지금 동의하지
  않으면 나중에 혜택을 놓칠 수 있습니다."
- After: "위치 정보 제공에 동의하면 주변 매장 추천을 받을 수 있어요.
  동의하지 않아도 매장을 직접 검색해 이용할 수 있어요."
- 무엇이 바뀌었나: 손실 프레이밍("놓칠 수 있다") 제거 → 동의로 얻는
  것을 말하고, 동의하지 않을 때의 대안도 함께 안내(G6-6).

**금액·기간 안내**
- Before: "이 쿠폰은 1000원 할인이며 최소 주문 금액 10000원 이상 구매
  시, 참여 매장에서만, 이번 달 말일까지 사용 가능하고 1인당 1회만 사용할
  수 있습니다."
- After (한 줄 문자열이 아니라 화면에 실제로 여러 줄 목록으로 렌더되는 형태):

  ```
  1,000원 할인 쿠폰이에요.
    · 최소 주문 금액: 10,000원
    · 사용 기간: 이번 달 말일까지
    · 사용 매장: 참여 매장 한정
    · 사용 횟수: 1인당 1회
  ```

- 무엇이 바뀌었나: 한 문장에 몰려 있던 조건 4개를 항목별로 나눔(G6-8).

## design과의 관계

판정은 `design` skill의 quality bar가 한다 — 화면 카피가 G6(카피)·G8
(다크패턴) 기준에 맞는지 통과/조정 필요로 채점한다. 재작성은 이 skill이
한다 — 그 판정을 실제 대안 문구로 바꾼다. 둘은 양방향으로 넘긴다:

`design`은 화면 코드를 직접 만들고 고치는 skill이라 레이아웃·토큰·상태·
아이콘은 전부 그쪽 몫이다. 이 skill이 손대는 것은 화면에 박힌 **문구
문자열**뿐이고, 같은 파일을 열더라도 문자열 밖은 건드리지 않는다. 재작성이
끝나면 `design`으로 돌려보내는 이유는 문구가 바뀌면 줄 수·길이가 달라져
G6뿐 아니라 G7(줄바꿈·겹침·잘림)까지 다시 봐야 하기 때문이다.

- `design`이 G6에서 "조정 필요"를 발견하면 이 skill로 넘어와 구체적인
  before/after를 만든다.
- 이 skill이 카피 반영을 끝내면 `design`으로 다시 넘겨 G6를 재판정한다.

```
/ait:design               # 카피 반영 후 G6 재판정
                          # 말로: "카피 고쳤으니 디자인 품질 다시 점검해줘"
```

## Out of scope (이 skill이 하지 않는 것)

- ❌ 브랜드 문구 정책 판단 — `design` skill의 G0(브랜드·IP 안전) 소관.
- ❌ 법률·검수 문구의 적법성 판단 — 공식 문서가 정본이며, 확신이 없으면
  지어내지 말고 docs MCP(`searchDocumentation`/`getPage`)로 확인한다.
- ❌ 사용자 확인 없는 대량 문자열 치환 — 제안은 항상 표로 보여주고
  승인받은 항목만 적용한다.

## 참고

- 짝 skill: `design` — 화면 코드 생성·수정과 판정(quality bar G6·G8)을
  담당하고, 등록 이미지 자산 산출도 함께 한다.
- 판정 기준 전문은 `design` skill의 `references/quality-bar.md`(G0~G8
  항목표)를 참조한다 — 이 skill이 그 표를 다시 옮겨 적지 않는다.
- 문서 확인이 필요한 카피(검수 기준·법률 표기 등)는 docs MCP로 조회한다.
