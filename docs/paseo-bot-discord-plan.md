# Paseo 봇 × Discord 통합 계획 (초안)

작성: 2026-11-03 · 기준 코드: `origin/main` 5543713 (VAX_COM 실서버 `paseo-bot-runtime` a6b063d, v2.12.8)
상태: 계획 단계. 이 문서의 어떤 변경도 아직 적용되지 않았어요.

## 0. 목표와 비목표

**목표**
- Discord를 Paseo 봇의 주 대화창으로 만들어요. 대화, 계획 승인, 진행 알림, 결과를 한 쓰레드에서 처리해요.
- Grok 봇 연결 잔재를 순서대로 제거해요.
- Dori와 Hermes Agent의 장점을 Paseo 봇에 흡수하고, Dori는 은퇴시켜요.

**비목표**
- 컨테이너나 원격 샌드박스 실행 백엔드(Hermes의 docker/modal 등). 실제 기기 4대에서 그대로 실행해요.
- 음성 채널, TTS.
- 공개 다중 사용자 봇. 사용자는 owner 한 명이에요.

## 1. 현재 상태 요약

| 구성 | 지금 | 비고 |
|---|---|---|
| Paseo 봇 큐 러너 | VAX_COM, `PaseoBotGuardian` 서비스, 5초 tick | 기기당 작업 1개, 23개 프로젝트(19개 활성) |
| GUI v2 관리자 | Codex gpt-6.1-sol, `mode` 미설정이라 **full-access** | 질문 답변과 계획 제안, **접수** 버튼을 눌러야 실행 |
| 접수 경로 | SSH CLI `submit`(`--producer cli\|grok`), GUI 플러그인 | 인바운드 HTTP 없음 |
| 알림 | 결과 outbox 파일, GUI 폴링, **Grok webhook**(모든 작업 결과를 xAI 쪽 Grok 루틴으로 POST) | 메신저 연동 없음 |
| Dori | 맥미니, Discord 게이트웨이와 herdr 작업, 워커 Claude/Codex/Go/omo, 원격 `remote-worker` | Paseo 봇과 기기 배정이 중복돼요 |

## 2. 목표 아키텍처

```
Discord (owner 전용 채널)
  │ Gateway WebSocket + REST (봇 토큰은 Bitwarden에 두고 실행할 때만 읽음)
  ▼
discord_gateway  [새로 만듦, VAX_COM, Guardian supervisor의 3번째 서비스]
  ├ 허용 범위 검사(owner/guild/channel/쓰레드), 중복 제거, 전달 큐
  ├ 쓰레드 ↔ 관리자 대화(gui_state conversation) 1:1
  ├ 버튼: 계획 접수/거절, 권한 승인/거절, 학습 제안 승인
  └ 이벤트 구독: 작업 상태 변화 → 해당 쓰레드에 게시
  ▼ (같은 기기, 로컬 호출, SSH 없음)
gui_state / gui_api   [기존] 관리자 대화, 계획, 승인
paseo_bot serve        [기존 + 확장] 큐, 라우팅, 단계 실행, 검증, PR
  ├ Kanban 상태 머신, lease/heartbeat, 의존성, 유형별 blocked   (Hermes)
  ├ 진행 감시(무응답 nudge), 기기 상태 확인, pause/resume       (Dori)
  └ 이벤트 로그 → discord_gateway가 구독 (webhook 대체)
memory / skills / search [새로 만듦] 프로젝트별 메모리, 학습 제안, FTS5 검색 (Hermes)
```

**기술 선택**
- **게이트웨이 언어는 Node(ESM)로, 외부 의존성 없이 만들어요.** 내장 `WebSocket`과 `fetch`를 써요(Node 22 이상 필요). Paseo 봇의 "새 npm/pip 런타임 의존성 없음" 원칙과 맞고, `bridge.mjs`, `manager_bridge.mjs`와 같은 언어예요.
- **이벤트 전달:** webhook처럼 HTTP 콜백을 쓰지 않아요. 큐 DB에 `events` 테이블(append-only)을 두고 게이트웨이가 커서로 읽어요. 재시작해도 커서부터 이어서 읽으니 중복이나 유실이 없어요.
- **비밀 저장:** 기존 Bitwarden 브로커(`gateOFbabylon`)와 `sdk_secrets.py`, `secret_store.py`를 범용으로 남겨요. 항목 이름만 `paseo-bot-discord-token`으로 바꿔요.

