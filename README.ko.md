<div align="center">

![Paseobility](docs/readme-banner.svg)

# Paseobility

프로젝트·브라우저·산출물·Paseo로 연결된 PC를 다루는 11개 스킬입니다.

[English](README.md) · **한국어**

![project: skill pack](https://img.shields.io/badge/project-skill%20pack-a78bfa?style=flat-square) ![stack: Paseo](https://img.shields.io/badge/stack-Paseo-a78bfa?style=flat-square) [![License](https://img.shields.io/badge/license-MIT-a78bfa?style=flat-square)](LICENSE)

[설치](#설치) · [스킬](#들어있는-스킬) · [검증](#검증-상태)

[![CI](https://github.com/wilgon456/Paseobility/actions/workflows/ci.yml/badge.svg)](https://github.com/wilgon456/Paseobility/actions/workflows/ci.yml)

</div>

---

`tools/paseo-bot`에 상주형 **Paseo bot** v1을 추가했습니다. 연결된 모든 프로젝트의 PC·경로·검증 명령을 등록하고 Grok 작업 큐에서 worktree 실행과 독립 검수를 진행합니다. [Paseo bot 안내](docs/paseo-bot.md).

## 시작 전에

**현재 패키지: v2.12.7.** 플러그인은 Paseo 0.12.x와 0.13.x를 지원합니다. `/paseo-multi`는 Paseo 0.11.2에서 Mac·Windows 조합을 검증했습니다. 전체 패키지의 기존 호환성 기준선은 0.10.2이며, 11개 스킬 전체가 0.11.2에서 검증된 것은 아닙니다. 0.12.0 보고서는 소스·CLI 정적 확인입니다. 0.13.0 보고서는 임시 0.12.0·0.13.0 데몬에서 플러그인 설치와 정리·multi 어댑터를 실제로 실행한 기록이며, 전체 스킬의 런타임 검증을 뜻하지 않습니다. [Multi 검증 기록](docs/paseo-multi-validation.md) · [전체 기준선 기록](docs/compatibility-0.10.2.md) · [0.12.0 정적 확인](docs/compatibility-0.12.0.md) · [0.13.0 확인](docs/compatibility-0.13.0.md).

## 한 줄 요약

Paseobility는 사용자가 이 GitHub repo URL을 Codex, Claude, Paseo agent에게 던져 설치하게 만든 **agent-installable Paseo 슬래쉬 스킬팩**입니다.

설치되면 Paseo에서 자주 쓰는 browser use(웹 브라우저 조작), 멀티에이전트 오케스트레이션, 에이전트 토너먼트, 세션 브리프, 프로젝트 bootstrap, 설치 전 repo 보안 점검, 비활성 서브에이전트 정리와 기기 간 산출물 공유를 슬래쉬 명령처럼 꺼내 쓸 수 있습니다.

기본 Paseo만으로도 내장 도구를 조합하면 비슷한 일을 할 수 있습니다. 다만 매번 에이전트가 그 조합을 새로 판단하게 두면 느리고 결과가 들쭉날쭉할 수 있어서, 자주 쓰는 패턴을 바로 꺼내 쓰기 쉽게 묶었습니다.

이 repo는 **Paseo 내장 도구를 반복 가능하게 조합하기 위한 스킬 패키지**입니다. macOS/Linux용 bootstrap helper와 Windows PowerShell 설치 helper를 함께 제공합니다.

---

## `/paseo-god` — 명시 호출 작업 모드 (v0)

완료 조건을 먼저 정하고 필요한 디버깅·리뷰·실험 절차만 읽습니다. 작업마다
별도 TODO·검증 근거·재개 지점을 남깁니다. 학습 내용은 저장 후보로 제안하며,
기존 메모리나 설치된 스킬을 자동으로 고치지 않습니다. 선택형 Node 도우미는
기록을 만들고 재개할 뿐, 작업을 자동 실행하는 런타임이 아닙니다.

```bash
./scripts/paseobility-init.sh --skill paseo-god --no-context
```

```powershell
.\scripts\paseobility-install.ps1 -Skill paseo-god
```

```text
/paseo-god 이 버그를 고치고 원래 증상으로 검증해줘. 막히면 재개 지점을 남겨줘.
```

범위·로컬 기록·검증 한계는 [God 안내](docs/paseo-god.md)를 참고하세요.
기존 버전·플랫폼 검증 기록은 당시 범위를 유지합니다.

## 2026-10-28 · 한국어 Windows에서 감독 상태 조회 수정 (v2.12.7)

한국어처럼 UTF-8이 아닌 코드 페이지로 출력하는 Windows에서 `supervise status`가 실패하던
문제를 고쳤습니다. 보호 서비스 상태는 `sc.exe`가 번역하는 라벨이 아니라 번역되지 않는
값으로 판정합니다.

## 2026-10-28 · 어떤 컴퓨터에서든 도는 Paseo 봇: macOS·Linux·Windows (v2.12.6)

이제 봇 본체가 Windows에 있다고 가정하지 않습니다. 상주 감독기가 macOS와 Linux에서도
같은 방식으로 돕니다. 종료 시 재시작, 멈춤 감지, 정상 종료 요청, 경보가 모두 똑같이
동작합니다. `supervisor.py install --apply`는 launchd 에이전트나 systemd 사용자 서비스를
등록하며 관리자 권한이 필요 없습니다. GUI 플러그인은 새 `gui-bridge.sh`로 맥·리눅스 봇에
붙고, 플러그인과 봇이 같은 컴퓨터에 있으면 SSH 없이(`"host": "local"`) 붙습니다. 화면에는
실제 봇 호스트 이름이 나옵니다.
[Paseo 봇](docs/paseo-bot.md#resident-supervisor-opt-in-macos-linux-and-windows).

## 2026-10-28 · 보호 서비스 설치 안내 개선 (v2.12.5)

`supervise install-service -Apply`는 UAC 승인 창에서 거절하거나 창을 닫았을 때
그렇다고 분명히 알리고, 아무것도 바뀌지 않았다고 안내합니다. Windows 테스트는
보호 서비스를 경고 없이 빌드하는지, 설정 검사가 잘못된 값을 거부하는지,
`-Apply` 없는 설치 스크립트가 계획만 보여 주는지 확인합니다.

## 2026-10-28 · Paseo 봇 보호 서비스와 멈춤 감지 (v2.12.4)

Windows 봇 감독기는 이제 종료된 서비스뿐 아니라 응답하지 않는 서비스도 다시
띄웁니다. 서비스가 한 번이라도 심장박동을 남긴 뒤 15분 넘게 조용하면 재시작합니다.
재시작할 때는 먼저 안전한 지점에서 멈추라고 요청하고, 30초 안에 따르지 않을 때만
강제로 종료합니다. 계속 죽거나 멈추면 Windows 알림을 띄우고 GUI 상태를 "확인 필요"로
바꿉니다. `supervise restart`는 작업이 없을 때 새 코드를 다시 읽으며, 실패로 세지
않습니다. 새로 추가한 선택형 Windows 서비스 `PaseoBotGuardian`
(`supervise install-service -Apply`, UAC 승인 한 번)은 서비스 관리자의 재시작 정책으로
감독기 자체를 지킵니다. 사용자 세션과 사용자 권한으로 띄우며, 비밀번호를 저장하지 않고
콘솔 창도 띄우지 않습니다. [Paseo 봇](docs/paseo-bot.md#resident-supervisor-opt-in-macos-linux-and-windows).

## 2026-10-28 · Paseo 업데이트 중에도 멈추지 않는 Paseo 봇 (v2.12.3)

Paseo 설치 프로그램은 봇이 쓰는 클라이언트를 잠깐 지웁니다. 이제 봇은 클라이언트가
없는 상황을 일시 장애로 보고 `transientGraceSeconds` 안에서 5, 10, 20, 40, 80초,
그 뒤로는 120초마다 다시 확인합니다. 상태 확인에 실패했다는 이유만으로 아직 일하는
에이전트를 멈추거나 보관하지 않고 워크트리도 지우지 않습니다. 작업은 `unknown`이
되고 결과에도 그렇게 적힙니다. 모든 실패는 실제 예외 문구를 봇의 stderr 로그에
남깁니다. 작업 에이전트는 봇이 도는 기기를 `PASEO_BOT_PROTECTED_HOSTS`로 전달받고,
`paseo-multi`는 그 기기의 Paseo 업데이트·교체·재시작을 거부하며 수동 업데이트를
안내합니다.

GUI 매니저는 대화마다 Paseo 워크스페이스를 새로 만들지 않고 하나를 함께 씁니다.
`managerIdleDays`(기본 7일) 동안 쓰지 않은 매니저는 보관하고, 다음 메시지가 오면
이전 대화를 맥락으로 넘겨 새 매니저를 띄웁니다. Windows에서는 상주 감독기
(`paseo-bot.ps1 supervise install`)를 선택해 설치할 수 있습니다. 감독기는 콘솔 창
없이 디스패처와 GUI 서비스를 몇 초 안에 다시 띄웁니다. [Paseo 봇](docs/paseo-bot.md).

## 2026-10-25 · 디자인 판단과 AI slop 감소 (v2.12.2)

`paseo-design`에 중복 설명, 장식용 보조 레이블, 불필요한 카드와 습관적인
시각 효과를 줄이는 기준을 추가했습니다. 입력 레이블, 해석에 필요한 정보와
접근성 이름은 유지합니다. 레퍼런스를 구체적인 구도 결정으로 옮기고, 대표 화면을
먼저 검토한 뒤 위계·밀도·타이포그래피·모바일 배치 문제를 수정합니다. 업무 도구에
장식용 콘셉트를 강요하지 않으며 템플릿도 선택한 방향을 따릅니다.
[디자인 절차와 참고 자료](docs/paseo-design.md).

직전 릴리스 이후 이미 병합된 제품 근거·시각 검토 절차, `paseo-god`의 계획·검증·
인계 개선, 플러그인 소개 이미지 변경도 포함합니다. 디자인 품질 향상은 통제된
비교 실험으로 입증하지 않았으며, 기존 호환성 기록의 검증 범위는 그대로입니다.

## 2026-10-24 · Paseo 0.13 대응 (v2.12.1)

플러그인이 Paseo 0.12.x와 0.13.x에서 모두 로드됩니다(`>=0.12.0 <0.14.0`).
Command Center 항목이 추가됐고, 0.13에서는 앱 언어를 따릅니다. 버전 화면과 스킬
선택 창은 Paseo 설정 화면·팝오버와 같은 구성으로 다시 만들어 스킬 아이콘, 설치 상태,
상태 배지, 키보드 선택을 지원합니다. 비공개 입력창
어댑터가 실패해도 버전 화면, 업데이트, `+` 메뉴는 그대로 동작합니다.
`paseo-multi`에 0.13 기본 연결 호스트 사용법을, `paseo-orchestration`에 보고와
완료 알림이 한 메시지로 합쳐진 점을 반영했습니다. CI는 문서와 스크립트의 모든
`paseo` 명령과 플래그를 기록된 CLI 표면과 대조합니다. Paseo 기본 스킬(handoff,
help, advisor, committee)과의 호출 경계를 설명문에 명시했습니다. `paseo-design`은
v2.12.0 이후 병합된 측정 수정을 포함합니다. [0.13.0 확인](docs/compatibility-0.13.0.md).

## 2026-10-24 — Ego Lite 연동 (v2.12.0)

Ego Lite가 설치되어 있으면 일반 웹 작업에서 우선 사용합니다. 사용자 목표당
TaskSpace 하나와 기본 탭 `p1`을 여러 실행에서 재사용하고, 성공 시
`finish({ keep: [] })`로 정리합니다. API·제어권·오류 복구는 설치 버전의 안내를
따릅니다. Chrome을 지정하면 기존 창 어댑터를 사용합니다.
[Ego 실행 흐름과 검증 범위](skills/paseo-browser/references/ego.md).
v2.12.0에 포함된 변경입니다. 아래 v2.11.0 기록은 이전 Chrome 기본 정책입니다.

프레임·팝업·파일 업로드/다운로드와 네이티브 앱 연결 절차도 제공합니다.
선택 실행하는 `ego-smoke.py --live --out <새-폴더>`가 실제 브라우저에서
탭 재사용·중단 복구·파일 결과·완료 정리를 검증합니다. 설치와 CI에서는
실제 브라우저를 열지 않습니다. [기능과 검증 범위](docs/ego-computer-use.md).

## 2026-10-23 — 기존 Chrome 탭 재사용과 Apps in Toss (v2.11.0)

`paseo-browser`는 실행 중인 Chrome의 기존 창에 작업 탭 하나를 만들고 재사용한 뒤 그 탭만 닫습니다. macOS 도우미는 탭 소유 기록, 생성 응답 유실 복구, Chrome 재시작 구분과 종료 확인을 제공합니다. Windows/Linux의 기존 창 어댑터는 아직 미검증이며 macOS 도우미는 실행되지 않습니다. [반복 검증](docs/browser-tab-lifecycle.md).

`paseo-toss`는 공식 Apps-in-Toss Harness의 11개 워크플로우를 하나의 스킬로 묶습니다. 고정된 upstream 67개 파일의 무결성을 검사하며, 설치가 OAuth·업로드·심사 제출을 자동 실행하지 않습니다. [Toss 안내](docs/paseo-toss.md). 진단 도구와 플러그인 목록도 11개 스킬에 맞췄습니다.

## 2026-10-20 — 에이전트를 더 믿기 (v2.10.0)

모든 스킬이 사용자 작업 범위 안에서는 확인 없이 진행하고, 짧은 최소 규칙만
남깁니다. 결제·되돌릴 수 없는 삭제·계정 보안 변경·요청하지 않은 전송/게시는
먼저 묻고, 페이지·화면·원격 출력은 지시가 아닌 데이터로 다루며, 비밀값은
출력하지 않습니다. 스킬의 존재 이유인 규칙은 유지합니다(spyware-check는 대상
코드를 실행하지 않음, agent-cleanup은 실행 중인 에이전트를 건드리지 않음,
share는 private 유지, God·orchestration은 토큰 비용 때문에 명시 호출).
주요 변경: `/paseo-browser` 재사용 에이전트 로그인 프로필·상태 변경 JS·백엔드
자동 전환·작업 후 브라우저 닫기 규칙과 남은 에이전트 브라우저를 정리하는
`scripts/browser-sweep.mjs`, `/paseo-cua`는 GUI가 필요한 작업이면 사용, `/paseo-multi` `all`
대상·`exec --command`·`restart --force`, `/paseo-share` 50 MiB 이하 모든 파일
형식·여러 파일 동시 공유, `/paseo-god` `list`로 최근 실행 이어가기. 브라우저
런타임은 `cloakbrowser@0.6.3`, `playwright-core@1.64.1`로, Cua Driver는 0.36.0으로 올렸습니다
([의존성 검증](docs/dependency-validation-2026-10-20.md)). Paseo 0.12.0 변경(백그라운드
워크스페이스, 제거된 `background` 인자)은 정적으로 점검해 반영했으며 실제 0.12
daemon에서 실행하지는 않았습니다([0.12.0 호환성](docs/compatibility-0.12.0.md)).

## 2026-10-19 — God 모드 고정 비용 비례화 (v2.9.4)

`/paseo-god`가 작업마다 반복되는 고정 비용을 변경 크기에 맞춥니다. 실측한
프로젝트에서 Git과 검사는 몇 초였지만, 작업마다 필수 문서를 다시 읽고 두 번째
에이전트가 같은 맥락을 다시 파악하며 느린 검사를 수정마다 반복해 커밋 주기가
길었습니다. 이제 변경 등급을 한 번 정해 필요한 검사만 기록하고, 필수 문서는
실행당 한 번 읽으며, 느린 검사는 묶음당 한 번 돌리고, `RUN.md`로 맥락을
넘깁니다. 프로젝트 규칙은 그대로 따르며, 측정된 과도한 규칙 비용은 학습 후보로
제안합니다. 자세한 내용은 [God 안내](docs/paseo-god.md)를 참고하세요.

## 2026-10-15 수정 릴리스 — Windows·원격 Mac (v2.9.3)

설치된 스킬팩을 Windows PC 한 대와 원격 Mac 세 대에서 실제로 돌려 보다가
결함 세 가지를 찾아 시험과 함께 고쳤습니다.

- `/paseo-share`의 `list`·`latest`·`fetch`가 산출물 하나가 검증에서 떨어져도
  (예: 예전 판이 받던 `.mp4`) 통째로 실패하지 않습니다. 그 항목만 경고와 함께
  건너뛰고, 검증을 통과한 메타데이터만 씁니다.
- doctor가 꺼진 Cua 데몬을 `stopped`로 보고합니다. cua-driver 0.34.x는
  `status`에 종료 코드 1과 stderr로 답하는데, 이를 지원하지 않는 명령으로
  잘못 읽었습니다.
- `/paseo-multi`의 `exec --workspace ID`로 터미널마다 작업 공간을 요구하는
  데몬(Paseo 0.11.2: "workspaceId is required")을 지원하고, 실패하면 데몬이
  알려 준 이유를 그대로 보여 줍니다. 비밀이 든 실행은 끝나자마자 닫으세요.

macOS·Windows CI와 VAX_COM(Windows)·MAC_COM·mac_home·MAC_MINI 실기에서
확인했습니다.
## 2026-10-13 후속 보완 — 기존 9개 스킬 전체 (v2.9.2)

첫 수정은 정리·브라우저·Cua·디자인에 집중했습니다. 이번에는 Multi·조율·
프로젝트·공유·보안 검사도 공식 자료와 비교해 보완했습니다. 원격 에이전트
전체 페이지 조회, 작업 트리 인계·통합 검증, 모노레포 컨텍스트, 오류별 공유
재시도, 최신 스캐너 명령과 보고서 원문 제외를 반영했습니다. 별도로 추가된
God 워크플로는 기존 9개 검토 범위에 포함하지 않습니다.
[스킬별 범위·검증 기록](docs/all-skills-validation-2026-10-13.md)에 출처와
로컬 검사, 남은 실제 실행 한계를 기록했습니다.

## 2026-10-13 업데이트 — 의존성 최신화 (v2.9.1)

- 브라우저 예제를 `cloakbrowser@0.6.3`, `playwright-core@1.64.1`으로 함께
  고정했습니다. Node 조건은 `^20.19.0 || >=22.12.0`입니다. ESM과 CommonJS를
  모두 지원하지만 예제는 동적 import를 유지합니다. 키 없는 무료 브라우저는
  macOS Chromium 145이며, 라이선스가 필요한 Chromium 154 채널과 구분합니다.
- 새 Cua 설치는 `0.34.1`, 불변 커밋
  `0c69d9a2c8abbb5051a2df4a23f0fa166d5385dc`을 사용합니다. 동작 입력은
  `element_token`을 사용하며, 표시용 미리보기와 입력을 위한 캡처를 구분합니다.
  패키지 설치기는 기존 동작 중인 드라이버를 계속 재사용합니다. 호스트 업그레이드는
  별도의 명시적 업데이트 요청으로 수행합니다.
- Vercel 인터페이스 지침의 오프라인 사본을 2026-10-05 커밋으로 갱신했습니다.
- 로컬 Apple Silicon Mac에서 새 브라우저의 입력·클릭·결과 재확인, 세 화면 크기
  캡처, 실패 후 브라우저 종료를 확인했습니다. 사용자가 요청한 Cua
  0.28.2 → 0.34.1 업그레이드는 OS 권한을 유지했고 버전·doctor·도구 스키마를
  확인했습니다. 새로운 네이티브 GUI 종단 검증이나 Windows/Linux 실행 결과는 아닙니다.

이번 로컬 v2.9.1 준비에는 정리 스킬 보완도 포함됩니다. 페이지 전체 상태와
정확한 workspaceId를 읽고, 미확인 상태·권한 대기·활성 자식을 보호하며,
정확한 ID로 요청한 뒤 바로 재확인합니다. 워크스페이스만 지정했을 때 다른
임시 에이전트를 함께 선택하던 문제도 고쳤습니다. CI는 스킬 카탈로그·메타데이터,
디자인 데이터·런타임, 스킬 폴더의 PowerShell까지 검사하며, 원본 저장소 전용
테스트는 이유를 명시해 건너뜁니다. 브라우저 예제는 접근성 로케이터와 결과
대기를 사용합니다. [보완 검증 기록](docs/skill-improvements-2026-10-13.md)을 참고하세요.

[날짜별 검증 기록](docs/dependency-validation-2026-10-13.md)을 참고하세요.
아래의 과거 업데이트 기록은 당시 버전과 검증 범위를 유지합니다.

## 2026-10-11 업데이트 — `/paseo-multi` (v2.9.0)

`/paseo-multi`는 Paseo로 연결된 PC를 이름으로 선택해 상태·에이전트를
확인하고, 원격 Bash·PowerShell 명령과 여러 PC 업데이트를 수행합니다.
동작 전에 실제 서버 ID를 확인하고, 재시작 전 작업 중인 에이전트를 보호하며,
원격 명령의 종료 코드까지 확인해 완료 여부를 구분합니다. 연결 정보는 이
패키지 밖의 개인 설정에 저장합니다. 새 Desktop 연결은 별도 등록이 필요하며
자동으로 발견하지 않습니다.

Paseo 0.11.2에서 Mac과 Windows를 각각 제어 컴퓨터로 사용해 Mac·Windows
대상에 읽기 전용 명령을 실행했습니다. 실행 기록으로 재조회하고 의도한
비정상 종료 코드까지 확인했습니다. 어댑터 테스트 12개는 두 제어 컴퓨터에서
모두 통과했고, 공통 Python 테스트 49개는 macOS에서 통과했습니다. 명령 전
실행 기록 저장, Windows JSON의 UTF-8 처리, 너무 긴 Windows 명령의 사전
차단을 적용했습니다. Linux는 미검증이며 한글 캡처에는 화면 공백이 추가될
수 있습니다. [날짜별 검증 기록](docs/paseo-multi-validation.md)을 참고하세요.
아래의 기존 호환성 기록은 당시 확인 범위를 유지합니다.

이 스킬만 설치하려면:

```bash
./scripts/paseobility-init.sh --skill paseo-multi --no-context
```

```powershell
.\scripts\paseobility-install.ps1 -Skill paseo-multi
```

설치 뒤 [연결 안내](skills/paseo-multi/references/connections.md)에 따라 신뢰할
수 있는 PC 연결을 등록합니다. 설치 자체는 연결 정보를 가져오거나 PC를
조작·재시작하지 않습니다. 첫 호출 예시:

```text
/paseo-multi 등록된 PC들 상태와 작업 중인 에이전트 확인해줘.
```

## 2026-10-05 업데이트 — `/paseo-design`에 design-check (v2.8.3)

v2.8.2에서 더한 웹·앱 프론트 워크플로 `/paseo-design`을 v2.8.3에서 글 대신
증거 중심으로 다시 짰습니다.

- **프로젝트 규칙이 먼저입니다.** 저장소에 디자인 스킬·디자인 문서·토큰
  파일·UI 검사가 이미 있으면 그대로 따르고, 그 옆에 두 번째 `DESIGN.md`나
  팔레트를 만들지 않습니다.
- **`scripts/design-check.mjs`**가 주소나 HTML 파일을 375·768·1440px 폭으로
  헤드리스 크롬(Ego Lite를 먼저 쓰고, 다음으로 Chrome · Chromium · Playwright가
  내려받은 것 중 있는 것, Edge는 자동 선택하지 않음, npm 의존성 없음)에 그려
  놓고 잽니다. 넘침, 잘리거나 겹친 글자, 1px 단위의 왼쪽
  선·한 줄 컨트롤 어긋남, 들쭉날쭉한 간격, 카드 높이, WCAG 대비, 누름 크기,
  줄 끝에서 쪼개진 한글 단어, 한글 타이포그래피(글꼴 순서·자간·줄 길이),
  여백·글자 크기 가짓수, 흔한 AI 티(그라데이션·유리·왼쪽 색 막대·대문자
  꼬리표·아이콘 얹기·가운데 쌓기)에 더해 그림 비율, 키보드 초점 표시, 움직임
  줄이기 설정에서도 도는 애니메이션, 단추 안 글자 치우침, 섞인 아이콘 크기와
  단추 높이를 보고, 열린 shadow DOM 안도 잽니다. `--scheme light,dark`로 두
  테마를 함께 그립니다. 깨끗한 화면과 표시한 화면, 한눈에
  보는 판, 고치는 법이 달린 보고서(Markdown·JSON)를 남기고 오류가 남아 있으면
  exit 1입니다. `--baseline`은 옛 페이지의 기존 결함을 동결해 늘어날 때만
  막고, `--selftest`는 검사기 자체를 그 기계에서 증명합니다.
- **먼저 짜고, 그다음 잽니다.** 에이전트는 배치를 고르기 전에 화면의 일곱
  갈래 중 하나를 이름 짓고, `references/design-digest.md`(Anthropic
  frontend-design과 Hermes claude-design 요약)를 따르며, 찍힌 화면을
  `references/review-checklist.md`에 대어 보고, 오류 0을 보고한 뒤에야 UI
  작업을 끝냈다고 말합니다.
- `templates/DESIGN.md`는 `designmd lint`를 통과합니다(점 붙은 `design.md`
  실행 이름은 Windows에서 아무 일 없이 성공으로 끝나므로, 되는 형태를
  스킬에 고정했습니다). 묶어 둔 가이드는 원문과 라이선스를 그대로 두고
  (`vendor/SOURCES.md`에 원본 커밋을 적음), Vercel Web Interface Guidelines는
  오프라인 스냅샷으로 넣었습니다.
- CI가 macOS와 Windows에서 design-check 셀프테스트를 돌립니다.
- v2.8.4 : 화면 읽기 프로그램용으로만 남기고 눈에서는 숨긴 조상 안의 글자(폰에서
  숨긴 표 머리줄 같은 것)를 더는 겹친 글자로 세지 않습니다. 스킬 A/B 시험에서
  찾았고, 깨끗한 본보기에 이 경우를 넣어 묶었습니다. 아이콘 줄·번호 판·오른쪽 끝
  꼬리표·막대 안 단추·기울인 그림도 더는 정렬·카드 거짓 양성을 내지 않습니다.
- v2.8.4는 취향 규칙도 풉니다. 실제로 써 보니 금지가 지나치면 화면이 밋밋해져서,
  주제에서 콘셉트 하나를 잡고 새 화면은 세 방향을 그려 고르며, AI 티는 금지가
  아니라 습관으로 보고(`ai-*`는 경고가 아니라 참고) 밋밋함도 결함으로 봅니다.

아래 2026-09-30 CloakBrowser 기록은 이전 업데이트입니다. 더 아래 섹션은 역사
기록으로 그대로 둡니다.

## 2026-09-30 업데이트 — CloakBrowser 브라우저 기본, Paseo 0.10.2, Cua 핀 0.30.4

이 섹션은 당시 **7개 스킬** 패키지의 누적 변경을 기록합니다.

### `/paseo-browser` 기본 백엔드가 CloakBrowser로

- 기본 백엔드는 **CloakBrowser** — 고정된 `cloakbrowser` 패키지의 Playwright
  API로 감싼 stealth Chromium(`cloakbrowser@0.5.11`, `playwright-core@1.63.0`,
  Node >= 20)입니다. 일반 내비게이션, 읽기, 클릭/입력, 제한 대기, 읽기 전용 JS,
  스크린샷, 콘솔/네트워크 진단을 바로 실행할 수 있고, 레시피는 `finally`에서
  브라우저를 닫아 실패 시 누수를 막습니다.
- 고정 래퍼는 Paseobility 소유 런타임에서 동적 `import()`로 로드합니다. Paseo
  `browser_*`와 Microsoft Playwright CLI는 **선택형·명시적** 백엔드이며(각
  reference 파일에 백엔드 라벨 표기), CloakBrowser 실패 시 자동 대체하지 않습니다.
- 스킬 복사는 **문서 전용**: installer(임시 `--target-home` 포함)는 Node 패키지
  설치나 브라우저 다운로드를 하지 않습니다. 런타임은 명시적으로 설정합니다:
  런타임 디렉터리에서
  `npm install --save-exact cloakbrowser@0.5.11 playwright-core@1.63.0`,
  `CLOAKBROWSER_CACHE_DIR`는 그 안으로 한정.
- 로컬 검증(headless, 키리스 무료 바이너리): fixture 덧셈 페이지를 읽고
  `#a=7`, `#b=5`, `#compute`로 `12`를 만들었으며, 새 semantic snapshot으로
  확인하고 desktop(1280×720)·mobile(375×812) 스크린샷을 캡처했습니다. 오류
  경로(내비 실패, launch 이후 스크린샷 실패)는 0이 아닌 코드로 종료하면서도
  브라우저를 닫습니다. macOS에서 실행된 실제 바이너리는 **Chromium
  145.0.7632.109**(키리스 무료)이며, 최신 키드 빌드(macOS 151,
  Linux/Windows 152)는 **GitHub 발급 키로 1 동시 세션 무료**, 대규모는 유료이며
  이번에는 테스트하지 않았습니다.
- 한계: 외부 anti-bot/stealth 실측, headed 실행, Windows/Linux 런타임 확인은
  이번 업데이트에 없습니다. macOS만 해당.
- 현재 동작(이후 변경): 이제 JavaScript로 페이지 상태를 바꿀 수 있고, 재사용
  가능한 에이전트 로그인 프로필이 있으며, CloakBrowser가 실패하면 Paseo
  `browser_*`나 Playwright CLI로 전환하고 어떤 백엔드인지 밝힙니다.
  [`/paseo-browser`](#paseo-browser) 참고.

### Paseo 0.10.2 계약 확인(앱/소스), 라이브 데몬은 그대로

- 설치된 앱/CLI `0.10.2`는 최신 공식 `v0.10.2` 릴리스와 일치하며, 실행 중 데몬은
  **재시작하지 않았고** 여전히 `0.9.0-beta.2`를 보고합니다.
- `0.10.2`는 릴리스 노트 + 설치 앱 `app.asar`의 `TOOL_SPECS`(도구 61개,
  `profile` 인자 없는 `AGENT_FIELDS`) 계층에서 확인했으며, 새 `0.10.2` 데몬
  핸드셰이크로 확인한 것은 아닙니다. 자세한 내용은
  [`docs/compatibility-0.10.2.md`](docs/compatibility-0.10.2.md).

### Cua Driver 소스 핀 0.30.4(호스트는 0.28.2 유지)

- Paseobility updater는 이제 Cua Driver **0.30.4**(immutable commit
  `bf6c76786d938070f4ecf1e44004752f69f518b8`)를 핀하며, **호스트는 동작 중인
  0.28.2를 유지**합니다 — 동작하는 기존 드라이버는 재사용하고 자동 업그레이드하지
  않습니다.
- 소스 검토된 installer 변경은 baked 버전, 철회 릴리스 가드(`0.28.3`), autostart
  보고 수정뿐이며, `--no-modify-path` / `-NoPathUpdate`, 데몬 미시작, Windows
  스테이징/롤백 동작은 유지됩니다. 새 0.30.4 GUI 검증은 주장하지 않습니다.
- 기존 Cua preview 기록과 테스트는 그대로이며(오프라인 스위트 여전히 통과),
  없는 성공을 만들어내지 않습니다.

이번 업데이트 검증은 로컬·오프라인입니다: 스킬 frontmatter, diff 검사, 오프라인
scanner/shell 스위트, 임시 홈 단일 스킬 설치. Windows는 GitHub Actions에서
실행됩니다.

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

- 고정 소스: trycua/cua `6d6c734c127025fb39ad5d585a10382808b39dc1` 커밋
  (`cua-driver-rs-v0.36.0` 릴리스 태그), Cua Driver `0.36.0`. 이 고정값은
  소스/스키마 검토 계층이며, 아래 검증 기록에서 E2E로 실행된 마지막 버전은
  여전히 `0.28.2`입니다. 동작하는 기존 드라이버는 재사용하고 자동 업그레이드하지
  않습니다.
- 설치 스크립트는 고정 커밋에서 내려받아 임시 디렉터리에서 실행합니다
  (`curl | bash` 금지). 위임 대상인 `_install-rust.sh`, `_install-common.sh`(및
  Windows `install.ps1`, `_install-common.psm1`)도 함께 받아 롤링 URL을 실행하지
  않게 합니다.
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
  않습니다([`install.sh`](https://github.com/trycua/cua/blob/6d6c734c127025fb39ad5d585a10382808b39dc1/libs/cua-driver/scripts/install.sh),
  [`_install-rust.sh`](https://github.com/trycua/cua/blob/6d6c734c127025fb39ad5d585a10382808b39dc1/libs/cua-driver/scripts/_install-rust.sh)).
  명시적 `CUA_DRIVER_RS_VERSION=0.36.0` 고정은 installer의 baked 버전보다
  우선하며, 고정 installer는 철회된 릴리스(`0.28.3`)를 거부합니다.
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

현재 패키지는 **11개 스킬**입니다. [`/paseo-toss`](docs/paseo-toss.md)는 공식 Apps-in-Toss Harness의 기획·생성·개발·폰 테스트·출시 점검 흐름을 제공합니다. 콘솔 OAuth와 선택적 실기기 디버거 설정은 스킬 설치와 별개입니다. `/paseo-god`는 명시 호출로 실행·검증·재개하는 v0 워크플로입니다. 검증 범위는 [God 안내](docs/paseo-god.md)에 따로 기록합니다. CLI·MCP 도구 규격 호환성은 기존 6개 스킬에 대해
v2.7.0 시점에 확인했고 [호환성 보고서](docs/compatibility-0.9.0-beta.2.md)에
기록되어 있으며, 이 보고서는 **`paseo-cua`, `paseo-design`, `paseo-multi`, `paseo-god`를 포함하지 않습니다**. 6개 스킬 기록을
그 뒤에 추가된 스킬까지 검증한 것으로 해석하면 안 됩니다. `paseo-cua`는 **preview / 제한 검증**
단계로, 넓은 범위의 안정적인 Mac·Windows 지원이 아닙니다. 직접 검증된 경계는
2026-09-21 Apple Silicon macOS 26.6.2 한 대(Cua Driver 0.28.2)이고, Intel macOS와
Windows, 격리된 upstream PR 빌드에 대한 **사용자 보고** 사례는 날짜별 매트릭스와 함께
[Cua 플랫폼 검증 상태](docs/cua-platform-validation.md)에 정리되어 있습니다. 2026-09-22
기준 요약은 아래 [검증 상태](#검증-상태)를 참고하세요.

| 스킬 | 사용 범위 |
| --- | --- |
| `/paseo-god` | 명시 호출 작업 모드: 완료 조건, 필요한 절차, 검증 근거와 작업별 재개 |
| `/paseo-orchestration` | 명시 요청한 다중 에이전트 조율 또는 비교·토너먼트 |
| `/paseo-project` | 요청한 프로젝트 요약·인수인계(`.paseobility` context 갱신 포함) 또는 초기 설정·환경 수정 |
| `/paseo-browser` | 설치된 Ego Lite의 TaskSpace 하나 또는 지정한 기존 Chrome 탭 재사용. 사용자 탭 보존과 완료 정리 검증 |
| `/paseo-cua` | 작업에 네이티브 앱 GUI가 필요할 때 trycua Cua Driver로 구동 |
| [`/paseo-design`](docs/paseo-design.md) | 웹·앱 프론트: 프로젝트 규칙과 제품 근거, 작업 규모에 맞는 브리프, 렌더 화면 검수와 `design-check` 측정 오류 0 확인 |
| `/paseo-agent-cleanup` | 선택한 테스트 에이전트·workspace 정리 |
| `/paseo-multi` | 선택한 원격 PC의 상태·에이전트 확인, 명령 실행과 업데이트 |
| `/paseo-share` | 개인 기기 간 산출물 공유 |
| `/paseo-spyware-check` | 설치 전 저장소 정적 보안 검사 |

오케스트레이션과 God 모드는 `allow_implicit_invocation: false`를 유지하고, `paseo-cua`는 암시적 호출을 허용합니다.
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
- 직접 지정했거나 테스트 후 쌓인 disposable 표식이 있는 inactive agent를 archive하고, 일반 idle 세션은 보존하며 workspace는 승인 후 archive합니다.
- 작업 산출물을 private Git 공유함에 올리고 다른 컴퓨터나 모바일에서 바로 열거나 가져옵니다.
- 요청 시 repo 맥락, 명령어, 지침, 리스크를 한 장으로 요약합니다.
- 초기 설정을 요청할 때 README, docs, Claude/Codex/Cursor 계열 지침을 모아 작업 맥락을 만듭니다.
- Codex로 구현하고 Claude로 리뷰하는 식의 크로스 프로바이더 협업을 설계합니다.
- 무한 루프, 위험한 제출, 계정 변경 같은 작업에는 명확한 가드레일을 둡니다.

---

## 들어있는 스킬

| Skill | 역할 | 이런 요청에 강함 |
| --- | --- | --- |
| `/paseo-god` | 명시 호출 실행·검증·재개 | 완료 조건, 디버깅·리뷰·실험, 작업별 기록과 학습 후보 제안 |
| `/paseo-browser` | 설치된 Ego Lite의 TaskSpace 하나 또는 지정한 기존 Chrome 탭 재사용. 사용자 탭 보존과 완료 정리 검증 |
| `/paseo-cua` | 네이티브 데스크톱 GUI 구동 | trycua Cua Driver로 앱 창 조작·스냅샷·검증, 작업에 네이티브 앱 GUI가 필요할 때 동작 |
| `/paseo-orchestration` | 다중 에이전트 조율과 비교 | 명시 요청한 조율 또는 토너먼트, 모드별 지침 |
| `/paseo-project` | 프로젝트 요약과 설정 | 요청한 brief(없거나 오래된 `.paseobility` context 작성·갱신) 또는 환경·context 설정 |
| `/paseo-multi` | 연결된 PC 조작 | 이름 또는 `all`(등록된 모든 호스트를 병렬로)로 대상 선택, 원격 상태·에이전트 확인, 인라인·파일 Bash·PowerShell 실행(`exec --command`, `--wait` 최대 300초), 업데이트 검증, 즉시 재시작을 요청했을 때만 `restart --force`, `import-saved`는 병합 |
| `/paseo-design` | 웹·앱 프론트 워크플로 | 프로젝트 디자인 규칙, 기존 컴포넌트 활용과 화면 검토 |
| `/paseo-share` | 컴퓨터·모바일 산출물 공유 | private `paseo_share` 자동 준비, 50 MiB 이하 모든 파일 형식(한 번에 여러 개 게시 가능), 클릭 가능한 미리보기/다운로드 링크, 공유 ID 기반 검증·가져오기 |
| `/paseo-spyware-check` | 설치 전 보안/스파이웨어 정적 점검 | GitHub URL, 로컬 repo, install script, secret, exfiltration, supply-chain 위험 확인 |
| `/paseo-agent-cleanup` | 비활성 agent/workspace 정리 | 기본은 미리보기, 일반 idle 보존, 지정했거나 테스트 표식이 있는 후보는 바로 archive, 활성 agent 보호, workspace는 `--yes`가 있을 때만 archive |

---

`/paseo-toss 기획부터 토스 미니앱을 만들어줘`로 시작할 수 있습니다. 단일 설치는 `./scripts/paseobility-init.sh --skill paseo-toss --no-context`를 사용합니다.

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
현재 패키지 호환성 기준선은 Paseo **0.10.2**이며, 재검증 기록은
[`docs/compatibility-0.10.2.md`](docs/compatibility-0.10.2.md)입니다.

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
[호환성 보고서](docs/compatibility-0.9.0-beta.2.md), 현재 기준선 재검증 기록
[docs/compatibility-0.10.2.md](docs/compatibility-0.10.2.md)를 참고하세요. 아래는
이전 버전에 기록된 검증이며 현재 버전의 증거로 사용하지 않습니다.

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
- scanner가 없고 추가 커버리지가 가치 있으면 에이전트가 포함된 installer로 직접 설치하고 무엇을 설치했는지 알려줍니다(`--dry-run`으로 계획 확인 가능).
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
- ID나 패턴으로 직접 지정한 agent는 바로 archive합니다(`--archive`, `--yes` 불필요). workspace archive는 명시적 ID와 `--yes`가 필요합니다.
- archive 응답의 대상 ID와 상태를 확인하고 active 목록에서 사라졌는지 재조회합니다.

---

## `/paseo-share`

50 MiB 이하의 모든 형식 파일을 전용 private Git 저장소에 불변 artifact로 게시합니다. GitHub Actions나 background daemon 없이 각 컴퓨터에서 로컬 `git fetch`, `rebase`, `commit`, `push`만 실행합니다.

- `onboard`: GitHub 인증 확인 후 `<login>/paseo_share` private 저장소 생성 또는 안전한 재사용
- `setup`: 컴퓨터별 machine name과 동일한 원격 저장소 설정
- `publish`: 파일 하나 이상을 한 commit으로 게시하고 각각의 공유 ID, 미리보기 URL, 다운로드 URL 반환
- `list` / `latest`: 원격 동기화 후 다른 컴퓨터 산출물 조회
- `fetch`: 공유 ID 또는 `latest`를 현재 컴퓨터로 검증 후 복사. 같은 내용의 기존 파일은 재사용하고, 다른 파일이 있으면 그대로 두고 `name (2).ext`로 저장합니다(`--force`는 교체를 요청했을 때만 덮어씀)

Artifact는 `artifacts/<machine>/<year>/<month>/<artifact-id>/` 아래 저장됩니다. 50 MiB 이하라면 파일 형식은 제한하지 않으며(폴더는 먼저 zip), secret-looking 파일명(`.env`, `*.pem`, `*.key`, SSH 키, `credentials`, `secrets`)과 private key·access token 서명이 든 텍스트 내용은 거부합니다. 가져올 때 metadata 스키마, 경로 containment, symlink, 파일 크기, SHA-256을 검사하고, 손상된 항목은 경고와 함께 건너뛰며, Windows CRLF와 macOS/Linux LF 변환을 안전하게 처리합니다. push가 실패하면(오프라인, 인증, hook) commit은 관리 clone에 남고 다음 `list`, `latest`, `fetch`, `publish`가 자동으로 push합니다. 재시도하려고 같은 파일을 다시 게시하지 않습니다.

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

- **요약 모드:** 요청한 repo 개요·명령·인수인계를 정리하고, `.paseobility/` context가 없거나 오래됐으면 작성·갱신합니다.
- **설정 모드:** 요청한 초기 설정·환경 수정·context 생성만 수행합니다.
- 이미 확인한 정보를 재사용하고 같은 문서를 다시 전부 조사하지 않습니다.
- Paseo runtime이 관련될 때만 버전·daemon·workspace를 조회합니다. 경로
  별칭 때문에 `--cwd` 조회가 실패하면 기존 workspace ID를 사용합니다.
- 요약에서는 의존성을 설치하거나 서버를 띄우지 않습니다. `.paseobility/`는 로컬 상태이며, repo가 무시하지 않으면 `.gitignore`가 아니라 `.git/info/exclude`에 추가합니다.

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

- 설치된 Paseo 클라이언트로 읽은 전체 agent·workspace 스냅샷 (daemon이 지원하면 백그라운드 워크스페이스 포함)
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
- agent archive(소프트 삭제)는 `--archive`만으로 실행하고, workspace archive는 명시적 ID와 `--archive --yes`가 필요합니다.

포함된 helper:

```bash
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run --pattern 'cleanup-validation|fixture'
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --agent <agent-id> --archive
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto --agent <agent-id>
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto --pattern 'cleanup-validation|fixture'
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --workspace <workspace-id> --archive --yes
```

---

## `/paseo-browser`

Ego Lite가 설치되어 있으면 **TaskSpace 하나 → 기본 탭 `p1` 재사용 → 완료 정리**가 기본입니다.
`ego-browser skill`로 설치 버전의 API 안내를 읽습니다. 여러 실행 간 재사용,
완료 결과 확인, 제어권 전환과 Windows 명령 형식은 [Ego 참조](skills/paseo-browser/references/ego.md)를 따릅니다.
Ego에 Chrome 도우미를 적용하지 않습니다. 오류가 나면 같은 공간을 복구하며 새 공간을 만들거나 브라우저를 자동 전환하지 않습니다.

Chrome을 지정했거나 Ego가 없으면 **현재 실행 중인 Chrome 창에 작업용 탭 하나 추가 → 재사용 → 그 탭만 종료**합니다.
macOS의 `scripts/chrome-tabs.py`가 기존 창 ID를 지정해 탭을 만들고, 생성한 탭 ID와 Chrome 실행 식별자를 기록합니다. 생성 응답이 유실돼도 같은 작업 ID로 복구하며 새 창이나 중복 탭을 만들지 않습니다. 작업 후 종료 결과를 다시 확인합니다.

```bash
python3 ~/.agents/skills/paseo-browser/scripts/chrome-tabs.py list
python3 ~/.agents/skills/paseo-browser/scripts/chrome-tabs.py open --task '<고유-작업-ID>' --window '<기존-창-ID>' --url 'https://example.com/'
# 반환된 tabId를 설치된 Chrome 연동 도구로 바인딩해 작업합니다.
python3 ~/.agents/skills/paseo-browser/scripts/chrome-tabs.py close --task '<고유-작업-ID>'
```

사용자 탭·로그인·다른 에이전트의 탭은 보존합니다. provider 강제 종료 시에는 다음 실행에서 기록을 확인해 정리해야 합니다. macOS 이외의 기존 창 어댑터는 아직 검증하지 않았으며, 연결 실패를 새 브라우저 실행으로 대체하지 않습니다.

격리·headless 작업을 요청했거나 `paseo-design` 검증처럼 별도 워크플로우가 요구할 때만 CloakBrowser, Paseo workspace 브라우저 또는 Playwright CLI를 사용합니다. 설치만으로 브라우저나 데몬을 실행하지 않습니다.

자세한 실행 계약과 반복 검증은 [스킬](skills/paseo-browser/SKILL.md)과 [Chrome 참조](skills/paseo-browser/references/chrome.md), 격리 실행은 [CloakBrowser](skills/paseo-browser/references/cloakbrowser.md)와 [Playwright CLI](skills/paseo-browser/references/playwright.md)를 참고하세요.

---

## `/paseo-cua`

trycua Cua Driver(`cua-driver` CLI 또는 MCP)로 네이티브 데스크톱 GUI를 구동합니다.
사용자가 네이티브 앱 조작을 요청하거나 데스크톱 앱 GUI로만 할 수 있는 작업일 때
쓰며, 같은 결과를 내는 CLI·API·파일 수정이 있으면 그쪽을 우선합니다. **preview / 제한 검증** 단계입니다 — [Cua 플랫폼 검증 상태](docs/cua-platform-validation.md) 참고.

- 사전조건: `cua-driver --version`. 없으면 GUI가 아닌 경로가 있을 때 그쪽을 쓰고,
  없으면 설치 명령을 안내하며 요청하면 직접 실행합니다. macOS Accessibility·Screen
  Recording 권한은 사람이 부여합니다.
- 설치된 계약을 먼저 읽습니다: `cua-driver list-tools`, `cua-driver describe <tool>`.
- `cua-driver mcp-config --client opencode`는 config 스니펫만 출력하며 서버를
  등록하지 않습니다.
- 핵심 루프: 창 찾기·앱 실행 -> snapshot -> 액션(UI가 바뀌지 않는 동안 한 스냅샷에서
  여러 액션 연결 가능) -> 새로 읽어 검증.
- 기본은 백그라운드 전달이며, 액션이 반영되지 않으면 `delivery_mode: "foreground"`로
  전환하고 그 사실을 알립니다.
- 작업 범위 안에서는 자유롭게 진행하고, 결제, 되돌릴 수 없는 삭제, 계정 보안 변경,
  요청하지 않은 발송·게시 전에는 먼저 묻습니다.

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
- 실패하면 접근을 바꿔 재시도하거나 다른 profile/provider에 다시 맡기고, 같은 원인으로 반복 실패하면 멈추고 보고합니다.
- 작업 범위 안의 워커 권한 요청은 승인합니다. push, 공유 브랜치 merge, 배포, 게시, 비용 지출, 되돌릴 수 없는 삭제 전에는 먼저 묻습니다.
- 끝나면 워크플로가 만든 agent와 workspace를 archive합니다. 통합하지 않은 작업이 있거나 사용자가 남기길 원하면 예외입니다.

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
├── paseo-browser/            # SKILL.md + references (cloakbrowser, paseo, playwright, screenshots)
├── paseo-cua/                # SKILL.md + implicit-invocation policy
│   └── references/           # setup.md, workflow.md, recovery.md
├── paseo-design/             # SKILL.md + references, templates, scripts/design-check.mjs, vendored guides
├── paseo-god/                # SKILL.md + explicit-only policy, procedures, run helper/tests
├── paseo-multi/              # SKILL.md + host adapter/tests + references
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
docs/compatibility-0.12.0.md         # 정적 확인(0.12.0)
docs/compatibility-0.10.2.md
docs/compatibility-0.9.0-beta.2.md   # 과거 기록(0.9.0-beta.2)
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
