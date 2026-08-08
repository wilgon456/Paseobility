<div align="center">

<h1>Paseobility</h1>

<p><strong>GitHub URL을 Codex/Claude에게 던져 설치하는 Paseo 슬래쉬 스킬팩</strong></p>

<p>
  <a href="https://paseo.sh"><img alt="Paseobility Skill Pack" src="https://img.shields.io/badge/Paseobility-Skill%20Pack-111827?style=for-the-badge"></a>
  <img alt="Browser Automation" src="https://img.shields.io/badge/Browser-Automation-2563eb?style=for-the-badge">
  <img alt="Multi Agent Orchestration" src="https://img.shields.io/badge/Multi--Agent-Orchestration-7c3aed?style=for-the-badge">
  <img alt="Project Bootstrap" src="https://img.shields.io/badge/Project-Bootstrap-059669?style=for-the-badge">
  <img alt="Agent Tournament" src="https://img.shields.io/badge/Agent-Tournament-db2777?style=for-the-badge">
</p>

<p>
  <code>/paseo-computer-use</code>로 웹 UI를 직접 조작하고,<br>
  <code>/paseo-agent-tournament</code>로 여러 모델의 답을 비교하고,<br>
  <code>/paseo-project-bootstrap</code>으로 새 프로젝트 맥락을 빠르게 세팅합니다.
</p>

</div>

---

## 한 줄 요약

Paseobility는 사용자가 이 GitHub repo URL을 Codex, Claude, Paseo agent에게 던져 설치하게 만든 **agent-installable Paseo 슬래쉬 스킬팩**입니다.

설치되면 Paseo에서 자주 쓰는 브라우저 computer use, 멀티에이전트 오케스트레이션, 에이전트 토너먼트, 세션 브리프, 프로젝트 bootstrap 흐름을 슬래쉬 명령처럼 꺼내 쓸 수 있습니다.

기본 Paseo만으로도 내장 도구를 조합하면 비슷한 일을 할 수 있습니다. 다만 매번 에이전트가 그 조합을 새로 판단하게 두면 느리고 결과가 들쭉날쭉할 수 있어서, 자주 쓰는 패턴을 바로 꺼내 쓰기 쉽게 묶었습니다.

이 repo는 실행형 프레임워크가 아니라 **Paseo 내장 도구를 반복 가능하게 조합하기 위한 스킬 문서 패키지**입니다. macOS/Linux용 bootstrap helper와 Windows PowerShell 설치 helper를 함께 제공합니다.

---

## 사용 방식

이 프로젝트의 기본 사용자는 shell에서 직접 설치하는 사람이 아니라, **AI 에이전트에게 GitHub URL을 주고 설치와 검증을 맡기는 사람**입니다.

```text
https://github.com/wilgon456/Paseobility

이 repo를 읽고 AGENTS.md 지침대로 내 로컬 Paseo skills 디렉터리에 설치해줘.
먼저 임시 HOME/TargetHome으로 설치 테스트하고, 통과하면 실제 skills 디렉터리에 설치해줘.
설치 후 새 Paseo 세션에서 /paseo-session-brief가 인식되는지도 확인해줘.
```

에이전트는 [AGENTS.md](./AGENTS.md)를 읽고 OS별 경로와 설치 절차를 따라갑니다. 설치가 끝난 뒤 새 Paseo 세션이나 통합 reload 후 아래 슬래쉬 스킬을 사용할 수 있습니다.

즉, "코드 짜줘"에서 끝나는 게 아니라:

- 웹페이지를 열고, 읽고, 클릭하고, 입력하고, 스크린샷으로 검증합니다.
- 작업을 여러 에이전트에게 나눠 맡기고 결과를 합성합니다.
- GPT/Claude/DeepSeek/Grok 같은 여러 모델의 답을 비교해 winner 또는 merged plan을 고릅니다.
- 세션 시작 시 repo 맥락, 명령어, 지침, 리스크를 한 장으로 요약합니다.
- 새 프로젝트에 들어갈 때 README, docs, Claude/Codex/Cursor 계열 지침을 모아 작업 맥락을 만듭니다.
- Codex로 구현하고 Claude로 리뷰하는 식의 크로스 프로바이더 협업을 설계합니다.
- 무한 루프, 위험한 제출, 계정 변경 같은 작업에는 명확한 가드레일을 둡니다.

---

## 들어있는 스킬

| Skill | 역할 | 이런 요청에 강함 |
| --- | --- | --- |
| `/paseo-computer-use` | 브라우저 조작 워크플로우 | 로그인 폼 채우기, 검색 결과 읽기, UI 클릭, 반응형 스크린샷, 웹앱 상태 확인 |
| `/paseo-orchestration` | 멀티에이전트 지휘 패턴 | 병렬 구현, 코드리뷰 게이트, 작업 DAG, 장기 실행 코디네이터, 실패 에스컬레이션 |
| `/paseo-agent-tournament` | 멀티 모델 비교/심사 | GPT vs Claude vs DeepSeek, 찬반 토론, 설계안 비교, judge 기반 winner 선정 |
| `/paseo-session-brief` | 세션 시작/인수인계 브리프 | repo 요약, 현재 git 상태, 명령어, 지침, 리스크, 다음 행동 정리 |
| `/paseo-project-bootstrap` | 프로젝트 초기 맥락/환경 세팅 | macOS/Paseo 점검, docs/지침 수집, 실행 명령 추론, `.paseobility/` context 생성 |