## 3. 흡수할 기능

### 3.1 Dori에서

| ID | 기능 | Paseo 봇 구현 위치 | 단계 |
|---|---|---|---|
| D1 | 허용 범위 정책: owner, guild, channel, 확인된 하위 쓰레드만 처리. 봇 메시지 무시. 실패하면 닫힌 상태 유지. 단위 테스트 포함 | `discord_gateway/policy` (Dori `bridge/policy.ts`와 테스트 이식) | P2 |
| D2 | 최상위 메시지마다 쓰레드 생성, 같은 쓰레드는 같은 대화로 이어짐. 이벤트 `.seen` 중복 제거, 전달 상태(`dispatching`/`needs-review`), 맹목적 재시도 금지 | 게이트웨이 전달 큐(SQLite) | P2 |
| D3 | 완료 증거 규약: 증거가 실시간으로 다시 확인될 때만 완료 처리(PR merge, 체크 통과, 파일 JSON 조건) | 작업 `doneContract` 필드, 단계 끝 검증 | P3 |
| D4 | 실시간 관찰: herdr pane 대신 Paseo 앱 에이전트 링크와 `/peek`(에이전트 로그 끝부분) | 슬래시 명령 | P3 |
| D5 | 작업별 pause/resume. 멈춤이 확인될 때만 paused로 기록하고, 확인 못 하면 `PAUSE_UNVERIFIED` | `agent stop` + 상태 확인 + `send`로 재개 | P3 |
| D6 | 무응답 감시: 10/20/40분 nudge, 마지막 보고를 쓰레드에 게시 | 큐 러너 tick (H 시리즈 watchdog과 통합) | P6 |
| D7 | 기기 상태 확인: 부하, 메모리, 디스크를 dispatch 전에 확인하고, 넘으면 대기 | `ps-multi health` 결과 캐시 | P6 |
| D8 | 승인 대기 알림: 2분 넘게 blocked면 알림. 이번엔 **버튼으로 바로 승인/거절**(Paseo `permit allow/deny`) | 게이트웨이 | P4 |
| D9 | 워커 선택 폭: omo(오래 끝까지 밀어붙이는 작업) 프로필 추가 검토 | 기기별 프로필 | P6 (선택) |

### 3.2 Hermes Agent에서 (NousResearch/hermes-agent v0.22.6)

| ID | 기능 | 적용 방식 | 단계 |
|---|---|---|---|
| H1 | **Kanban 상태 머신**: triage, todo, ready, running, blocked, review, done, archived. lease와 heartbeat를 두고, 죽은 워커의 작업은 다시 큐로. 부모→자식 의존성. 유형별 blocked(dependency, needs_input, capability, transient). 반복 blocked는 triage로 올림. rate-limit은 실패로 세지 않고 다시 큐로 | 큐 스키마 확장, 기존 phase는 running 안의 세부 단계로 | P3 |
| H2 | **승인 버튼**: 300초 안에 답이 없으면 거절. 1회, 세션, 항상 승인 중 선택. "항상"은 허용 목록 **제안만** 하고 자동 적용하지 않음. 무조건 막는 명령 목록(`rm -rf /`, fork bomb 등) | 게이트웨이 + 워커 지침 + 위험 명령 패턴 | P4 |
| H3 | **메모리**: 전역 `USER.md`(약 1.4KB)와 프로젝트별 `MEMORY.md`(약 2.2KB) 용량 제한. 넘치면 압축을 강제. 관리자가 정리하고, 쓰기 전에 인젝션 검사 | `~/.config/paseo-bot/memory/`, 관리자 프롬프트에 주입 | P5 |
| H4 | **학습 제안**: 작업이 끝나면 AGENTS.md나 스킬 수정안을 diff로 제안하고, owner가 버튼으로 승인. 조용히 스스로 고치지 않음 | 작업 후 단계 + 버튼 | P5 |
| H5 | **세션 검색**: 작업 대화, 결과, 실패 사유를 SQLite FTS5에 넣고, 관리자가 "전에 해 봤나?"를 검색 | `search.sqlite3` + 관리자 도구 | P5 |
| H6 | **예약 작업**: 실행 전 스크립트가 `wakeAgent:false`를 주면 토큰을 쓰지 않음. `[SILENT]`면 전달 안 함, 실패는 항상 전달. 에이전트가 스스로 예약을 만들지 못함 | `cron.json` + 러너 tick | P6 |
| H7 | **보조 작업 모델 분리**: 분류와 요약은 저렴한 모델(go / luna-fast), 관리자와 작업은 강한 모델 | 관리자 설정 | P5 |
| H8 | **작업 중 들어온 메시지 처리**: 끼어들기, 대기열, 방향 수정 중 선택 | 게이트웨이 정책(기본: 대기열 + "방향 수정" 버튼) | P2 |
| H9 | **첨부**: 텍스트 100KiB 이하는 프롬프트에, 그보다 크면 파일로 저장해 경로 전달(최대 32MiB) | 게이트웨이 | P2 |
| H10 | **이벤트 구독**: 작업을 만든 쓰레드가 완료, blocked, crash 이벤트를 받음 | `events` 테이블 + 커서 | P2 |
| H11 | **하위 에이전트 감시**: 450초 무활동, 도구 안에서 1200초면 stall로 표시 | D6과 통합 | P6 |

