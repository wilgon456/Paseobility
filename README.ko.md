<div align="center">

<h1>Paseobility</h1>

<p><strong>GitHub URL을 Codex/Claude에게 던져 설치하는 Paseo 슬래쉬 스킬팩</strong></p>

<p>
  <strong>한국어</strong> · <a href="./README.md">English</a>
</p>

<p>
  <img alt="Version" src="https://img.shields.io/badge/version-v2.8.1-111827?style=for-the-badge">
  <a href="https://paseo.sh"><img alt="Paseobility Skill Pack" src="https://img.shields.io/badge/Paseobility-Skill%20Pack-111827?style=for-the-badge"></a>
  <img alt="Browser Automation" src="https://img.shields.io/badge/Browser-Automation-2563eb?style=for-the-badge">
  <img alt="Multi Agent Orchestration" src="https://img.shields.io/badge/Multi--Agent-Orchestration-7c3aed?style=for-the-badge">
  <img alt="Project Bootstrap" src="https://img.shields.io/badge/Project-Bootstrap-059669?style=for-the-badge">
  <img alt="Agent Tournament" src="https://img.shields.io/badge/Agent-Tournament-db2777?style=for-the-badge">
  <img alt="Spyware Check" src="https://img.shields.io/badge/Spyware-Check-dc2626?style=for-the-badge">
  <img alt="Agent Cleanup" src="https://img.shields.io/badge/Agent-Cleanup-475569?style=for-the-badge">
  <img alt="Paseo Share" src="https://img.shields.io/badge/Paseo-Share-0284c7?style=for-the-badge">
</p>

<p>
  <code>/paseo-browser</code>로 웹 UI를 직접 조작하고,<br>
  <code>/paseo-orchestration</code>로 여러 모델의 답을 비교하고,<br>
  <code>/paseo-project</code>으로 새 프로젝트 맥락을 세팅하고,<br>
  <code>/paseo-share</code>로 컴퓨터와 모바일 사이에 산출물을 공유합니다.
</p>

</div>

---

## 한 줄 요약

Paseobility는 사용자가 이 GitHub repo URL을 Codex, Claude, Paseo agent에게 던져 설치하게 만든 **agent-installable Paseo 슬래쉬 스킬팩**입니다.

설치되면 Paseo에서 자주 쓰는 browser use(웹 브라우저 조작), 멀티에이전트 오케스트레이션, 에이전트 토너먼트, 세션 브리프, 프로젝트 bootstrap, 설치 전 repo 보안 점검, 비활성 서브에이전트 정리와 기기 간 산출물 공유를 슬래쉬 명령처럼 꺼내 쓸 수 있습니다.

기본 Paseo만으로도 내장 도구를 조합하면 비슷한 일을 할 수 있습니다. 다만 매번 에이전트가 그 조합을 새로 판단하게 두면 느리고 결과가 들쭉날쭉할 수 있어서, 자주 쓰는 패턴을 바로 꺼내 쓰기 쉽게 묶었습니다.

이 repo는 **Paseo 내장 도구를 반복 가능하게 조합하기 위한 스킬 패키지**입니다. macOS/Linux용 bootstrap helper와 Windows PowerShell 설치 helper를 함께 제공합니다.

---

## v2.8.1 — Windows Cua 설치 수정, 읽기 전용 doctor, 오프라인 테스트

v2.8.1은 Windows 전용 Cua Driver 설치 충돌을 고치고 읽기 전용 진단 helper와
오프라인 테스트를 추가합니다. Cua/Paseo 바이너리는 변경하지 않습니다.

- **Windows Cua 스테이징 수정(코드 수준).** `scripts/paseobility-cua-driver.ps1`은
  사설 스테이징 bin에 설치하고, 게시 전에 바이너리를 검증하며, 실행 파일 집합만
  게시하고 실패 시 이번 실행이 만든 파일만 롤백합니다. 실제 Windows 신규 설치는
  **재현하지 않았고** 오프라인으로만 검증됩니다
  ([플랫폼 검증](docs/cua-platform-validation.md)).
- **읽기 전용 doctor.** `scripts/paseobility-doctor.py`(Python 3 표준 라이브러리)와
  얇은 `.sh`/`.ps1` 래퍼가 스킬 소스/설치 무결성, Paseo 버전/도달성, Cua
  버전/권한/데몬 상태를 서로 다른 상태로 보고합니다. `--json`은 허용 목록 필드만
  담고 `--target-home`은 격리 검사를 지원합니다. `--check-mcp`는 명시 시에만
  프로토콜/도구 탐색을 수행하며 GUI 결과가 아닙니다.
- **오프라인 테스트와 CI.** `tests/test_doctor.py`, `tests/test_e2e_assets.py`,
  네이티브 `tests/test_cua_driver_runtime.ps1`이 macOS·Windows CI에서 실행되고,
  installer가 선택한 `--target-home`을 doctor에 전달합니다. 두 doctor 래퍼 모두
  Python 3가 필요하지만 진단은 설치에 선택 사항입니다.
- **E2E 자산과 복구 reference.** `e2e/`에 정적 브라우저 fixture와 **수동** runbook용
  포그라운드 fixture 서버를 둡니다(자동 리포트 검증기 없음).
  `skills/paseo-cua/references/recovery.md`는 제한적 재시도, 권한 흐름, 그리고
  `verify_state: unknown`이 통과가 아님을 정리합니다.

