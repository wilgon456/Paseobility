<div align="center">

<h1>Paseobility</h1>

<p><strong>Paseo에서도 Orca처럼. 브라우저 손과 멀티에이전트 지휘 능력을 더하는 스킬팩</strong></p>

<p>
  <a href="https://paseo.sh"><img alt="Paseobility Skill Pack" src="https://img.shields.io/badge/Paseobility-Skill%20Pack-111827?style=for-the-badge"></a>
  <img alt="Browser Automation" src="https://img.shields.io/badge/Browser-Automation-2563eb?style=for-the-badge">
  <img alt="Multi Agent Orchestration" src="https://img.shields.io/badge/Multi--Agent-Orchestration-7c3aed?style=for-the-badge">
</p>

<p>
  <code>/paseo-computer-use</code>로 웹 UI를 직접 조작하고,<br>
  <code>/paseo-orchestration</code>으로 여러 에이전트를 병렬로 굴리고 검증합니다.
</p>

</div>

---

## 한 줄 요약

Paseobility는 Paseo에서 자주 쓰는 브라우저 computer use와 멀티에이전트 오케스트레이션 흐름을 슬래쉬 스킬로 정리한 스킬팩입니다.

기본 Paseo만으로도 내장 도구를 조합하면 비슷한 일을 할 수 있습니다. 다만 매번 에이전트가 그 조합을 새로 판단하게 두면 느리고 결과가 들쭉날쭉할 수 있어서, 자주 쓰는 패턴을 바로 꺼내 쓰기 쉽게 묶었습니다.

즉, "코드 짜줘"에서 끝나는 게 아니라:

- 웹페이지를 열고, 읽고, 클릭하고, 입력하고, 스크린샷으로 검증합니다.
- 작업을 여러 에이전트에게 나눠 맡기고 결과를 합성합니다.
- Codex로 구현하고 Claude로 리뷰하는 식의 크로스 프로바이더 협업을 설계합니다.
- 무한 루프, 위험한 제출, 계정 변경 같은 작업에는 명확한 가드레일을 둡니다.

---

## 들어있는 스킬

| Skill | 역할 | 이런 요청에 강함 |
| --- | --- | --- |
| `/paseo-computer-use` | 브라우저 조작 워크플로우 | 로그인 폼 채우기, 검색 결과 읽기, UI 클릭, 반응형 스크린샷, 웹앱 상태 확인 |
| `/paseo-orchestration` | 멀티에이전트 지휘 패턴 | 병렬 구현, 코드리뷰 게이트, 작업 DAG, 장기 실행 코디네이터, 실패 에스컬레이션 |

---

## 설치

```bash
git clone https://github.com/wilgon456/Paseobility.git
cd Paseobility

# Paseo / Codex 계열 스킬 경로
mkdir -p ~/.agents/skills
cp -R skills/* ~/.agents/skills/

# Claude Code에서도 같이 쓰고 싶다면
mkdir -p ~/.claude/skills
cp -R skills/* ~/.claude/skills/
```

설치 후 Paseo 앱에서 새 에이전트를 시작하거나, Settings에서 통합/스킬을 다시 로드하세요.

---

## 요구사항

