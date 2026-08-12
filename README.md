<div align="center">

<h1>Paseobility</h1>

<p><strong>GitHub URL을 Codex/Claude에게 던져 설치하는 Paseo 슬래쉬 스킬팩</strong></p>

<p>
  <img alt="Version" src="https://img.shields.io/badge/version-v2.4.0-111827?style=for-the-badge">
  <a href="https://paseo.sh"><img alt="Paseobility Skill Pack" src="https://img.shields.io/badge/Paseobility-Skill%20Pack-111827?style=for-the-badge"></a>
  <img alt="Browser Automation" src="https://img.shields.io/badge/Browser-Automation-2563eb?style=for-the-badge">
  <img alt="Multi Agent Orchestration" src="https://img.shields.io/badge/Multi--Agent-Orchestration-7c3aed?style=for-the-badge">
  <img alt="Project Bootstrap" src="https://img.shields.io/badge/Project-Bootstrap-059669?style=for-the-badge">
  <img alt="Agent Tournament" src="https://img.shields.io/badge/Agent-Tournament-db2777?style=for-the-badge">
  <img alt="Spyware Check" src="https://img.shields.io/badge/Spyware-Check-dc2626?style=for-the-badge">
  <img alt="Agent Cleanup" src="https://img.shields.io/badge/Agent-Cleanup-475569?style=for-the-badge">
  <img alt="Paseo Share" src="https://img.shields.io/badge/Paseo-Share-0284c7?style=for-the-badge">
  <img alt="Paseo Skill Save" src="https://img.shields.io/badge/Paseo-Skill%20Save-7c3aed?style=for-the-badge">
</p>

<p>
  <code>/paseo-computer-use</code>로 웹 UI를 직접 조작하고,<br>
  <code>/paseo-agent-tournament</code>로 여러 모델의 답을 비교하고,<br>
  <code>/paseo-project-bootstrap</code>으로 새 프로젝트 맥락을 세팅하고,<br>
  <code>/paseo-share</code>로 컴퓨터와 모바일 사이에 산출물을 공유하고,<br>
  <code>/paseo-skill-save</code>로 GitHub 스킬을 저장해 자연어로 다시 사용합니다.
</p>

</div>

---

## 한 줄 요약

Paseobility는 사용자가 이 GitHub repo URL을 Codex, Claude, Paseo agent에게 던져 설치하게 만든 **agent-installable Paseo 슬래쉬 스킬팩**입니다.

설치되면 Paseo에서 자주 쓰는 브라우저 computer use, 멀티에이전트 오케스트레이션, 에이전트 토너먼트, 세션 브리프, 프로젝트 bootstrap, 설치 전 repo 보안 점검, 비활성 서브에이전트 정리, 기기 간 산출물 공유와 개인 스킬 라이브러리 동기화를 슬래쉬 명령처럼 꺼내 쓸 수 있습니다.

기본 Paseo만으로도 내장 도구를 조합하면 비슷한 일을 할 수 있습니다. 다만 매번 에이전트가 그 조합을 새로 판단하게 두면 느리고 결과가 들쭉날쭉할 수 있어서, 자주 쓰는 패턴을 바로 꺼내 쓰기 쉽게 묶었습니다.

이 repo는 실행형 프레임워크가 아니라 **Paseo 내장 도구를 반복 가능하게 조합하기 위한 스킬 문서 패키지**입니다. macOS/Linux용 bootstrap helper와 Windows PowerShell 설치 helper를 함께 제공합니다.

---

## v2.4.0 업데이트

v2.4.0에서는 `/paseo-share`가 인증 계정의 private `paseo_share` 저장소를 안전하게 자동 준비하고, `/paseo-skill-save`가 fail-closed spyware 검사를 거친 개인 스킬을 private `paseo_skill_save` 저장소로 여러 컴퓨터에 동기화합니다. `/paseo-agent-cleanup`은 이름이나 용도와 무관하게 모든 비활성 agent를 다시 묻지 않고 archive하며, 실행 중인 agent와 workspace는 계속 보호합니다.