**가져오지 않는 것:** 실행 백엔드(docker/modal/ssh 샌드박스), 음성, 수십 개 제공자 자동 전환(이미 sol→claude→go 대체 경로가 있음).

### 3.3 프로젝트와 모델 자동 선택

슬래시 명령(`/task project:<이름> model:<sol|claude|go> machine:<기기>`)으로 직접 고를 수 있고, 지정하지 않으면 관리자가 자동으로 고른 뒤 **계획 카드에 무엇을 왜 골랐는지 표시**해요. 접수 버튼을 누르기 전에 select 메뉴로 바꿀 수 있어요.

**프로젝트 찾기** (위에서부터 먼저 맞는 것)
1. 명시: 슬래시 명령 인자, 메시지에 적힌 프로젝트 ID나 별칭.
2. 쓰레드 문맥: 같은 쓰레드에서 이미 정한 프로젝트.
3. 등록부 매칭: `projects.json`의 ID, 이름, 경로, 원격 저장소 이름, 도메인(예: `shop.example.com` → `example_shop`). 각 프로젝트에 `aliases`와 `keywords`(도메인, 서비스 이름, 한글 이름)를 추가해요.
4. 기억과 검색: 프로젝트별 `MEMORY.md` 요약(H3)과 지난 작업 FTS5 검색(H5)으로 "이 증상은 어느 프로젝트였나"를 찾아요.
5. 그래도 둘 이상이거나 확신이 낮으면 **묻기**: 후보 2~4개를 select 메뉴로 보여 줘요(Hermes `clarify` 방식). 추측해서 실행하지 않아요.

**모델 고르기**
- 기본은 기존 라우팅을 써요. 작업 종류는 키워드 규칙, 모델은 `auto`(daily → sol, hard → claude, sync → go)예요.
- 관리자가 작업 성격을 판단해서 `kind`, `model`, `effort`와 그 이유(`modelReason` 필드, 이미 있음)를 계획에 채워요. 예를 들면 이렇게요.
  - 어려운 버그나 설계 → claude
  - 대량 리팩터링이나 간단한 수정 → go
  - 그 밖의 구현 → sol
- 쿼터 소진이나 모델을 쓸 수 없을 때는 기존 대체 경로(sol→claude→go)를 그대로 써요.
- 분류와 요약 같은 보조 작업은 저렴한 모델(H7)로 해요.

**기기 고르기:** 프로젝트 target의 기기를 쓰고, 여러 개면 기존 "가장 덜 바쁜 기기" 규칙을 따라요.

**역할 분리:** 관리자 에이전트는 **읽기 전용**이에요. 질문에 답하고, 코드를 읽고, 계획을 만들기만 해요. 실제 코드 변경, 빌드, 테스트, PR은 접수 뒤 Paseo 봇이 대상 기기에 띄우는 **작업 에이전트**가 해요.

## 4. Grok 봇 잔재 제거 계획

조사 결과, 이 webhook은 **Grok 작업만이 아니라 모든 작업(GUI `plan-*` 포함)의 결과를 xAI 쪽 Grok 루틴으로 보내고 있어요**(10건 전달 완료). 결과 outbox와 GUI의 PR 링크(`record.prUrl`)는 webhook과 별개라서 제거해도 깨지지 않아요.