- [Paseo](https://paseo.sh) 데스크탑 앱
- Paseo Settings -> Agents -> **Enable Paseo tools** 활성화
- 1개 이상의 AI 프로바이더
  - 예: Codex, Claude Code 등
- 오케스트레이션을 제대로 쓰려면 `~/.paseo/orchestration-preferences.json` 설정 권장

---

## 빠른 사용 예시

### 웹 UI를 직접 다루기

```text
/paseo-computer-use
https://example.com 로그인 페이지 열고, 폼 구조 확인한 다음,
테스트 계정으로 로그인되는지 스크린샷까지 찍어서 검증해줘.
```

가능한 작업 흐름:

```text
새 탭 열기 -> 페이지 스냅샷 -> 입력 필드 찾기 -> 값 입력
-> 버튼 클릭 -> 대기 -> 다시 스냅샷/스크린샷으로 검증
```

### 여러 에이전트를 지휘하기

```text
/paseo-orchestration
이 기능을 구현, 테스트, 리뷰로 나눠서 병렬로 진행하고
마지막에는 리뷰 에이전트가 통과 여부를 판단하게 해줘.
```

가능한 작업 흐름:

```text
작업 분해 -> 워커 에이전트 생성 -> 병렬 실행
-> 결과 수집 -> 리뷰 게이트 -> 통과/차단 판단
```

---

## `/paseo-computer-use`

브라우저를 "보는" 수준이 아니라 실제로 조작하는 워크플로우를 제공합니다.

| 할 일 | 사용하는 흐름 |
| --- | --- |
| 페이지 읽기 | `new_tab` -> `snapshot` |
| 버튼 클릭 | `snapshot` -> ref 찾기 -> `click` |
| 폼 입력 | `snapshot` -> ref 찾기 -> `fill` / `type` |
| 드롭다운 선택 | `snapshot` -> ref 찾기 -> `select` |
| 화면 검증 | `screenshot` / `snapshot` |
| 반응형 확인 | `resize` -> `screenshot` |
| 디버깅 | `logs` / `evaluate` |

핵심 규칙:

- 액션 전에 항상 최신 snapshot을 뜹니다. 페이지가 바뀌면 ref도 바뀝니다.
- 텍스트 이해에는 snapshot, 시각 검증에는 screenshot을 씁니다.
- 결제, 제출, 계정 변경처럼 되돌리기 어려운 액션은 사용자 확인을 먼저 받습니다.
- `evaluate`로 쿠키, 토큰, localStorage 같은 민감 정보를 읽지 않습니다.

---

## `/paseo-orchestration`

한 에이전트가 여러 에이전트를 만들고, 역할을 나누고, 결과를 합성하는 패턴 모음입니다.

| 패턴 | 용도 |
| --- | --- |
| Fan-out | 독립 작업을 여러 에이전트에게 동시에 맡기기 |
| Task DAG | Step 1 -> Step 2 -> Step 3 순차 실행 |
| Hybrid DAG | 병렬 작업 후 합성, 이후 리뷰 같은 혼합 흐름 |
| Decision Gate | 다음 단계 진행 전 리뷰 에이전트가 통과/차단 판단 |
| Coordinator Loop | 긴 작업을 heartbeat로 주기적으로 점검 |
| Blocking Ask/Reply | 다른 에이전트의 답을 받은 뒤 진행 |
| Escalation | 권한, 모호함, 하드 실패를 사용자에게 명확히 보고 |

추천 구도:

```text
Codex       -> 구현 / 리팩터링 / 테스트 작성
Claude      -> 리뷰 / UX 문구 / 리스크 점검
Coordinator -> 작업 분해 / 진행 관리 / 최종 합성
```

안전 규칙:

- 같은 파일을 여러 워커가 수정할 가능성이 있으면 별도 workspace를 만듭니다.
- heartbeat와 schedule에는 `maxRuns` 또는 `expiresIn`을 둡니다.
- 네트워크 timeout 같은 일시적 실패는 최대 1회 재시도합니다.
- 권한 부족, 요구사항 모호함, 파괴적 작업은 추측하지 않고 사용자에게 에스컬레이션합니다.

---

## 추천 설정

`~/.paseo/orchestration-preferences.json` 예시:

```json
{
  "providers": {
    "impl": "codex/gpt-5.4",
    "ui": "claude/opus",
    "research": "codex/gpt-5.4",
    "planning": "codex/gpt-5.4",
    "audit": "claude/opus"
  },
  "preferences": [
    "작업 지시는 self-contained briefing으로 작성한다.",
    "리뷰 에이전트는 구현 에이전트와 다른 provider를 우선한다.",
    "하드 실패는 조용히 우회하지 말고 사용자에게 보고한다."
  ]
}
```

프로바이더 문자열은 로컬 Paseo 환경에 맞게 바꿔 사용하세요.

---

## 저장소 구조

```text
skills/
├── paseo-computer-use/
│   └── SKILL.md
└── paseo-orchestration/
    └── SKILL.md
```

---

## 같이 보면 좋은 프로젝트

- [ai-skill-library](https://github.com/wilgon456/ai-skill-library) - 크로스 에이전트 스킬 검색/설치 라이브러리

---

<div align="center">

<strong>브라우저는 손처럼 쓰고, 에이전트는 팀처럼 굴리세요.</strong>

</div>