| 추가/보강 기능 | 역할 |
| --- | --- |
| `/paseo-skill-save` | 검증한 개인 스킬을 private `paseo_skill_save`에 동기화하고, 각 컴퓨터에서 필요한 스킬만 자연어로 선택해 일시 적용 |
| `/paseo-share` | private `paseo_share`에 파일을 게시하고 공유 ID와 미리보기·다운로드 링크 반환. 다른 컴퓨터에서는 검증 후 자동 가져오기 |
| `/paseo-spyware-check` | GitHub URL이나 로컬 repo를 설치하기 전에 악성 install script, secret 접근, 원격 코드 실행, exfiltration, supply-chain 위험 신호를 읽기 전용으로 점검 |
| `/paseo-agent-cleanup` | 서브에이전트를 포함한 모든 비활성 agent를 재확인 없이 archive하고, workspace는 승인 후 archive-only 방식으로 정리 |
| Installer backup | 기존 같은 이름의 skill 디렉터리를 덮어쓰기 전에 `skills-backups/` 아래로 자동 백업 |
| Report summary | spyware helper report에 `High / Medium / Info` count와 verdict hint 추가 |

`/paseo-spyware-check`는 로컬에 설치된 외부 오픈소스 scanner CLI를 호출하는 방식입니다. Paseobility는 해당 scanner의 바이너리나 룰셋을 저장소에 포함하거나 재배포하지 않습니다.

`/paseo-agent-cleanup`은 서브에이전트를 포함해 이름이나 용도와 무관한 모든 비활성 agent를 다시 묻지 않고 archive합니다. running 등 활성 agent는 건드리지 않고, workspace cleanup은 승인 후 archive-only 방식으로만 처리합니다.

`/paseo-share`는 첫 실제 공유 요청에서 GitHub CLI 인증을 확인하고 `<로그인 계정>/paseo_share`를 private 저장소로 준비합니다. 다른 컴퓨터에서 같은 GitHub 계정으로 온보딩하면 기존 저장소를 안전 검사 후 재사용합니다. Forgejo나 다른 저장소는 명시적인 `setup <repo-url>`로 연결할 수 있습니다. 업로드한 파일은 모바일에서 링크로 바로 미리볼 수 있고, 다른 컴퓨터의 Paseo는 공유 ID를 이용해 자동으로 가져옵니다.

`/paseo-skill-save` wrapper는 대상 스킬을 실행하지 않고 bundled Python `/paseo-spyware-check` gate를 먼저 강제합니다. High/Critical은 저장을 차단하고 Medium은 결과를 보여준 뒤 명시적으로 승인한 경우에만 진행합니다. 통과한 소스는 검사한 commit과 checksum으로 고정해 로컬 overlay에 저장하고, 기본적으로 인증 계정의 private `paseo_skill_save` 저장소에 portable library를 동기화합니다. 다른 컴퓨터는 전체 library를 검증해 로컬 overlay를 재구성하며, workload 스킬을 영구 설치하지 않고 router가 필요한 스킬만 `on-demand`로 적용합니다. 내부 엔진은 고정 commit과 전체 Git tree를 검증한 뒤 `~/.paseo/skill-save/manager/`에 자동 캐시합니다.

---

## 사용 방식

이 프로젝트의 기본 사용자는 shell에서 직접 설치하는 사람이 아니라, **AI 에이전트에게 GitHub URL을 주고 설치와 검증을 맡기는 사람**입니다.

`paseo-share`만 설치하려면 Codex 또는 Claude에 아래 문장 그대로 보내면 됩니다.

```text
https://github.com/wilgon456/Paseobility

이 저장소의 지침을 읽고 paseo-share만 이 컴퓨터에 설치하고 검증해줘.
기존 설치본은 백업하고 Paseo daemon은 재시작하지 마.
설치가 끝나면 새 세션/reload 방법과 최초 공유 요청 방법을 알려줘.
```