| 순서 | 작업 | 위치 | 비고 |
|---|---|---|---|
| R0 | **실서버 webhook 끄기**: `config\webhook.json` 삭제(또는 `enabled=false`) | VAX_COM | 코드 변경 없이 즉시 외부 전송이 멈춰요. 가장 먼저 |
| R1 | 코드 제거 PR | `webhook_queue.py`, `webhook_delivery.py`, `requirements-webhook.txt`, `WEBHOOK.md`, `tests/test_paseo_webhook.py` 삭제. `paseo_bot.py`의 import, 테이블 초기화, enqueue, drain, `health.webhook`, `status.webhooks` 제거(`heartbeat()` 호출은 유지). `TEST_ID`의 `^grok-` 제거. `task.example.json` id 변경 | 기존 `webhook_jobs` 테이블은 DB에 그대로 둬요(무해) |
| R1 | `--producer grok` | `paseo_bot.py:1038,1062`, `paseo-bot.ps1:12,47` | `cli`만 남기고, 대신 `discord` producer를 추가해요 |
| R1 | 작업 필드 `pr_url`, `requester` | `paseo_bot.py:409,418` | P1에서는 **그대로 둬요**(GUI 출처 표시가 origin의 `requester`를 씀). 이후 정리 |
| R1 | GUI "Grok 봇" 배지와 필터 | `plugin/shared/model.ts:62`, `colors.ts:53`, `client/board.tsx:296`, 테스트 2곳 | 기존 `requester='grok'` 기록은 "이전 작업"으로 표시 |
| R1 | 비밀 어댑터 범용화 | `sdk_secrets.py`(`SECRET_NAME='paseo-bot-grok-webhook'`), `secret_store.py` | **삭제하지 않고** 항목 이름을 인자로 받게 바꿔서 Discord 토큰에 재사용 |
| R1 | 문서 | `docs/paseo-bot.md`(12-14, 143-169, 184-187, 199-200, 410), `docs/paseo-bot-gui-v2.md:118-131`, `README*.md:21` | 모델로서의 Grok 언급(README 119-120 등, `x.ai.md`)은 유지 |
| R2 | 실서버 재배포 | `paseo-bot-runtime` | 정상 배포 절차로 |
| R3 | 실서버 정리 | `webhook-stage-20261027`, `webhook-verify-20261027`, `paseo-webhook-runtime-20261027.bundle` 삭제. 예전 `bot\runtime`은 결정 필요. `results\grok-*.json`과 큐 기록은 이력으로 보관 | `sdk-venv`는 Discord 토큰 읽기에 재사용하니 **유지** |
| R4 | owner만 할 수 있는 일 | Bitwarden 항목 `paseo-bot-grok-webhook` 삭제, xAI 쪽 Grok 루틴과 키 폐기, Grok 쪽 SSH 호출자 정리 | `gateOFbabylon` 브로커 자체는 유지 |

## 5. 단계와 완료 기준

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **P0 결정** | §8의 결정 사항 확정, 봇 토큰을 Bitwarden에 등록(owner) | 결정 기록, 토큰 항목이 존재함(값은 확인하지 않음) |
| **P1 Grok 정리** | R0 → R1 → R2 → R3, R4 안내 | 실서버 `health`에 webhook 키 없음, 전체 테스트 통과, xAI로 나가는 전송 0건 |
| **P2 Discord MVP** | 게이트웨이, D1·D2·H8·H9·H10, 쓰레드↔대화, 관리자 답변, 계획 접수/거절 버튼, 단계 알림, 결과 게시, `/status` `/queue` | 실제 E2E: ① 질문 답변 ② 계획→접수→테스트 프로젝트 실행→결과와 PR 링크 게시 ③ 거절 ④ 다른 사용자, 다른 채널, 봇 메시지 무시 ⑤ 게이트웨이를 재시작해도 중복 게시 0건 ⑥ 버튼을 3초 안에 확인 응답 |
| **P3 작업 관리** | H1 Kanban, D3 완료 규약, D4 `/peek`, D5 `/pause` `/resume`, `/cancel` | 상태 전이 테스트, lease 만료 후 재큐, 의존 작업 순서 E2E, pause 확인 |
| **P4 승인과 안전** | D8·H2 권한 버튼(300초 후 거절), 무조건 차단 목록, 관리자를 읽기 전용 모드로 | 권한 요청→버튼→허용/거절이 실제 반영, 시간 초과 시 거절, 차단 명령 거부 테스트 |
| **P5 기억과 학습** | H3 메모리, H4 학습 제안, H5 FTS5 검색, H7 보조 모델 | 메모리 용량 제한과 인젝션 검사 테스트, 학습 제안 승인 흐름, "전에 해 봤나" 검색 정확도 확인 |
| **P6 자동 관리** | H6 예약 작업, D6·H11 감시, D7 기기 상태, 일일 요약(선택), D9 omo(선택) | script gate로 토큰 0 확인, 무응답 작업 nudge E2E, 부하가 높을 때 dispatch 보류 |
| **P7 전환** | Dori 수신 끄기, 같은 봇과 채널을 Paseo 봇으로, 1주 병행 관찰 후 Dori 보관 처리 | Dori 프로세스 중지, Paseo 봇만 응답, 롤백 절차 문서화 |