---

## 설치

권장 설치 방식은 AI 에이전트에게 이 저장소 URL을 주고 설치를 맡기는 것입니다.

```text
https://github.com/wilgon456/Paseobility
이 repo를 읽고 내 로컬 Paseo skills 디렉터리에 설치해줘.
Windows/Mac 환경에 맞춰 skills/*를 복사하고, 설치 후 필요한 reload 방법을 알려줘.
```

에이전트는 [AGENTS.md](./AGENTS.md)를 기준으로 Mac/Windows의 skills 경로를 확인해 설치하면 됩니다.

직접 설치도 가능합니다.

```bash
git clone https://github.com/wilgon456/Paseobility.git
cd Paseobility

# Paseo / Codex 계열 스킬만 설치
./scripts/paseobility-init.sh --no-context

# Claude Code에서도 같이 쓰고 싶다면
./scripts/paseobility-init.sh --with-claude --no-context

# 특정 프로젝트까지 바로 bootstrap하려면
./scripts/paseobility-init.sh --root /path/to/your/project
```

Windows PowerShell에서는:

```powershell
git clone https://github.com/wilgon456/Paseobility.git
cd Paseobility

# Paseo / Codex 계열 스킬 설치
.\scripts\paseobility-install.ps1

# 임시 홈에 먼저 테스트 설치하고 싶다면
.\scripts\paseobility-install.ps1 -TargetHome $tmp.FullName

# Claude Code에서도 같이 쓰고 싶다면
.\scripts\paseobility-install.ps1 -WithClaude
```

설치 후 Paseo 앱에서 새 에이전트를 시작하거나, Settings에서 통합/스킬을 다시 로드하세요.

수동 설치를 선호한다면:

```bash
mkdir -p ~/.agents/skills
cp -R skills/* ~/.agents/skills/
```