```text
https://github.com/wilgon456/Paseobility

이 repo를 읽고 AGENTS.md 지침대로 내 로컬 Paseo skills 디렉터리에 설치해줘.
먼저 임시 HOME/TargetHome으로 설치 테스트하고, 통과하면 실제 skills 디렉터리에 설치해줘.
설치 후 새 Paseo 세션에서 /paseo-session-brief가 인식되는지도 확인해줘.
```

에이전트는 Codex/Paseo에서는 [AGENTS.md](./AGENTS.md), Claude Code에서는 [CLAUDE.md](./CLAUDE.md)를 읽고 OS별 경로와 설치 절차를 따라갑니다. 이 Paseobility 저장소는 설치 원본입니다. 실제 공유 artifact와 개인 skill library는 각각 인증 계정의 private `paseo_share`, `paseo_skill_save` 저장소에 보관하며, 설치만으로 저장소를 만들지는 않습니다.

즉, "코드 짜줘"에서 끝나는 게 아니라:

- 웹페이지를 열고, 읽고, 클릭하고, 입력하고, 스크린샷으로 검증합니다.
- 작업을 여러 에이전트에게 나눠 맡기고 결과를 합성합니다.
- GPT/Claude/DeepSeek/Grok 같은 여러 모델의 답을 비교해 winner 또는 merged plan을 고릅니다.
- GitHub URL이나 로컬 repo를 설치하기 전에 spyware/supply-chain 위험 신호를 읽기 전용으로 점검합니다.
- 테스트 후 쌓인 비활성 서브에이전트를 다시 묻지 않고 archive하고, workspace는 승인 후 archive합니다.
- 작업 산출물을 private Git 공유함에 올리고 다른 컴퓨터나 모바일에서 바로 열거나 가져옵니다.
- GitHub 스킬 링크를 private 개인 라이브러리에 동기화하고, 다른 컴퓨터에서도 평범한 자연어 요청으로 필요한 스킬만 찾아 씁니다.
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
| `/paseo-share` | 컴퓨터·모바일 산출물 공유 | private `paseo_share` 자동 준비, 클릭 가능한 미리보기/다운로드 링크, 공유 ID 기반 검증·가져오기 |
| `/paseo-skill-save` | 개인 스킬 저장·동기화 | fail-closed 정적 검사, private `paseo_skill_save` 동기화, 자연어 검색, 필요한 스킬만 일시 적용 |
| `/paseo-spyware-check` | 설치 전 보안/스파이웨어 정적 점검 | GitHub URL, 로컬 repo, install script, secret, exfiltration, supply-chain 위험 확인 |
| `/paseo-agent-cleanup` | 비활성 agent/workspace 정리 | 비활성 서브에이전트 재확인 없는 archive, 활성 agent 보호, workspace는 승인 후 archive |

---

## 설치

권장 설치 방식은 AI 에이전트에게 이 저장소 URL을 주고 설치를 맡기는 것입니다.

```text
https://github.com/wilgon456/Paseobility
이 repo를 읽고 내 로컬 Paseo skills 디렉터리에 설치해줘.
Windows/Mac 환경에 맞춰 skills/*를 복사하고, 설치 후 필요한 reload 방법을 알려줘.
```

에이전트는 Codex/Paseo에서는 [AGENTS.md](./AGENTS.md), Claude Code에서는 [CLAUDE.md](./CLAUDE.md)를 기준으로 Mac/Windows의 skills 경로를 확인해 설치합니다. `paseo-share` 요청은 전체 스킬팩 대신 해당 스킬만 설치합니다.

직접 설치도 가능합니다.