[Doctor와 테스트](#doctor와-테스트), [이번 릴리스 테스트](#이번-릴리스v281-테스트--위-기기-행과-별개) 참고.

---

## v2.8.0 — Cua Driver 스킬 추가

v2.8.0에서 `paseo-cua`를 추가했습니다. 이 스킬은 사용자가 **trycua Cua Driver로
네이티브 데스크톱 앱을 직접 구동**하도록 명시 요청할 때만 쓰며, 일반 웹 UI는
`paseo-browser`, 일반 코딩·셸 작업은 다른 스킬이 담당합니다. 패키지 installer가
`paseo-cua` 또는 전체 패키지 설치 시 드라이버를 자동으로 준비합니다. 스킬 자체는
아무것도 설치하지 않으므로, 런타임 없이 수동 복사된 경우에는 설치를 약속하지 않고
사전조건과 복구 안내만 보고합니다.

### Cua Driver 런타임 자동 설치

`paseo-cua`를 선택하거나 전체 패키지를 설치하면 installer가 trycua Cua Driver
런타임도 함께 준비합니다. 다른 스킬만 선택하면 드라이버 부수 효과가 없습니다.
이미 동작하는 드라이버가 있으면 다시 설치하지 않고 재사용하며 자동
업그레이드하지 않습니다.

- 고정 소스: trycua/cua `9bbfa7dd3e27ca7f1861ede70aaca390174493f9` 커밋,
  Cua Driver `0.28.2`.
- 설치 스크립트는 고정 커밋에서 내려받아 임시 디렉터리에서 실행합니다
  (`curl | bash` 금지). 위임 대상인 `_install-rust.sh`, `_install-common.sh`도
  함께 받아 롤링 URL을 실행하지 않게 합니다.
- `--skip-cua-driver` / `-SkipCuaDriver`: 런타임을 건너뛰고 스킬만 복사합니다
  (문서 전용·오프라인).
- 사용자 지정 `--target-home` / `-TargetHome`이면 실제 호스트 런타임은 기본적으로
  건너뛰고 이유를 로그로 남깁니다. `--allow-host-runtime` / `-AllowHostRuntime`은
  스킬 `--target-home`이 사용자 지정일 때도 실제 호스트 런타임 설치를 허용합니다.
  드라이버는 항상 정상 호스트 위치에 설치되며, macOS에서는 여전히
  `/Applications/CuaDriver.app`과 `~/.cua-driver`에 기록하므로 샌드박스가 아닙니다.
- 드라이버 단계는 macOS에서 코드 서명을 검증하고, PATH를 수정하지 않으며
  (`--no-modify-path` / `-NoPathUpdate`), 셸 rc와 MCP 설정을 건드리지 않습니다.
  고정 installer는 릴리스 해석·다운로드와 오래된 데몬 중지만 하며 데몬을 시작하지
  않습니다([`install.sh`](https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/scripts/install.sh),
  [`_install-rust.sh`](https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/scripts/_install-rust.sh)).
- 런타임 단계가 실패하면 installer는 0이 아닌 코드로 종료하고, 스킬은 복사되었
  지만 런타임 설정이 실패했음(설치가 불완전할 수 있음)을 알립니다.
- macOS Accessibility·Screen Recording 권한은 사람이 직접 부여합니다.
  바이너리 설치와 권한 준비 완료는 다릅니다.
- Cua Driver는 제품 텔레메트리가 **기본 활성화**되어 있습니다(installer는 이
  설정을 바꾸지 않습니다). 직접 확인·해제할 수 있습니다:
  `cua-driver telemetry status` / `cua-driver telemetry disable`. Paseobility는
  이 설정을 변경하지 않습니다. 수집 범위는 독립적으로 감사하지 않았습니다 —
  [플랫폼 검증 상태](docs/cua-platform-validation.md) 참고.
- `cp -R` / `Copy-Item` 수동 복사는 문서만 복사하며 Cua Driver 런타임을 자동
  설치할 수 없습니다.

현재 패키지는 **7개 스킬**입니다. CLI·MCP 도구 규격 호환성은 기존 6개 스킬에 대해
v2.7.0 시점에 확인했고 [호환성 보고서](docs/compatibility-0.9.0-beta.2.md)에
기록되어 있으며, 이 보고서는 **`paseo-cua`를 포함하지 않습니다**. 6개 스킬 기록을
7개 전체에 대한 검증으로 해석하면 안 됩니다. `paseo-cua`는 **preview / 제한 검증**
단계로, 넓은 범위의 안정적인 Mac·Windows 지원이 아닙니다. 직접 검증된 경계는
2026-09-21 Apple Silicon macOS 26.6.2 한 대(Cua Driver 0.28.2)이고, Intel macOS와
Windows, 격리된 upstream PR 빌드에 대한 **사용자 보고** 사례는 날짜별 매트릭스와 함께
[Cua 플랫폼 검증 상태](docs/cua-platform-validation.md)에 정리되어 있습니다. 2026-09-22
기준 요약은 아래 [검증 상태](#검증-상태)를 참고하세요.

| 스킬 | 사용 범위 |
| --- | --- |
| `/paseo-orchestration` | 명시 요청한 다중 에이전트 조율 또는 비교·토너먼트 |
| `/paseo-project` | 요청한 프로젝트 요약·인수인계 또는 초기 설정·환경 수정 |
| `/paseo-browser` | Paseo 브라우저의 웹 UI 조작·검증 |
| `/paseo-cua` | 명시 요청한 네이티브 앱 GUI를 trycua Cua Driver로 구동 |
| `/paseo-agent-cleanup` | 선택한 테스트 에이전트·workspace 정리 |
| `/paseo-share` | 개인 기기 간 산출물 공유 |
| `/paseo-spyware-check` | 설치 전 저장소 정적 보안 검사 |

오케스트레이션은 `allow_implicit_invocation: false`를 유지합니다.
프로젝트 스킬은 일반 코딩·세션 재개만으로 실행하지 않습니다.
비교/조율, 요약/설정의 상세 지침은 선택한 모드의 reference만 읽습니다.

| 과거 스킬 | 통합 대상 |
| --- | --- |
| `paseo-agent-tournament` | `paseo-orchestration` 비교 모드 |
| `paseo-session-brief` | `paseo-project` 읽기 전용 요약 모드 |
| `paseo-project-bootstrap` | `paseo-project` 설정 모드 |
| `paseo-computer-use` | `paseo-browser` |
| `paseo-skill-save` | 제거됨; 개인 라이브러리 데이터는 보존 |

기존 설치 업데이트 시 다음 명령은 통합 전 스킬을 백업으로 옮깁니다.
`--with-claude` / `-WithClaude`는 Claude 설치본도 갱신할 때만 사용합니다.

```bash
./scripts/paseobility-init.sh --migrate-skills --no-context
```

```powershell
.\scripts\paseobility-install.ps1 -MigrateSkills
```

일반 복사·설치는 과거 이름을 제거하지 않습니다. 선택 설치에서는 해당
스킬의 이전 이름만 이동합니다. 이전 이름의 백업은 `--no-backup` 또는
`-NoBackup`이어도 남깁니다. unrelated skills와 private runtime은 건드리지
않으며, 이전 디렉터리의 이름/소유를 확인할 수 없거나 링크면 중단합니다.

---

## v2.6.0 업데이트 — Paseo 0.6.1 호환

v2.6.0은 당시 Paseo 0.6.1의 CLI와 내장 도구 스키마에 맞춰 8개 기능을
다시 점검하고, Paseo 런타임에 직접 연결되는 기능을 갱신합니다.

- orchestration/tournament는 구형 `paseo_*` 도구명을 제거하고
  `list_profiles` 우선 선택, profile materialization, `settings.modeId`,
  `settings.thinkingOptionId`, `settings.features` 흐름을 사용합니다.
- provider/model을 추측하지 않고 `list_providers`, `inspect_provider`,
  필요할 때만 `list_models`로 확인합니다.
- worktree workspace, supervised workspace scripts, agent notification,
  schedule 전체 lifecycle, heartbeat delete/recreate 의미를 반영했습니다.
- paseo-browser는 정식 `browser_*` 도구명, workspace 필수 조건, 연결된
  desktop browser host, 최신 stale-ref/error 복구 흐름을 반영했습니다.
- 기존 `/paseo-computer-use`는 실제 OS 전체 제어로 오해될 수 있어
  `/paseo-browser`로 이름을 바꿨습니다. installer는 과거 이름의 설치본을
  자동 삭제하지 않으므로 업데이트 후 기존 `paseo-computer-use` 디렉터리는
  별도로 제거해야 합니다.
- agent-cleanup은 최신 archive JSON인
  `{ agentId|workspaceId, status: "archived", archivedAt }`를 검증합니다.
  더 이상 존재하지 않는 `providerRelease` 필드를 요구해 정상 archive를
  부분 실패로 오판하지 않으며, `initializing` agent도 활성 상태로 보호합니다.
- project-bootstrap/session-brief는 Paseo version/daemon/project/workspace와
  `paseo.json` workspace script 상태를 읽기 전용으로 확인합니다.
- share/spyware-check는 daemon/MCP와 독립적인 로컬 helper라는 호환성 경계를
  명시했습니다. spyware receipt는 문서형 스킬에 선언된 외부 API와 credential
  이름도 실행 코드와 구분된 capability로 보존해 review gate를 유지합니다.

호환 기준은 [Paseo CLI](https://paseo.sh/docs/cli),
[MCP tools](https://paseo.sh/docs/mcp),
[workspaces/worktrees](https://paseo.sh/docs/worktrees),
[schedules](https://paseo.sh/docs/schedules)와 로컬 Paseo 0.6.1입니다.

---

## v2.5.2 업데이트

v2.5.2는 `/paseo-agent-cleanup`이 정상적인 idle Codex 세션을 상태만 보고
archive하던 안전 문제를 수정합니다.

- 인자 없는 실행은 이제 dry-run이며 기본 `.*` 전체 선택을 사용하지 않습니다.
- 무필터 `--auto`는 명확한 disposable/test/validation 표식이 있는 inactive
  agent만 대상으로 삼습니다. 일반 idle 세션은 이어서 사용할 수 있는 정상
  세션으로 보존합니다.
- 명시적 `--agent <id>` 또는 사용자 지정 `--pattern`으로 범위를 제한할 수
  있고, active agent와 승인되지 않은 workspace는 계속 보호합니다.
- archive 후 최신 JSON acknowledgement와 active 목록의 Paseo record 제거를
  함께 검증합니다.
- 검증 과정에서 history/timeline/resume을 열지 않으며 delete, stop, kill,
  lock-file 삭제, daemon restart를 수행하지 않습니다.

## v2.5.1 업데이트

v2.5.1은 `/paseo-share`의 에이전트 UX 회귀를 고칩니다.

- `/paseo-share`: top-level `help`와 `--help`가 설정·Git·GitHub·파일시스템 부수 효과 없이 usage를 출력하고 exit 0으로 종료합니다. 알 수 없는 명령은 기존처럼 nonzero입니다.

## v2.4.1 업데이트

v2.4.1은 `/paseo-spyware-check`의 macOS/Linux helper가 report 디렉터리나 필수 출력 파일을 만들지 못했을 때 성공으로 끝나던 문제를 수정합니다. 필수 I/O 실패는 즉시 nonzero로 종료하고, 선택형 외부 scanner의 실패는 `tools.log`에 기록한 뒤 나머지 검사와 fallback 정적 검사를 계속합니다.

## v2.4.0 업데이트

v2.4.0에서는 `/paseo-share`가 인증 계정의 private `paseo_share` 저장소를 안전하게 자동 준비했습니다. 당시 `/paseo-agent-cleanup`은 모든 비활성 agent를 자동 archive했지만, 이 동작은 v2.5.2에서 안전한 dry-run/명시적 선택 정책으로 대체되었습니다.

| 추가/보강 기능 | 역할 |
| --- | --- |
| `/paseo-share` | private `paseo_share`에 파일을 게시하고 공유 ID와 미리보기·다운로드 링크 반환. 다른 컴퓨터에서는 검증 후 자동 가져오기 |
| `/paseo-spyware-check` | GitHub URL이나 로컬 repo를 설치하기 전에 악성 install script, secret 접근, 원격 코드 실행, exfiltration, supply-chain 위험 신호를 읽기 전용으로 점검 |
| `/paseo-agent-cleanup` | 일반 idle 세션을 보존하고 명시적으로 선택되거나 disposable 표식이 있는 inactive agent만 archive. workspace는 승인 후 archive-only 방식으로 정리 |
| Installer backup | 기존 같은 이름의 skill 디렉터리를 덮어쓰기 전에 `skills-backups/` 아래로 자동 백업 |
| Report summary | spyware helper report에 `High / Medium / Info` count와 verdict hint 추가 |

`/paseo-spyware-check`는 로컬에 설치된 외부 오픈소스 scanner CLI를 호출하는 방식입니다. Paseobility는 해당 scanner의 바이너리나 룰셋을 저장소에 포함하거나 재배포하지 않습니다.

`/paseo-agent-cleanup`은 기본 dry-run으로 후보만 보여줍니다. 일반 idle 세션은 보존하고, 명시적 ID·사용자 지정 패턴·명확한 disposable/test/validation 표식 중 하나로 선택된 inactive agent만 archive합니다. running 등 활성 agent는 건드리지 않고, workspace cleanup은 승인 후 archive-only 방식으로만 처리합니다.

`/paseo-share`는 첫 실제 공유 요청에서 GitHub CLI 인증을 확인하고 `<로그인 계정>/paseo_share`를 private 저장소로 준비합니다. 다른 컴퓨터에서 같은 GitHub 계정으로 온보딩하면 기존 저장소를 안전 검사 후 재사용합니다. Forgejo나 다른 저장소는 명시적인 `setup <repo-url>`로 연결할 수 있습니다. 업로드한 파일은 모바일에서 링크로 바로 미리볼 수 있고, 다른 컴퓨터의 Paseo는 공유 ID를 이용해 자동으로 가져옵니다.

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
먼저 --target-home/-TargetHome 임시 경로로 설치 테스트하고, 통과하면 실제 skills 디렉터리에 설치해줘.
설치 후 새 Paseo 세션에서 /paseo-project가 인식되는지도 확인해줘.
```

에이전트는 Codex/Paseo에서는 [AGENTS.md](./AGENTS.md), Claude Code에서는 [CLAUDE.md](./CLAUDE.md)를 읽고 OS별 경로와 설치 절차를 따라갑니다. 이 Paseobility 저장소는 설치 원본입니다. 실제 공유 artifact는 인증 계정의 private `paseo_share` 저장소에 보관하며, 설치만으로 저장소를 만들지는 않습니다.

해당 작업을 명시적으로 요청하면 다음 기능을 사용할 수 있습니다:

- 웹페이지를 열고, 읽고, 클릭하고, 입력하고, 스크린샷으로 검증합니다.
- 작업을 여러 에이전트에게 나눠 맡기고 결과를 합성합니다.
- GPT/Claude/DeepSeek/Grok 같은 여러 모델의 답을 비교해 winner 또는 merged plan을 고릅니다.
- GitHub URL이나 로컬 repo를 설치하기 전에 spyware/supply-chain 위험 신호를 읽기 전용으로 점검합니다.
- 테스트 후 쌓인 disposable 표식의 inactive agent를 범위를 확인해 archive하고, 일반 idle 세션은 보존하며 workspace는 승인 후 archive합니다.
- 작업 산출물을 private Git 공유함에 올리고 다른 컴퓨터나 모바일에서 바로 열거나 가져옵니다.
- 요청 시 repo 맥락, 명령어, 지침, 리스크를 한 장으로 요약합니다.
- 초기 설정을 요청할 때 README, docs, Claude/Codex/Cursor 계열 지침을 모아 작업 맥락을 만듭니다.
- Codex로 구현하고 Claude로 리뷰하는 식의 크로스 프로바이더 협업을 설계합니다.
- 무한 루프, 위험한 제출, 계정 변경 같은 작업에는 명확한 가드레일을 둡니다.

---

## 들어있는 스킬

| Skill | 역할 | 이런 요청에 강함 |
| --- | --- | --- |
| `/paseo-browser` | 브라우저 조작 워크플로우 | 로그인 폼 채우기, 검색 결과 읽기, UI 클릭, 반응형 스크린샷, 웹앱 상태 확인 |
| `/paseo-cua` | 네이티브 데스크톱 GUI 구동 | trycua Cua Driver로 앱 창 조작·스냅샷·검증, 명시 요청 시에만 동작 |
| `/paseo-orchestration` | 다중 에이전트 조율과 비교 | 명시 요청한 조율 또는 토너먼트, 모드별 지침 |
| `/paseo-project` | 프로젝트 요약과 설정 | 요청한 읽기 전용 brief 또는 환경·context 설정 |
| `/paseo-share` | 컴퓨터·모바일 산출물 공유 | private `paseo_share` 자동 준비, 클릭 가능한 미리보기/다운로드 링크, 공유 ID 기반 검증·가져오기 |
| `/paseo-spyware-check` | 설치 전 보안/스파이웨어 정적 점검 | GitHub URL, 로컬 repo, install script, secret, exfiltration, supply-chain 위험 확인 |
| `/paseo-agent-cleanup` | 비활성 agent/workspace 정리 | 기본 dry-run, 일반 idle 보존, 명시적/테스트 표식 후보만 archive, 활성 agent 보호, workspace는 승인 후 archive |

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

# 임시 홈에 먼저 테스트 설치하고 싶다면
.\scripts\paseobility-install.ps1 -TargetHome $tmp.FullName

# Claude Code에서도 같이 쓰고 싶다면
.\scripts\paseobility-install.ps1 -WithClaude
```

### Cua Driver 런타임

`paseo-cua`를 선택하거나 전체 패키지를 설치하면 trycua Cua Driver 런타임도
함께 준비합니다. 다른 스킬만 선택하면 드라이버 부수 효과가 없습니다. 런타임
단계는 멱등하며, 이미 동작하는 드라이버는 재사용하고 자동 업그레이드하지
않습니다.

```bash
# paseo-cua 선택 -> 드라이버 자동 준비
./scripts/paseobility-init.sh --skill paseo-cua --no-context

# 스킬만, 런타임 없음 (문서 전용·오프라인)
./scripts/paseobility-init.sh --skill paseo-cua --skip-cua-driver --no-context

# 사용자 지정 타깃 홈은 실제 호스트 런타임을 기본적으로 건너뜁니다
./scripts/paseobility-init.sh --target-home "$tmp" --no-context

# 사용자 지정 타깃 홈에서 실제 호스트 런타임 설치를 명시적으로 허용
./scripts/paseobility-init.sh --skill paseo-cua --target-home "$tmp" \
  --allow-host-runtime --no-context
```

```powershell
.\scripts\paseobility-install.ps1 -Skill paseo-cua
.\scripts\paseobility-install.ps1 -Skill paseo-cua -SkipCuaDriver
.\scripts\paseobility-install.ps1 -TargetHome $tmp.FullName
.\scripts\paseobility-install.ps1 -Skill paseo-cua -TargetHome $tmp.FullName -AllowHostRuntime
```

드라이버 helper를 직접 실행할 수도 있습니다.

```bash
./scripts/paseobility-cua-driver.sh --check       # 존재만 확인 (없으면 exit 3)
./scripts/paseobility-cua-driver.sh --dry-run     # 실행 계획만 출력
./scripts/paseobility-cua-driver.sh               # 고정 드라이버 준비
```

런타임 단계가 실패하면 installer는 0이 아닌 코드로 종료하고 스킬은 복사되었지만
런타임 설정이 실패했음(설치가 불완전할 수 있음)을 알립니다. 다시 실행하거나
`--skip-cua-driver` / `-SkipCuaDriver`로 스킬만 설치하세요.

### Doctor와 테스트

doctor는 읽기 전용이고 명령마다 제한 시간이 있으며 크로스플랫폼입니다(Python 3
표준 라이브러리). 텍스트 모드는 사람용이고, `--json`은 허용 목록 필드(상태, 개수,
검증된 스킬 이름, 정규화된 시맨틱 버전)만 담는 공유용 산출물이며 원시 명령 출력은
담지 않습니다. 종료 코드 0은 "리포트가 생성됨"을 뜻하며 "모두 준비됨"이 아닙니다.
`--source-root`는 스킬 팩을, `--target-home`은 격리된 설치 루트를 지정합니다.

```bash
python3 scripts/paseobility-doctor.py --root /path/to/project
python3 scripts/paseobility-doctor.py --root /path/to/project --json
# 명시 시에만 MCP 프로토콜/도구 탐색 (데몬 실행 중 필요, GUI 테스트 아님):
python3 scripts/paseobility-doctor.py --root /path/to/project --check-mcp
# 임시 홈에 대한 격리 설치 검사:
python3 scripts/paseobility-doctor.py --target-home /tmp/isolated-home --json
# 같은 인자를 전달하는 얇은 래퍼:
./scripts/paseobility-doctor.sh --root /path/to/project
```

```powershell
.\scripts\paseobility-doctor.ps1 -Root .
# Python helper와 동일한 플래그(-SourceRoot/-TargetHome/-CuaBin/-CuaBinDir):
.\scripts\paseobility-doctor.ps1 -SourceRoot . -TargetHome $tmp.FullName -Json
```

오프라인 테스트 스위트:

```bash
# macOS/Linux
python3 -m unittest discover -s tests -p "test_*.py" -v
```

```powershell
# Windows (네트워크 없음, fixture installer 주입)
pwsh -NoProfile -File tests/test_cua_driver_runtime.ps1
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
- `/paseo-cua`는 trycua Cua Driver 필요. installer가 `paseo-cua` 또는 전체 패키지 설치 시 자동으로 준비하며, macOS Accessibility·Screen Recording 권한은 수동으로 부여해야 함
- 오케스트레이션은 Paseo의 `list_profiles`를 우선 사용합니다. 기존
  `~/.paseo/orchestration-preferences.json`은 선택형 추가 지침으로만 읽습니다.
- 설치 대상 skills 경로
  - macOS/Linux: `~/.agents/skills`
  - Windows: `%USERPROFILE%\.agents\skills`
- bootstrap context 생성 스크립트는 macOS/Linux shell 환경 기준
  - Windows에서는 `scripts/paseobility-install.ps1`로 스킬 설치만 보조합니다.

---

## 검증 상태

기존 6개 스킬의 CLI·MCP 호환성 기록은 v2.7.0 시점
[호환성 보고서](docs/compatibility-0.9.0-beta.2.md)에 있으며, **신규 `paseo-cua`는
포함하지 않습니다**. 6개 스킬 기록을 7개 전체에 대한 검증으로 해석하면 안 됩니다.

`paseo-cua`는 **preview / 제한 검증** 단계로, 넓은 범위의 안정적인 Mac·Windows
지원이 아닙니다. 2026-09-22 기준 현재 상태:

| 환경 | 네이티브 GUI (Cua) | 브라우저 결과와 제한 |
| --- | --- | --- |
| Apple Silicon macOS 26.6.2 · Cua 0.28.2 · 직접 로컬 | Calculator 입력/재확인 + PNG 통과; `verify_state` unknown | viewport 통과; 내장 `fullPage` 실패 |
| Intel Mac mini 16GiB · macOS 15.8 · Paseo 0.8.0 · Cua 0.28.2 | 사용자 보고: 네이티브 GUI + PNG 통과; `verify_state` unknown | 브라우저 입력·viewport 통과; 내장 `fullPage` 실패; 같은 탭 스크롤+이어붙인 전체 PNG는 DPR 1 두 fixture에서만 통과(범용 helper 아님) |
| Intel MacBook 8GiB · macOS 15.7.9 · Paseo 0.7.2 · Cua 0.17.0(재사용) | 사용자 보고 이전 E2E: 네이티브 GUI/PNG 통과; `verify_state` unknown | 브라우저 입력·viewport 통과; 내장 `fullPage` 실패; 설치된 0.9.0-beta.2는 그대로 두었고 재검증하지 않음 |
| MacBook 후속 · 격리된 upstream PR `#3197` 빌드(보고 버전 0.3.1) | — | 사용자 보고: 실제 MCP `browser_screenshot(fullPage:true)`가 DPR 2에서 2573px·3511px를 각각 2회 통과, 반복 SHA 동일 |
| Windows 11 25H2 · Paseo 0.9.0-beta.2 · Cua 0.28.2 | 사용자 보고: MCP 57개 도구 + Calculator 입력/AX/PNG/`verify_state` 통과 | viewport·fullpage PNG 실패(`screenshot_no_frame` 후 15초 timeout, 이미지 없음); DOM fixture 입력·클릭·스크롤 통과; localhost HTTP 실패; 물리적 브라우저 호스트 불명 |

참고:

- 이번 리뷰에서 직접 확인한 것은 Apple Silicon 행 하나뿐이며, Intel Mac과 Windows 행은 **사용자 보고**로 독립 재현되지 않았습니다. MacBook 후속은 upstream PR 빌드를 제품 코드 추가 수정 없이 사용한 것으로, Paseobility가 릴리스·설치한 수정이 **아닙니다** — 0.9 backport는 충돌로 중단했고, 0.3.1 다운그레이드는 권장하지 않습니다.
- 네이티브 통과는 좁게 시험한 흐름에 한정되며 플랫폼 전체 지원이 아닙니다. 8GiB는 최소 RAM 보장이 아니고, 메모리는 최대 사용량까지 측정하지 않았습니다.
- 보고된 호스트에서 Windows 자동 런타임 설치는 **코드 수준 충돌**이 있었습니다: 공용 비정션(non-junction) `.local/bin`을 고정 upstream installer보다 먼저 생성해서, 이미 존재하는 비정션 디렉터리를 거부하는 installer와 충돌했습니다. v2.8.1은 사설 스테이징 bin에 설치하고 실행 파일 집합만 게시하며, `tests/test_cua_driver_runtime.ps1`이 충돌·롤백·공용 bin 보존을 오프라인으로 검증합니다. 이번 릴리스에서 실제 Windows 신규 설치는 재현하지 **않았으므로**, 이전 수동 하드링크 복구가 마지막 실기기 근거입니다. Windows catalog에서 명시 전용 스킬 2개는 여전히 확인되지 않았습니다.
- 테스트 수는 보고 기준이며 이번 README 업데이트에서 재실행하지 **않았습니다**: Intel Mac mini 41개(cleanup 11 + share 15 + scanner 13 + shell 2); Windows 63 passed / 2 failed / 1 skipped, 이전과 동일.
- PowerShell wrapper는 이 Mac에서 `pwsh`가 없어 소스 검토만 했습니다. 제공된 Windows 보고는 스킬 migration과 런타임 수동 복구를 확인했습니다. 임시 경로 설치·이전과 helper 회귀 테스트는 확인했습니다.
- v2.7 6개 스킬 호환 문서는 7개 전체의 런타임을 증명하지 **않습니다**. 이 문서 업데이트는 Paseo 앱이나 캡처 엔진을 수정하지 않습니다. 바이너리 설치를 권한 준비 완료로 오해하면 안 됩니다. 그 밖의 macOS 버전과 Linux는 **미검증**입니다.

### 이번 릴리스(v2.8.1) 테스트 — 위 기기 행과 별개

위 행들은 이전 기기 근거입니다. v2.8.1 릴리스는 macOS·Windows CI에서 오프라인
스위트를 실행했고, [CI 실행
35708474356](https://github.com/wilgon456/Paseobility/actions/runs/35708474356)
(head `9932ea7590ef137552d8b2b4e065e7fbb1792254`)은 macOS·Windows 두 job 모두
**SUCCESS**입니다. 정확한 범위:

- **macOS:** Python 테스트 49개 발견, **49 통과, 0 skip**(Cua Driver 런타임 18,
  doctor 21, E2E 자산 3, 스킬 migration 7), 그리고 Node cleanup **11**, Node share
  **15**, Python scanner **13**, shell **2** — **자동 테스트 총 90개**.
- **Windows 공유 Python 스위트:** 49개 발견 중 **14 통과**, 나머지 **35개는
  POSIX 전용 skip**. Windows job은 Node cleanup **11**, Node share **15**, Python
  scanner **13**도 실행하며 모두 통과합니다.
- **네이티브 PowerShell fixture 스위트:** `pwsh`와 Windows PowerShell 5.1 **양쪽**
  에서 실행되어 각각 **109 assertions, 0 fail, 0 skip**을 보고합니다. 이는 테스트
  케이스 109개가 아니라 *assertion* 수이며, 실제 다운로드한 Cua GUI 테스트가 아닌
  fixture 스위트입니다.
- **여전히 미검증:** 공식 다운로드 경로로 실제 Windows에 Cua를 새로 설치하는 것은
  **재현하지 않았습니다**. fixture 스위트는 스테이징 설치 / 공용 bin 보존 / 롤백 /
  스킬 migration 계약을 증명할 뿐, 실제 다운로드를 증명하지 않습니다.
- `./scripts/paseobility-doctor.sh --root .`를 text와 `--json` 모드로 이 체크아웃에
  대해 실행했고, JSON은 결정적이며 허용 목록 필드만 담습니다. 라이브 호스트는 Cua
  0.28.2(권한 부여됨, 데몬 실행 중), Paseo 0.9.0-beta.2 도달 가능으로 보고됩니다.
- `--check-mcp`를 명시하면 라이브 Cua 0.28.2 MCP 프로브가 프로토콜을 협상하고 한
  연결에서 **도구 56개**를 나열한 것으로 관측되었습니다. 이 프로브는 자체 stdio 서버
  자식을 띄우며 **56개 도구**는 그 부모 프로브에서 나온 값입니다. 프로토콜/도구
  확인일 뿐 GUI 결과가 아니고, Paseo agent 클라이언트의 MCP 설정·도구 탐색을
  증명하지 **않습니다**.
- **GUI E2E는 통과가 아니라 차단됨.** 이 호스트에서 `e2e/` 브라우저 fixture를 수동
  구동하려 했으나 `browser_new_tab http://127.0.0.1:<port>`가 탭 등록을 기다리다
  timeout, 연결된 탭 없음, fixture 서버 종료 후 포트 리스너 없음으로 실패했습니다.
  현재 브라우저 호스트가 탭을 등록하지 못해 GUI 통과를 주장하지 않습니다. 위 기기
  행 기록은 그대로입니다.
- 이번 릴리스에서 업데이트한 `paseo-cua` 스킬은 Codex/Paseo와 Claude 스킬
  디렉터리 양쪽에 백업과 함께 로컬 설치했습니다. 소스 7개 트리 모두 일치하고 나머지
  12개 설치 트리는 그대로였으며, Cua 런타임은 0.28.2로 유지되었습니다.

### 롤백

- 이번 변경은 스크립트·테스트·문서·E2E 자산이며 Cua/Paseo 바이너리를 수정하지
  않습니다. 이전 helper 동작을 되돌리려면 v2.8.0 트리를 참조할 수 있지만 이는
  **보장된 태그가 아닙니다**. 가장 안전한 방법은 이전 `main` 커밋
  `970ea8cab7c3fef757d2bd13f58c8389758aad1d`를 **별도 clone**에서 checkout하여
  기존 작업을 보존하는 것입니다. 스킬 롤백은 installer 백업을 사용합니다.
- **자동 런타임 롤백은 없습니다.** Paseobility는 설치된 Cua Driver를 자동
  업그레이드하지 않으므로 이미 동작하던 드라이버는 그대로 둡니다.
- `paseobility-doctor.sh`와 `paseobility-doctor.ps1`은 **둘 다** Python 3가
  필요합니다. 없으면 각 래퍼가 명확한 메시지와 함께 0이 아닌 코드로 종료하고,
  installer는 이를 "진단 사용 불가"로 처리하고 설치를 끝냅니다. Python 3가
  없으면 진단을 건너뛰세요.

세부 내용과 선택형 Playwright 대안, 호스트별 프로브는
[Cua 플랫폼 검증 상태](docs/cua-platform-validation.md)와
[호환성 보고서](docs/compatibility-0.9.0-beta.2.md)를 참고하세요. 아래는 이전 버전에 기록된 검증이며 현재 버전의 증거로 사용하지 않습니다.

### 과거 검증 기록 — 이번 통합본 검증과 별개

| 환경 | 상태 | 확인한 내용 |
| --- | --- | --- |
| Paseo 0.6.1 on Windows | Tested locally | CLI/daemon 0.6.1 일치, agent/workspace/provider JSON, worktree·schedule·heartbeat·archive CLI schema, 최신 MCP/profile/browser 소스 대조, PowerShell 임시 설치 확인 |
| Apple Silicon macOS | Tested | Paseo CLI 0.2.5에서 `Darwin/arm64` 감지, 임시 HOME 설치, 실제 `~/.agents/skills` 설치, context 생성, package scripts 감지, 새 Paseo agent의 `/paseo-session-brief` 인식 확인 |
| Intel macOS | Tested | Paseo CLI 0.2.5에서 `Darwin/x86_64` 감지, 임시 HOME 설치, 실제 `~/.agents/skills` 설치, context 생성, package scripts 감지, 새 Paseo agent의 `/paseo-session-brief` 인식 확인 |
| Windows | Tested | Windows 11 x64, Windows PowerShell 5.1, Paseo CLI 0.2.5에서 PowerShell installer, `-TargetHome` 임시 설치, 실제 `%USERPROFILE%\.agents\skills` 설치, 새 Paseo agent의 `/paseo-session-brief` 인식 확인. Native bash context script는 미검증 |
| `/paseo-spyware-check` on Apple Silicon macOS | Tested | Paseo 0.3.0에서 temp HOME 설치, helper script 실행, fixture 위험 패턴 탐지, 새 Paseo agent 인식, scanner dry-run 확인. 필수 report I/O fail-closed와 선택 scanner 실패 계속 처리 회귀 테스트 통과 |
| `/paseo-spyware-check` on Intel macOS | Tested | Darwin x86_64 / Paseo 0.3.0에서 설치, helper script 실행, fixture 위험 패턴 탐지, 새 Paseo agent 인식, Gitleaks secret scan no finding 확인 |
| `/paseo-spyware-check` on Windows | Tested | Windows 11 x64 / PowerShell 5.1 / Paseo 0.3.0에서 native PowerShell static-search workflow regex 컴파일, fixture 위험 패턴 탐지, 새 Paseo agent 인식 확인. Bash helper는 Windows native에서 미검증 |
| `/paseo-agent-cleanup` helper | Tested locally | Node 회귀 테스트에서 bare dry-run, 일반 idle 보존, disposable marker/명시 ID/사용자 패턴 제한, running/initializing 보호, Paseo 0.6 archive acknowledgement와 post-archive 목록 검증, workspace 승인 gate, 위험 명령 미실행 확인 |
| `/paseo-agent-cleanup` on Windows | Previous install verified | Windows 10.0.26200 x64 / Node v24.14.0 / Paseo 0.3.0에서 `%USERPROFILE%\.agents\skills` 설치 및 dry-run JSON 확인. v2.5.2 정책 회귀는 cross-platform Node 단위 테스트로 검증 |
| `/paseo-share` on Apple Silicon macOS | Tested | 공식 skill validator, Node 보안·온보딩·help/`--help` 회귀 테스트, private 저장소 생성/재사용과 public·비관련 저장소 거부 검증, 실제 private GitHub 게시·조회·자동 fetch·원본 SHA-256 비교, Codex/Claude 격리 설치 확인 |
| `/paseo-share` on Windows | Tested | Windows private checkout, PowerShell 설치, private GitHub 연결, 실제 TXT 게시와 원격 파일 조회, 모바일 GitHub 미리보기 확인 |

Intel Mac 테스트에서는 설치 실패, agent 인식 실패, Intel 전용 오류가 관찰되지 않았습니다.
Windows 테스트에서는 PowerShell installer, `-TargetHome` 임시 홈 설치, 실제 스킬 인식이 통과했습니다. 임시 홈 설치는 `$HOME` 대신 `-TargetHome` 또는 `$env:USERPROFILE` 기준으로 격리하는 방식을 사용합니다.

---

## 빠른 사용 예시

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
/paseo-browser
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
/paseo-orchestration
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
/paseo-project
이 프로젝트 처음 보는 상태라고 생각하고 현재 작업 가능한 브리프 만들어줘.
```

출력 범위:

```text
Project -> Current State -> Instructions -> Commands
-> Project Map -> Risks -> Suggested First Moves
```

### 새 프로젝트 맥락 세팅하기

```text
/paseo-project
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
먼저 dry-run으로 disposable/test 표식이 있는 inactive agent와 테스트 workspace 후보를 보여줘.
일반 idle 세션은 보존하고, 내가 지정한 ID나 패턴 밖의 agent는 archive하지 마.
실행 중인 agent는 건드리지 말고 workspace는 승인 전에는 후보만 보여줘.
```

기본 원칙:

- 기본 실행은 dry-run이며 일반 idle agent는 상태만 보고 archive하지 않습니다.
- `--auto`는 명시적 ID, 사용자 지정 패턴, 또는 분명한 disposable/test/validation 표식이 있는 inactive agent에만 허용됩니다.
- `delete`는 하지 않고 `archive`만 하며 활성 agent는 항상 보호합니다.
- workspace archive는 사용자 승인과 명시적 ID가 있을 때만 진행합니다.
- archive 응답의 대상 ID와 상태를 확인하고 active 목록에서 사라졌는지 재조회합니다.

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

## `/paseo-orchestration` 비교 모드

같은 문제를 여러 에이전트에게 독립적으로 맡긴 뒤, 별도 judge가 비교해서 최종 답을 고르는 스킬입니다.

| 모드 | 용도 |
| --- | --- |
| Debate | 한 모델은 찬성, 다른 모델은 반대, judge가 종합 |
| Competing Plans | 여러 설계/수정 계획을 비교 |
| Competing Implementations | 격리 workspace에서 구현 후보를 비교 |

핵심 규칙:

- 먼저 `list_profiles`의 notes를 읽고 profile을 `create_agent` 인자로
  materialize합니다. 맞는 profile이 없으면 `list_providers`,
  `inspect_provider`, 필요 시 `list_models`로 확인합니다.
- 분석만 하면 같은 workspace를 써도 됩니다.
- 파일을 수정하는 tournament는 참가자별 별도 workspace를 씁니다.
- judge는 참가자와 다른 provider를 우선합니다.
- 결과는 winner, runner-up, best merged plan, risks로 정리합니다.

---

## `/paseo-project`

프로젝트 요약과 환경 설정을 하나의 진입점에서 선택합니다.

- **요약 모드:** 요청한 repo 개요·명령·인수인계만 읽기 전용으로 정리합니다.
- **설정 모드:** 요청한 초기 설정·환경 수정·context 생성만 수행합니다.
- 이미 확인한 정보를 재사용하고 같은 문서를 다시 전부 조사하지 않습니다.
- Paseo runtime이 관련될 때만 버전·daemon·workspace를 조회합니다. 경로
  별칭 때문에 `--cwd` 조회가 실패하면 기존 workspace ID를 사용합니다.
- 설치·생성 작업 없이 단순 요약만 요청했다면 파일을 만들지 않습니다.

필요한 모드의 절차는 [스킬](skills/paseo-project/SKILL.md)과 연결된
references에서 확인할 수 있습니다.

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
# Cross-platform JSON security receipt
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
- 명시적 ID, 사용자 지정 `--pattern`, 또는 disposable/test/validation 표식으로 제한된 inactive agent
- 보존해야 할 일반 idle agent와 보호되는 active agent
- 명시적으로 지정한 agent/workspace ID

핵심 규칙:

- 기본 실행은 dry-run이며 일반 idle agent를 상태만 보고 archive하지 않습니다.
- `--auto`는 명시적 ID, 사용자 지정 패턴, 또는 분명한 disposable/test/validation 표식이 있는 inactive agent만 archive합니다.
- running, initializing, working, active, starting, queued, pending, busy, executing,
  in-progress 상태의 agent는 archive하지 않습니다.
- delete/stop/kill/restart와 history/timeline/resume 검증은 사용하지 않습니다.
- archive 후 Paseo CLI JSON acknowledgement와 active 목록 제거를 검증합니다.
- workspace archive는 명시적 ID와 `--archive --yes` 또는 명확한 사용자 승인 후에만 실행합니다.

포함된 helper:

```bash
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run --pattern 'cleanup-validation|fixture'
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto --agent <agent-id>
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto --pattern 'cleanup-validation|fixture'
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --workspace <workspace-id> --archive --yes
```

---

## `/paseo-browser`

브라우저를 "보는" 수준이 아니라 실제로 조작하는 워크플로우를 제공합니다.

| 할 일 | 사용하는 흐름 |
| --- | --- |
| 페이지 읽기 | `browser_new_tab` -> `browser_snapshot` |
| 버튼 클릭 | `browser_snapshot` -> ref 찾기 -> `browser_click` |
| 폼 입력 | `browser_snapshot` -> ref 찾기 -> `browser_fill` / `browser_type` |
| 드롭다운 선택 | `browser_snapshot` -> ref 찾기 -> `browser_select` |
| 화면 검증 | `browser_screenshot` / `browser_snapshot` |
| 반응형 확인 | `browser_resize` -> `browser_screenshot` |
| 디버깅 | `browser_logs` / `browser_evaluate` |

핵심 규칙:

- 액션 전에 항상 최신 snapshot을 뜹니다. 페이지가 바뀌면 ref도 바뀝니다.
- 정식 도구명은 `browser_*`이며 agent가 Paseo workspace에 속하고 desktop
  browser automation host가 연결되어 있어야 합니다.
- 텍스트 이해에는 snapshot, 시각 검증에는 screenshot을 씁니다.
- 결제, 제출, 계정 변경처럼 되돌리기 어려운 액션은 사용자 확인을 먼저 받습니다.
- `evaluate`로 쿠키, 토큰, localStorage 같은 민감 정보를 읽지 않습니다.

---

## `/paseo-cua`

trycua Cua Driver(`cua-driver` CLI 또는 MCP)로 네이티브 데스크톱 GUI를, 명시
요청 시에만 구동합니다. **preview / 제한 검증** 단계입니다 — [Cua 플랫폼 검증 상태](docs/cua-platform-validation.md) 참고.

- 사전조건: `cua-driver --version`이 있어야 합니다. 없으면 사전조건만 보고하고
  중단하며, 이 스킬은 아무것도 설치하지 않습니다.
- 설치된 계약을 먼저 읽습니다: `cua-driver list-tools`, `cua-driver describe <tool>`.
- `cua-driver mcp-config --client opencode`는 config 스니펫만 출력하며 서버를
  등록하지 않습니다.
- 핵심 루프: inspect -> snapshot -> 스냅샷에 묶인 단일 액션 -> 검증.
- `delivery_mode: "foreground"`는 백그라운드 no-op을 검증한 뒤, 사용자 권한
  범위 안에서만 사용합니다.

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
- `list_profiles`의 notes를 먼저 읽고 선택한 profile을 provider/settings로
  materialize합니다. 오래된 provider 문자열을 그대로 재사용하지 않습니다.
- heartbeat와 schedule에는 `maxRuns` 또는 `expiresIn`을 둡니다.
- 네트워크 timeout 같은 일시적 실패는 최대 1회 재시도합니다.
- 권한 부족, 요구사항 모호함, 파괴적 작업은 추측하지 않고 사용자에게 에스컬레이션합니다.

---

## 선택형 추가 지침

Paseo 0.6에서는 앱에 설정된 agent profile이 provider/model/mode/thinking/
feature 선택의 기준입니다. 아래 legacy 파일은 provider source가 아니라
추가적인 사용자 지침만 전달할 때 사용할 수 있습니다.

`~/.paseo/orchestration-preferences.json` 예시:

```json
{
  "preferences": [
    "작업 지시는 self-contained briefing으로 작성한다.",
    "리뷰 에이전트는 구현 에이전트와 다른 provider를 우선한다.",
    "하드 실패는 조용히 우회하지 말고 사용자에게 보고한다."
  ]
}
```

---

## 저장소 구조

```text
skills/
├── paseo-agent-cleanup/       # SKILL.md + CLI helper/tests
├── paseo-browser/            # SKILL.md
├── paseo-cua/                # SKILL.md + explicit-only policy
│   └── references/           # setup.md, workflow.md, recovery.md
├── paseo-orchestration/      # SKILL.md + explicit-only policy
│   └── references/           # coordination.md, tournament.md
├── paseo-project/            # SKILL.md
│   └── references/           # brief.md, setup.md
├── paseo-share/              # SKILL.md + CLI helper/tests
└── paseo-spyware-check/      # SKILL.md + scanners/tests
scripts/                     # installers, doctor (.sh/.ps1/.py), context helper, cua-driver helper
tests/                       # test_doctor.py, test_e2e_assets.py, test_cua_driver_runtime.py/.ps1, test_skill_migration.py
e2e/                         # browser fixture, fixture server, runbook, report template + validator
.github/workflows/ci.yml     # macOS + Windows 오프라인 스위트
docs/compatibility-0.9.0-beta.2.md
docs/cua-platform-validation.md
AGENTS.md
CLAUDE.md
VERSION
paseobility.json
```

---

## 라이선스

[MIT License](./LICENSE).

---

<div align="center">

<strong>브라우저는 손처럼 쓰고, 에이전트는 팀처럼 굴리세요.</strong>

</div>