권장 순서는 P1과 P2를 먼저 해서 실제로 쓸 수 있게 만들고, P3~P6은 쓰면서 우선순위를 다시 보는 거예요.

## 6. 보안 모델

- **입장 경계:** Discord owner ID, guild, channel allowlist와 봇 토큰(Bitwarden)이에요. SSH가 필요 없는 로컬 호출이지만, 게이트웨이가 받아들일 수 있는 동작은 정해진 `gui_api` 동작(start/send/approve/reject/status)으로 제한해요.
- **관리자:** 읽기 전용 모드로 내려요. Discord 텍스트가 곧 관리자의 입력이기 때문이에요. 실행은 접수 버튼을 거친 작업 워커만 해요.
- **워커:** 지금처럼 full-access를 쓰되, H2의 무조건 차단 목록과 비밀 마스킹을 적용해요. 기본 브랜치 merge, 배포, 결제는 owner가 그 작업을 쓰레드에서 직접 요청할 때만 해요.
- **비밀:** 토큰과 키를 Discord, 로그, outbox에 내보내지 않아요. 게시 전에 알려진 패턴을 마스킹해요.
- **멱등성:** 작업 ID는 Discord 메시지 ID에서 만들고, 버튼 `custom_id`는 `plan:<id>:approve` 형식으로 상태를 담아요.

## 7. 리스크

- **Claude 사용량:** `claude` 모델(Opus 5.5)은 Claude 구독 사용량을 써요.
- **문서와 코드 불일치:** `docs/paseo-bot.md`의 작업 형식이 예전 버전이고, `git-sync` 프로필이 실제로 쓰이는지 확인이 필요해요(P1에서 정리).
- **VAX_COM 단일 장애점:** 게이트웨이와 러너가 모두 VAX_COM에 있어요. Guardian이 재시작해 주지만, 기기 자체가 꺼지면 멈춰요. 맥으로 옮기는 절차는 문서에 있어요(ownership handoff).
- **Hermes 참고 정보:** 일부는 페이지 요약 도구로 확인해서 세부 내용이 빠졌을 수 있어요(승인 버튼 라벨, 저렴한 모델 자동 라우팅 여부).

## 8. 결정 사항 (기본값 제안)

| 항목 | 결정 (2026-11-03) |
|---|---|
| 게이트웨이 위치 | VAX_COM (Paseo 봇과 같은 기기, Guardian 감독) |
| 실행 승인 | 접수 버튼 유지 |
| Discord 봇과 채널 | Dori가 쓰던 봇과 채널 재사용(토큰을 Bitwarden으로 옮김) |
| 관리자 모델과 모드 | Codex gpt-6.1-sol, 읽기 전용. 실제 작업은 Paseo 봇 작업 에이전트 |
| 프로젝트와 모델 선택 | 슬래시 명령으로 직접 지정할 수 있고, 지정하지 않으면 자동(§3.3) |
| `pr_url`/`requester` 필드 | P1에서는 유지 |
| 예전 `bot\runtime` 폴더 | 백업 후 삭제 |
| 구현 방식 | Claude가 지시서 작성 → opencode(`opencode-go/deepseek-v4.1-flash`) 구현 → Claude 검수와 커밋 |