```bash
git clone https://github.com/wilgon456/Paseobility.git
cd Paseobility

# Paseo / Codex 계열 스킬만 설치
./scripts/paseobility-init.sh --no-context

# 특정 스킬만 업데이트하고 싶다면
./scripts/paseobility-init.sh --skill paseo-agent-cleanup --no-context
./scripts/paseobility-init.sh --skill paseo-spyware-check --no-context
./scripts/paseobility-init.sh --skill paseo-share --no-context
./scripts/paseobility-init.sh --skill paseo-skill-save --skill paseo-spyware-check --no-context

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

# 특정 스킬만 업데이트하고 싶다면
.\scripts\paseobility-install.ps1 -Skill paseo-agent-cleanup
.\scripts\paseobility-install.ps1 -Skill paseo-spyware-check
.\scripts\paseobility-install.ps1 -Skill paseo-share
.\scripts\paseobility-install.ps1 -Skill paseo-skill-save,paseo-spyware-check

# 임시 홈에 먼저 테스트 설치하고 싶다면
.\scripts\paseobility-install.ps1 -TargetHome $tmp.FullName

# Claude Code에서도 같이 쓰고 싶다면
.\scripts\paseobility-install.ps1 -WithClaude
```

installer는 기존 같은 이름의 skill이 있으면 덮어쓰기 전에 백업합니다.