Windows 수동 설치:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.agents\skills" | Out-Null
Copy-Item -Recurse -Force ".\skills\*" "$env:USERPROFILE\.agents\skills\"
```

---

## 요구사항

- [Paseo](https://paseo.sh) 데스크탑 앱
- Paseo Settings -> Agents -> **Enable Paseo tools** 활성화
- 1개 이상의 AI 프로바이더
  - 예: Codex, Claude Code 등
- 오케스트레이션을 제대로 쓰려면 `~/.paseo/orchestration-preferences.json` 설정 권장
- 설치 대상 skills 경로
  - macOS/Linux: `~/.agents/skills`
  - Windows: `%USERPROFILE%\.agents\skills`
- bootstrap context 생성 스크립트는 macOS/Linux shell 환경 기준
  - Windows에서는 `scripts/paseobility-install.ps1`로 스킬 설치만 보조합니다.

---

## 검증 상태

| 환경 | 상태 | 확인한 내용 |
| --- | --- | --- |
| Apple Silicon macOS | Tested | Paseo CLI 0.2.5에서 `Darwin/arm64` 감지, 임시 HOME 설치, 실제 `~/.agents/skills` 설치, context 생성, package scripts 감지, 새 Paseo agent의 `/paseo-session-brief` 인식 확인 |
| Intel macOS | Tested | Paseo CLI 0.2.5에서 `Darwin/x86_64` 감지, 임시 HOME 설치, 실제 `~/.agents/skills` 설치, context 생성, package scripts 감지, 새 Paseo agent의 `/paseo-session-brief` 인식 확인 |
| Windows | Tested | Windows 11 x64, Windows PowerShell 5.1, Paseo CLI 0.2.5에서 PowerShell installer, `-TargetHome` 임시 설치, 실제 `%USERPROFILE%\.agents\skills` 설치, 새 Paseo agent의 `/paseo-session-brief` 인식 확인. Native bash context script는 미검증 |

Intel Mac 테스트에서는 설치 실패, agent 인식 실패, Intel 전용 오류가 관찰되지 않았습니다.
Windows 테스트에서는 PowerShell installer, `-TargetHome` 임시 홈 설치, 실제 스킬 인식이 통과했습니다. 임시 홈 설치는 `$HOME` 대신 `-TargetHome` 또는 `$env:USERPROFILE` 기준으로 격리하는 방식을 사용합니다.

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

### 여러 모델 답을 비교하기

```text
/paseo-agent-tournament
이 README 방향을 두고 GPT는 옹호, OpenCode DeepSeek은 반대,
Grok은 둘을 비교해서 최종 판단을 정리해줘.
```

가능한 작업 흐름:

```text
참가자 역할 정의 -> 여러 agent 병렬 실행
-> 결과 수집 -> judge agent 생성
-> winner / merged plan / risks 정리
```

### 세션 브리프 만들기

```text
/paseo-session-brief
이 프로젝트 처음 보는 상태라고 생각하고 현재 작업 가능한 브리프 만들어줘.
```

출력 범위:

```text
Project -> Current State -> Instructions -> Commands
-> Project Map -> Risks -> Suggested First Moves
```

### 새 프로젝트 맥락 세팅하기

```text
/paseo-project-bootstrap
이 repo 처음 보는 상태라고 생각하고 docs, CLAUDE.md, AGENTS.md,
package scripts를 읽어서 작업 맥락을 만들어줘.
```

같은 일을 shell script로 먼저 준비할 수도 있습니다.

```bash
./scripts/paseobility-doctor.sh
./scripts/paseobility-context.sh
```

생성되는 파일:

```text
.paseobility/
├── context.md        # README/docs/지침 파일 요약
├── commands.md       # install/dev/build/test 명령 후보
├── project-map.md    # 주요 파일/디렉터리 지도
└── bootstrap-log.md  # OS, arch, Paseo 상태, 경고
```

---

## `/paseo-agent-tournament`

같은 문제를 여러 에이전트에게 독립적으로 맡긴 뒤, 별도 judge가 비교해서 최종 답을 고르는 스킬입니다.

| 모드 | 용도 |
| --- | --- |
| Debate | 한 모델은 찬성, 다른 모델은 반대, judge가 종합 |
| Competing Plans | 여러 설계/수정 계획을 비교 |
| Competing Implementations | 격리 workspace에서 구현 후보를 비교 |

핵심 규칙:

- provider/model 문자열은 실제 `paseo_list_providers`, `paseo_list_models`로 확인합니다.
- 분석만 하면 같은 workspace를 써도 됩니다.
- 파일을 수정하는 tournament는 참가자별 별도 workspace를 씁니다.
- judge는 참가자와 다른 provider를 우선합니다.
- 결과는 winner, runner-up, best merged plan, risks로 정리합니다.

---

## `/paseo-session-brief`

새 세션을 시작하거나 다른 에이전트에게 넘기기 전에, repo 맥락을 짧고 실행 가능한 형태로 정리합니다.

확인하는 것:

- project root, remote, branch, git status
- `README*`, `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/**`, `.github/copilot-instructions.md`
- `docs/`의 setup/architecture/contributing 문서
- `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Makefile`, `paseo.json`

출력:

- Project
- Current State
- Instructions
- Commands
- Project Map
- Risks
- Suggested First Moves
- Handoff Prompt, 요청 시

---

## `/paseo-project-bootstrap`

프로젝트를 처음 열었을 때 에이전트가 바로 구현으로 뛰어들지 않고, 먼저 작업 환경과 맥락을 정리하게 만드는 스킬입니다.

| 할 일 | 확인하는 것 |
| --- | --- |
| 프로젝트 루트 확인 | `pwd`, `git rev-parse --show-toplevel`, `git remote -v`, `git status` |
| 환경 진단 | macOS arch, Paseo CLI, skill directory, `paseo.json` |
| 문서 수집 | `README*`, `docs/**/*.md`, `AGENTS.md`, `CLAUDE.md` |
| 지침 수집 | `.cursor/rules/**`, `.github/copilot-instructions.md` |
| 명령 추론 | `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Makefile` |
| context 생성 | `.paseobility/context.md`, `commands.md`, `project-map.md`, `bootstrap-log.md` |

포함된 스크립트:

| Script | 역할 |
| --- | --- |
| `scripts/paseobility-doctor.sh` | OS/arch/Paseo CLI/skill path/project signal 진단 |
| `scripts/paseobility-context.sh` | 프로젝트 문서와 명령 힌트를 `.paseobility/`에 생성 |
| `scripts/paseobility-init.sh` | 스킬 설치 후 doctor/context를 한 번에 실행 |
| `scripts/paseobility-install.ps1` | Windows PowerShell에서 `skills/*`를 Paseo/Claude skills 경로로 복사 |

Workspace hygiene:

- 현재 프로젝트 루트 안에서 작업하는 것을 우선합니다.
- 외부 clone, sibling project, 새 workspace는 사용자가 요청했거나 명확히 필요할 때만 씁니다.
- 외부 경로에서 작업했다면 최종 보고에 경로와 이유를 남깁니다.

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
├── paseo-agent-tournament/
│   └── SKILL.md
├── paseo-computer-use/
│   └── SKILL.md
├── paseo-project-bootstrap/
│   └── SKILL.md
├── paseo-session-brief/
│   └── SKILL.md
└── paseo-orchestration/
    └── SKILL.md
scripts/
├── paseobility-context.sh
├── paseobility-doctor.sh
├── paseobility-init.sh
└── paseobility-install.ps1
AGENTS.md
```

---

## 같이 보면 좋은 프로젝트

- [ai-skill-library](https://github.com/wilgon456/ai-skill-library) - 크로스 에이전트 스킬 검색/설치 라이브러리

---

<div align="center">

<strong>브라우저는 손처럼 쓰고, 에이전트는 팀처럼 굴리세요.</strong>

</div>