| OS | Backup path |
| --- | --- |
| macOS/Linux | `~/.agents/skills-backups/Paseobility-<version>-<timestamp>/` |
| Windows | `%USERPROFILE%\.agents\skills-backups\Paseobility-<version>-<timestamp>\` |

백업 없이 강제로 교체해야 하는 경우 macOS/Linux는 `--no-backup`, Windows는 `-NoBackup`을 사용할 수 있습니다.

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
- `/paseo-share`는 Node.js와 Git 필요. 기본 GitHub 자동 온보딩에는 인증된 GitHub CLI(`gh`)가 필요하며, Forgejo·custom remote는 명시적인 저장소 URL로 연결. GitHub Actions는 사용하지 않음
- `/paseo-skill-save`는 Python 3.11 이상과 Git 필요. 기본 private library 동기화에는 인증된 GitHub CLI(`gh`)가 필요하며, `--local-only`로 이 컴퓨터에만 저장 가능. 첫 실행 시 고정된 공개 [skillNload](https://github.com/wilgon456/skillNload) 엔진을 자동 검증·캐시하며 별도 설치 명령은 필요 없음
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
| `/paseo-spyware-check` on Apple Silicon macOS | Tested | Paseo 0.3.0에서 temp HOME 설치, helper script 실행, fixture 위험 패턴 탐지, 새 Paseo agent 인식, scanner dry-run 확인 |
| `/paseo-spyware-check` on Intel macOS | Tested | Darwin x86_64 / Paseo 0.3.0에서 설치, helper script 실행, fixture 위험 패턴 탐지, 새 Paseo agent 인식, Gitleaks secret scan no finding 확인 |
| `/paseo-spyware-check` on Windows | Tested | Windows 11 x64 / PowerShell 5.1 / Paseo 0.3.0에서 native PowerShell static-search workflow regex 컴파일, fixture 위험 패턴 탐지, 새 Paseo agent 인식 확인. Bash helper는 Windows native에서 미검증 |
| `/paseo-agent-cleanup` on Apple Silicon macOS | Tested | Paseo 0.3.1에서 모든 비활성 agent 선택, running agent skip, idle agent 무확인 auto-archive, workspace 자동 제외, 실제 skill 설치 확인 |
| `/paseo-agent-cleanup` on Windows | Tested | Windows 10.0.26200 x64 / Node v24.14.0 / Paseo 0.3.0에서 `%USERPROFILE%\.agents\skills` 직접 실행, dry-run JSON, running agent skip, 완료 test agent auto-archive, workspace auto-archive 방지 확인 |
| `/paseo-share` on Apple Silicon macOS | Tested | 공식 skill validator, Node 보안·온보딩 테스트 13개, private 저장소 생성/재사용과 public·비관련 저장소 거부 검증, 실제 private GitHub 게시·조회·자동 fetch·원본 SHA-256 비교, Codex/Claude 격리 설치 확인 |
| `/paseo-share` on Windows | Tested | Windows private checkout, PowerShell 설치, private GitHub 연결, 실제 TXT 게시와 원격 파일 조회, 모바일 GitHub 미리보기 확인 |
| `/paseo-skill-save` wrapper | Tested locally | 공식 skill validator, wrapper 단위 테스트 12개와 spyware gate 테스트 6개, fail-closed receipt, High 차단, Medium 승인 gate, 검사 commit·checksum 결합, secret evidence redaction, 고정 skillNload 0.7 manager와 private sync 상태 전달, 실제 GitHub 스킬 저장·검증·검색·자연어 select 확인. workload 스킬은 영구 설치하지 않음 |

Intel Mac 테스트에서는 설치 실패, agent 인식 실패, Intel 전용 오류가 관찰되지 않았습니다.
Windows 테스트에서는 PowerShell installer, `-TargetHome` 임시 홈 설치, 실제 스킬 인식이 통과했습니다. 임시 홈 설치는 `$HOME` 대신 `-TargetHome` 또는 `$env:USERPROFILE` 기준으로 격리하는 방식을 사용합니다.

---

## 빠른 사용 예시

### GitHub 스킬을 저장하고 자연어로 다시 사용하기

```text
/paseo-skill-save https://github.com/owner/repo/tree/main/path/to/skill
```

에이전트는 먼저 대상 저장소를 읽기 전용으로 검사합니다. 통과하면 내부 엔진을 자동 준비하고 원본 커밋과 체크섬을 고정해 로컬 overlay에 등록한 뒤, private `paseo_skill_save` 저장소에 동기화합니다. GitHub 인증이 없으면 로컬 저장을 보존한 채 연결 명령과 sync-pending 상태를 보고합니다.

```text
회의 녹취에서 결정사항과 담당자별 할 일을 정리해줘
```

다른 컴퓨터에서는 같은 GitHub 계정의 portable library를 검증해 로컬 overlay를 재구성합니다. 이후 `skill-hub-router`가 로컬에서 맞는 스킬을 골라 이번 작업에만 연결합니다. 모든 workload 스킬을 agent 경로에 설치하지 않으며, 설명 전용 스킬은 다시 묻지 않고 적용하고 실행·외부 변경·삭제 동작은 기존 확인 절차를 유지합니다. 라우터를 처음 설치한 직후에는 새 agent 세션이나 integration reload가 필요할 수 있습니다.

### 다른 컴퓨터와 모바일로 산출물 공유하기

최초 공유 요청에서 GitHub 연결을 확인하고 인증된 계정의 private
`paseo_share` 저장소를 자동으로 준비합니다.

```text
/paseo-share 이 보고서 휴대폰에서 볼 수 있게 공유해줘.
```

GitHub 인증이 없으면 `gh auth login --hostname github.com` 연결을 먼저
안내합니다. Forgejo나 별도 저장소를 쓰려면 `setup <repo-url>`을
명시적으로 사용합니다.

그다음 자연어로 게시하거나 가져옵니다.

```text
/paseo-share 이 보고서 휴대폰에서 볼 수 있게 공유해줘.
/paseo-share 다른 컴퓨터에서 방금 공유한 파일 보여줘.
/paseo-share 최신 공유 파일을 현재 프로젝트로 가져와서 요약해줘.
```

게시 결과에는 공유 ID와 클릭 가능한 미리보기/다운로드 링크가 포함됩니다. private 저장소 링크는 모바일 브라우저에서 GitHub/Forgejo 로그인이 필요합니다.

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

### 설치 전 스파이웨어 체크하기

```text
/paseo-spyware-check
https://github.com/owner/repo 설치해도 되는지,
install script, secret 접근, 원격 코드 실행, 데이터 유출 위험 위주로 검사해줘.
```

기본 원칙:

- repo 코드를 실행하지 않고 읽기 전용으로 검사합니다.
- macOS/Linux에서는 bundled helper가 있으면 temp clone 후 정적 리포트를 만듭니다.
- Windows에서는 bundled PowerShell helper로 native 정적 리포트를 만들 수 있습니다.
- `gitleaks`, `trufflehog`, `semgrep`, `osv-scanner`, `trivy`, `shellcheck`, `yara`가 설치되어 있으면 사용하고, 없으면 `rg` 기반 휴리스틱으로 내려갑니다.
- scanner가 없으면 포함된 helper로 설치 명령을 먼저 보여주고, 승인 후 Homebrew 기반으로 설치할 수 있습니다.
- 결과는 severity별로 `High`, `Medium`, `Info`로 분류하고, scanner 문서/정규식에 들어 있는 self-reference는 `Info`로 표시합니다.
- helper report에는 `Finding Summary`가 포함되어 `High / Medium / Info` 개수와 verdict hint를 먼저 보여줍니다.
- 결과는 `Low / Medium / High / Critical` verdict와 파일/라인 근거로 정리합니다.

### 테스트 agent 정리하기

```text
/paseo-agent-cleanup
비활성 agent랑 테스트 workspace 정리해줘.
비활성 agent는 묻지 말고 바로 archive하고, workspace는 후보만 보여줘.
실행 중이거나 동작 중인 agent는 건드리지 마.
```

기본 원칙:

- 모든 비활성 agent는 서브에이전트를 포함해 이름이나 용도와 무관하게 다시 묻지 않고 자동 archive합니다.
- `delete`는 하지 않고 `archive`만 합니다.
- 활성 agent는 자동으로 정리하지 않습니다.
- workspace archive는 사용자 승인 후에만 진행합니다.

---

## `/paseo-skill-save`

GitHub 저장소나 정확한 스킬 경로를 받아 `/paseo-spyware-check`로 먼저 정적 검사하고 사용자 컴퓨터의 개인 overlay에 저장한 뒤 private `paseo_skill_save` 저장소에 동기화합니다. 공개 [skillNload](https://github.com/wilgon456/skillNload)는 내부 라우팅 엔진으로만 사용하며 사용자가 별도로 설치하거나 명령을 실행할 필요가 없습니다.

핵심 규칙:

- wrapper를 직접 실행해도 bundled Python spyware gate가 manager보다 먼저 실행되며, 유효한 검사 receipt가 없으면 저장하지 않습니다.
- High/Critical은 차단하고 Medium은 findings를 확인한 사용자가 명시적으로 승인한 뒤에만 `--approve-medium`으로 진행합니다.
- GitHub 소스는 검사한 exact commit URL로 저장하고, 저장 결과의 commit·path·checksum을 receipt와 대조합니다.
- 대상 스킬의 dependency 설치, build, import, script 실행을 저장 과정에서 금지합니다.
- 내부 엔진은 hard-coded commit과 전체 Git tree가 모두 일치할 때만 실행하고, 변조된 cache는 자동 복구하거나 실행하지 않습니다.
- 원본 repository, 고정 commit, skill path, checksum, license와 정적 검사 결과를 기록합니다.
- 저장 직후 `verify`, `search`, 자연어 `match --agent-packet`을 실행해 실제 선택과 본문 증거까지 확인합니다.
- 기본 저장은 `<github-login>/paseo_skill_save`를 private으로 준비하거나 안전하게 재사용하며, `--local-only`는 사용자가 이 컴퓨터에만 저장하라고 요청했을 때 사용합니다.
- 동명 저장소가 public이거나 다른 용도로 사용 중이거나 완전히 검사되지 않으면 가시성 변경·초기화·덮어쓰기 없이 중단합니다.
- 다른 컴퓨터는 portable library의 marker, schema, checksum과 경로를 검증한 뒤 로컬 overlay를 재구성합니다. 기기별 절대 경로·활성화·TTL 상태는 동기화하지 않습니다.
- 원격 sync가 실패해도 검증된 로컬 overlay는 보존하고 `saved-locally-sync-pending`과 안전한 재시도 방법을 보고합니다.
- `instructions-only` 스킬만 확인 없이 `on-demand`로 적용합니다.
- scripts, external-write, destructive 위험은 저장 후에도 사용자 확인을 유지합니다.
- workload 스킬은 로컬 library에 보관할 수 있지만 agent skill target에 일괄 설치하지 않습니다. Paseobility나 공개 skillNload 저장소에는 업로드하지 않습니다.

---

## `/paseo-share`

작은 문서, 코드, PDF, 이미지를 전용 private Git 저장소에 불변 artifact로 게시합니다. GitHub Actions나 background daemon 없이 각 컴퓨터에서 로컬 `git fetch`, `rebase`, `commit`, `push`만 실행합니다.

- `onboard`: GitHub 인증 확인 후 `<login>/paseo_share` private 저장소 생성 또는 안전한 재사용
- `setup`: 컴퓨터별 machine name과 동일한 원격 저장소 설정
- `publish`: 공유 ID, 미리보기 URL, 다운로드 URL 반환
- `list` / `latest`: 원격 동기화 후 다른 컴퓨터 산출물 조회
- `fetch`: 공유 ID 또는 `latest`를 현재 컴퓨터로 검증 후 복사

Artifact는 `artifacts/<machine>/<year>/<month>/<artifact-id>/` 아래 저장됩니다. 50 MiB 이하의 일반 문서·코드·PDF·이미지만 허용하며 secret-looking 파일명과 대표적인 텍스트 토큰 패턴을 차단합니다. 가져올 때 metadata 스키마, 경로 containment, symlink, 파일 크기, SHA-256을 검사하고 Windows CRLF와 macOS/Linux LF 변환을 안전하게 처리합니다.

지원 모델은 **한 사용자가 자기 private 저장소를 신뢰하는 자기 기기들에서 사용하는 방식**입니다. 신뢰하지 않는 여러 사용자가 하나의 저장소를 함께 쓰는 멀티테넌트 교환은 지원하지 않습니다. 바이너리 내부의 민감정보는 검사하지 않으며, Git에서 삭제해도 과거 commit에는 남으므로 민감 파일은 게시하지 않아야 합니다.

자동 온보딩은 동명 저장소가 public이거나 Paseo Share 구조가 아닌 경우
가시성 변경, 이름 변경, 삭제, 덮어쓰기를 시도하지 않고 중단합니다.

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

## `/paseo-spyware-check`

GitHub URL이나 로컬 repo를 설치하기 전에 spyware, 악성 install script, secret 탈취, 원격 코드 실행, supply-chain 위험 신호를 정적으로 점검합니다.

확인하는 것:

- `package.json`의 `preinstall`, `install`, `postinstall`, `prepare`
- shell/PowerShell script의 remote download/execute, hidden process, persistence
- `.ssh`, `.aws`, `.npmrc`, browser profile, keychain, API token 접근
- `eval`, `Function`, `base64`, `EncodedCommand`, `child_process` 같은 obfuscation/실행 패턴
- GitHub Actions의 `pull_request_target`, unpinned action, secret 노출 위험
- optional scanner 결과: `gitleaks`, `trufflehog`, `semgrep`, `osv-scanner`, `trivy`, `shellcheck`, `PSScriptAnalyzer`, `yara`
- helper report의 severity 분류: `High`, `Medium`, `Info`
- helper report의 `Finding Summary` count와 verdict hint
- scanner 문서/스크립트에 들어 있는 self-reference 패턴

핵심 규칙:

- 검사 대상 repo의 코드는 실행하지 않습니다.
- dependency install/build/test를 돌리지 않습니다.
- 민감 값은 출력하지 않고 파일/라인/키 이름 중심으로 redaction합니다.
- 깨끗한 결과도 "절대 안전"이 아니라 "정적 검사에서 고위험 신호가 보이지 않음"으로 표현합니다.
- scanner 자체 문서나 정규식 설명에서 잡힌 self-reference는 숨기지 않고 `Info`로 분류합니다.

Third-party scanner note:

- `/paseo-spyware-check`는 로컬에 설치된 외부 오픈소스 스캐너 CLI를 호출해 사용하는 방식입니다.
- Paseobility는 해당 스캐너의 바이너리나 룰셋을 저장소에 포함하거나 재배포하지 않습니다.

포함된 helper:

```bash
# Cross-platform JSON receipt used by paseo-skill-save
python skills/paseo-spyware-check/scripts/spyware-check.py https://github.com/owner/repo --json
```

```bash
# macOS/Linux
skills/paseo-spyware-check/scripts/spyware-check.sh --target https://github.com/owner/repo
skills/paseo-spyware-check/scripts/install-scanners.sh --dry-run
```

```powershell
# Windows PowerShell
.\skills\paseo-spyware-check\scripts\spyware-check.ps1 -Target https://github.com/owner/repo
.\skills\paseo-spyware-check\scripts\install-scanners.ps1 -DryRun
```

---

## `/paseo-agent-cleanup`

Paseo의 비활성 agent와 테스트 workspace를 안전하게 정리합니다.

확인하는 것:

- `paseo ls --json`의 agent 목록
- `paseo workspace ls --json`의 workspace 목록
- 이름이나 용도와 무관한 모든 비활성 agent
- 필요하면 `--pattern`으로 좁힌 이름/경로 후보
- 명시적으로 지정한 agent/workspace ID

핵심 규칙:

- 모든 비활성 agent는 서브에이전트를 포함해 다시 확인하지 않고 기본 archive합니다.
- running, working, active, starting, queued, pending, busy, executing,
  in-progress 상태의 agent는 archive하지 않습니다.
- delete는 지원하지 않습니다.
- workspace archive는 `--archive --yes` 또는 명확한 사용자 승인 후에만 실행합니다.

포함된 helper:

```bash
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --agent <agent-id> --archive --yes
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --workspace <workspace-id> --archive --yes
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
VERSION
paseobility.json
skills/
├── paseo-agent-tournament/
│   └── SKILL.md
├── paseo-agent-cleanup/
│   ├── SKILL.md
│   └── scripts/
│       └── agent-cleanup.js
├── paseo-computer-use/
│   └── SKILL.md
├── paseo-project-bootstrap/
│   └── SKILL.md
├── paseo-spyware-check/
│   ├── SKILL.md
│   └── scripts/
│       ├── install-scanners.sh
│       ├── install-scanners.ps1
│       ├── spyware-check.py
│       ├── spyware-check.test.py
│       ├── spyware-check.ps1
│       └── spyware-check.sh
├── paseo-session-brief/
│   └── SKILL.md
├── paseo-share/
│   ├── SKILL.md
│   ├── agents/
│   │   └── openai.yaml
│   └── scripts/
│       ├── paseo-share.js
│       └── paseo-share.test.js
├── paseo-skill-save/
│   ├── SKILL.md
│   ├── agents/
│   │   └── openai.yaml
│   └── scripts/
│       ├── paseo-skill-save.py
│       └── paseo-skill-save.test.py
└── paseo-orchestration/
    └── SKILL.md
scripts/
├── paseobility-context.sh
├── paseobility-doctor.sh
├── paseobility-init.sh
└── paseobility-install.ps1
AGENTS.md
CLAUDE.md
```

---

## 같이 보면 좋은 프로젝트

- [skillNload](https://github.com/wilgon456/skillNload) - 사용자 선택 스킬을 검증·동기화하고 자연어 요청에 필요한 스킬만 연결하는 개인 스킬 라이브러리

---

<div align="center">

<strong>브라우저는 손처럼 쓰고, 에이전트는 팀처럼 굴리세요.</strong>

</div>
