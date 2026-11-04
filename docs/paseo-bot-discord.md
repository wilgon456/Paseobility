# Paseo 봇 × Discord 게이트웨이

Paseo 봇을 Discord의 **owner 전용 채널 하나**에 연결하는 상주 서비스예요.
채널의 최상위 메시지마다 쓰레드를 열고, 그 쓰레드를 GUI 관리자 대화 하나에
묶어요. 관리자 답변, 계획 카드(접수/거절 버튼), 작업 단계 알림과 PR 링크가
모두 그 쓰레드에 나타나요. 설계 배경은
[Discord 통합 계획](paseo-bot-discord-plan.md)을 봐 주세요.

구성은 세 부분이에요.

```
Discord  ──Gateway WebSocket + REST──  discord_gateway.mjs (Node 22+, 의존성 0)
   ▲                                          │ HTTP 없음, stdin으로 토큰 1회
   │                                          ▼
   └── 쓰레드 · 버튼 · 슬래시 명령 ──  discord_serve.py (Python, supervisor 서비스)
                                              │ 같은 기기의 로컬 호출
                                              ▼
                                     gui_api.py / gui_state.py (기존 관리자 대화)
```

브라우저나 인바운드 HTTP 수신기는 없어요. 게이트웨이가 Discord로 나가는
WebSocket과 REST만 열고, Paseo 쪽으로는 `gui_api.py`를 자식 프로세스로
실행해 요청을 전달해요.

## 1. Discord 앱 준비

1. Discord Developer Portal에서 봇을 만들고 **Bot** 탭에서 토큰을 확인해요.
   토큰은 이 저장소나 설정 파일에 적지 않고 3절의 비밀 저장소에 넣어요.
2. **Bot → Privileged Gateway Intents**에서 `MESSAGE CONTENT INTENT`를 켜요.
   (Guilds와 Guild Messages는 기본 intent예요.)
3. 봇을 서버에 초대할 때 아래 권한만 줘요.

| 권한 | 비트 | 값 |
|---|---|---|
| View Channel | `1 << 10` | 1024 |
| Send Messages | `1 << 11` | 2048 |
| Read Message History | `1 << 16` | 65536 |
| Create Public Threads | `1 << 35` | 34359738368 |
| Send Messages in Threads | `1 << 38` | 274877906944 |

합계 **309237713920**이에요. 관리자(Administrator) 권한은 필요 없고 주지
마세요.

권장 초대 URL 형태:

```
https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=bot&permissions=309237713920
```

intent 값은 `GUILDS(1) | GUILD_MESSAGES(512) | MESSAGE_CONTENT(32768)` =
**33281**이고 게이트웨이가 고정으로 보내요.

## 2. `discord.json`

`<state>/discord.json`은 **소유자만 읽을 수 있는 파일(0600)** 이어야 해요.
그보다 넓으면 서비스가 설정을 거부하고 자식을 시작하지 않아요.

```json
{
  "version": 1,
  "enabled": true,
  "guildId": "111111111111111111",
  "channelId": "222222222222222222",
  "ownerIds": ["333333333333333333"],
  "python": "/home/me/.local/share/paseo-bot/sdk-venv/bin/python",
  "secretName": "paseo-bot-discord-token",
  "node": "node"
}
```

| 필드 | 의미 |
|---|---|
| `version` | 항상 `1` |
| `enabled` | `false`면 서비스는 계속 살아 있지만 아무 것도 시작하지 않아요 |
| `guildId`, `channelId` | Discord snowflake(`^\d{16,22}$`) |
| `ownerIds` | 명령과 메시지를 허용할 사용자 ID 목록. 비어 있으면 거부 |
| `python` | **sdk-venv** 인터프리터. 비밀 저장소(`secret_store.py`)를 실행할 때만 써요 |
| `secretName` | 선택. Bitwarden 항목 이름(기본 `paseo-bot-discord-token`) |
| `node` | 선택. Node 실행 파일(기본 `node`) |

`python`은 Paseo 봇의 주 인터프리터가 아니라 Bitwarden SDK가 설치된
sdk-venv를 가리켜요. 게이트웨이가 `gui_api.py`를 부를 때는 서비스 자신의
인터프리터(`PASEO_BOT_PYTHON`)를 써요.

설정 파일에 모르는 필드가 있거나 ID 형식이 틀리면 **닫힌 상태(fail closed)** 로
동작해요. 채널이나 서버가 바뀌면 파일을 고치고 게이트웨이 자식만 재시작하면
돼요(서비스는 다음 tick에 새 설정을 읽어요).

## 3. 토큰 저장

토큰은 stdin으로만 들어가요. 셸 기록에 남기지 않으려면 비밀 파일에서
파이프로 넘겨 주세요.

```bash
# 1회 준비: 소유자만 읽을 수 있는 임시 파일 (예: Bitwarden CLI로 내려받은 값)
#    {"token":"<BOT TOKEN>"} 형식의 JSON 한 줄
chmod 600 /secure/path/discord-token.json

# 저장 (값은 argv·환경 변수·로그에 남지 않아요)
python -X utf8 tools/paseo-bot/secret_store.py store --kind discord-bot < /secure/path/discord-token.json

# 확인 (성공 여부만 출력하고 값은 절대 출력하지 않아요)
python -X utf8 tools/paseo-bot/secret_store.py verify --kind discord-bot

# 자식 프로세스용 읽기: stdout이 파이프일 때만 값 JSON을 출력해요
python -X utf8 tools/paseo-bot/secret_store.py read --kind discord-bot | wc -c
```

`read`는 stdout이 터미널이면 값을 출력하지 않고
`{"ok":false,"error":"secret-store-failed"}`와 종료 코드 1을 돌려줘요.
터미널 스크롤백이나 셸 기록으로 토큰이 새는 것을 막기 위해서예요.

## 4. 서비스 동작

`discord_serve.py --state <dir> serve`는 supervisor의 세 번째 서비스예요
(`paseo_bot`, `gui_serve`, `discord_serve`). 하나의 상태 디렉터리에 하나만
돌아요(`discord.lock`).

- 설정이 없거나 `enabled`가 `false`면 **종료하지 않고** 유휴 상태로
  하트비트만 계속 써요. supervisor는 서비스가 종료되면 실패로 보기 때문이에요.
- 활성 상태면 sdk-venv의 `secret_store.py read`로 토큰을 읽고, stdout 파이프로만
  받아요. 그 다음 `node discord_gateway.mjs --state <dir>`를 자식으로 띄우고
  토큰을 **stdin에 JSON 한 줄로** 써서 닫아요. 토큰은 argv, 환경 변수, 파일,
  로그 어디에도 남지 않아요.
- `<state>/discord-health.json`에
  `{version,pid,lastTickAt,enabled,gateway,childPid}`를 10초 이내 간격으로 써요.
  `gateway` 값은 자식이 쓰는 `<state>/discord-gateway.json`에서 읽어요.
- 자식이 종료되면 5초에서 시작해 최대 60초까지 지수 백오프로 다시 띄워요.
  자식 하트비트가 120초보다 오래되면 종료시키고 재시작해요.
- 300초 이상 건강하게 돌던 자식이 죽으면 백오프 횟수를 초기화해요.

`discord_serve.py --state <dir> check`는 설정, sdk-venv 경로, Node 실행 파일,
비밀 읽기 가능 여부를 확인하고 `{"ok":true|false,...}`만 출력해요. 값은 절대
출력하지 않아요.

게이트웨이 자식의 상태 파일:

| 파일 | 내용 |
|---|---|
| `discord-state.json` | 쓰레드↔대화 매핑, 쓰레드별 마지막 활동 시각·폴링 시각·연속 실패 수·dormant 표시, 대화별 전달한 메시지 ID(각 500개), 카드로 보낸 계획 ID와 메시지 ID, 권한 카드(`permissions`, `pid → {conversationId, taskId, messageId, content}`, 최대 200개), 취소 확인 키(`confirms`, 최대 200개), 처리한 Discord 메시지/상호작용 ID(각 5000개, FIFO), RESUME용 세션 |
| `discord-gateway.json` | 자식 하트비트 `{pid,lastTickAt,status,lastEventAt}` |
| `discord-health.json` | 서비스 하트비트(위) |

모두 임시 파일 + rename으로 원자적으로 쓰고 0600으로 만들어요.

## 5. 대화 흐름

- **최상위 메시지**: 허용된 채널에 owner가 쓴 최상위 메시지마다 그 메시지에서
  쓰레드를 열어요(이름은 앞 80자). `gui_api.py start`에
  `requestId = messageId = "d-<메시지 ID>"`로 전달하고, 쓰레드→대화 매핑을
  저장해요.
- **쓰레드 메시지**: 이 서비스가 만든 쓰레드에서만 `gui_api.py send`로 같은
  대화에 이어 붙여요. 매핑에 없는 쓰레드는 조용히 무시해요.
- **바쁜 관리자**: 관리자가 답하는 중에 온 메시지는 그냥 대기열에 쌓여요.
  중단(interrupt)은 없어요.
- **답변과 알림**: 활동 등급에 따라 대화별 `gui_api.py sync`를 호출해 아직
  전달하지 않은 `assistant` 답변과 `system` 단계 알림을 쓰레드에 올려요.
  `system`은 `• ` 접두사를 붙이고, `payload.prUrl`이 있으면 링크를 덧붙여요.
  2000자를 넘으면 줄 경계에서 나눠요. 사용자가 쓴 메시지는 되돌려 게시하지
  않아요.
- **첨부**: `text/*`이거나 `.md .txt .json .log .csv .py .ts .js`이고
  100 KiB 이하일 때만 `cdn.discordapp.com` 또는 `media.discordapp.net`에서
  받아 `\n\n[첨부 <파일명>]\n<내용>`으로 붙여요. 전체가 12000자를 넘거나
  조건에 맞지 않으면 `\n[첨부 생략: <파일명>, <크기>]`만 남겨요.

### 5.1 활동 등급과 폴링 예산

쓰레드마다 마지막 활동 시각(`lastActivityAt`)을 `discord-state.json`에
저장해요. 수락한 메시지, 전달한 답변, 카드 게시·수정이 모두 활동이에요.

| 등급 | 조건 | `sync` 주기 |
|---|---|---|
| hot | 대기 중인 계획 카드, `deliveryState` 존재, 이 대화에 끝나지 않은 작업(`passed, failed, blocked, unknown, closed`가 아님), 또는 30분 이내 활동 | 3초 |
| warm | 7일 이내 활동 | 60초 |
| dormant | 그 밖 | 호출하지 않음 |

- 3초 tick마다 최대 **8번**만 `sync`를 호출해요. hot을 먼저, warm은 마지막
  호출이 오래된 순으로 채우고 남은 대화는 다음 tick으로 미뤄요.
- 쓰레드에 새 메시지가 오면 dormant였다면 다시 hot이 돼요.
- `sync`가 3번 연속 실패하면 그 쓰레드를 dormant로 바꾸고 로그를 한 번 남긴
  뒤 아래 안내를 한 번 올려요.
  `이 대화의 상태를 가져오지 못해 자동 갱신을 멈췄어요. 새 메시지를 보내면 다시 시도해요.`
- `sync`에는 `scope=<conversationId>`를 함께 보내 `tasks`를 그 대화 작업으로
  한정해요.

### 5.2 반복 사용을 위한 동작 (2026-11-04 검토 반영)

- **즉시 반응:** 메시지를 받자마자 채널과 새 스레드에 "입력 중…"을 표시하고, 관리자가 답을 만드는 동안 8초마다 갱신해요. 봇에 *Add Reactions* 권한이 없어서 반응 이모지는 쓰지 않아요.
- **첫 답변 한 번에:** 새 대화의 첫 질문은 관리자 에이전트를 만들 때 함께 보내요. 예전에는 인사 턴이 한 번 더 돌았어요.
- **질문형 작업(`inspect`):** 다른 기기의 프로젝트 파일을 읽어야 하는 질문은 관리자가 `inspect` 작업으로 보내요. 원본 checkout에서 읽기 전용 단계 하나만 돌고(worktree·검사 명령·정리 없음), 제공자의 읽기 전용 모드(Codex `auto`, Claude/OpenCode `plan`)로 실행되며 권한 요청은 모두 자동 거절돼요. 파일이 바뀌거나 검사가 실행되면 작업은 멈춰요. 모든 작업이 `inspect`인 계획은 접수 버튼 없이 바로 시작해요(`gui-runtime.json`의 `autoAdmitInspect: false`로 끌 수 있어요).
- **진행 방식 선택:** `/task workflow:`에 `자동`(기본), `확인만`, `일반 변경`, `중요 변경`이 있어요. 자동이면 관리자가 `inspect` 또는 `daily`를 고르고, `verified`는 직접 고를 때만 써요.
- **알림은 한국어로:** 멈춘 이유는 짧은 한국어 설명으로 보여 주고, 영어 원문은 `/peek`과 결과 파일에만 남겨요. 결과 보고(summary)도 한국어로 쓰게 해요.
- **상주 gui_api:** 게이트웨이는 `gui_api.py --serve` 하나를 띄워 두고 줄 단위 JSON으로 요청해요. 요청마다 Python을 새로 띄우지 않아요. 원격 호출이 걸리는 `peek`만 따로 실행하고, 30초 넘게 응답이 없으면 워커를 다시 띄워요.
- **확인 필요(hold):** 새 입력만 막아요. 이미 진행 중인 작업의 답변·카드·권한 요청·완료 알림은 계속 와요.
- **버튼:** 접수는 카드에 표시된 계획(digest)만 승인해요. 이미 처리된 버튼이나 오류는 누른 사람에게만 보이는 메시지로 알리고, 카드 내용은 덮어쓰지 않아요.
- **답장 메시지:** 모바일의 "답장"(type 19)도 일반 메시지처럼 받아요.
- **재연결:** heartbeat ACK가 없으면 소켓을 바로 버리고 재연결해요(4007/4009는 새 세션). 새 세션(READY)이면 마지막으로 본 메시지 이후를 REST로 가져와 놓친 메시지를 처리해요. 10분 넘게 READY가 없으면 프로세스를 끝내 감독자가 다시 띄워요.
- **치명적 종료:** 토큰 거부·intent 꺼짐(4004, 4010–4014)은 종료 코드 4로 끝나고, 서비스는 10분 뒤에 다시 시도해요.
- **중복 실행 방지:** `discord-gateway.lock`으로 게이트웨이를 하나만 띄워요.
- **상태 파일:** 쓰기는 fsync 후 교체하고, 깨진 파일은 `discord-state.corrupt-<시각>.json`으로 옮긴 뒤 새로 시작해요. 다른 채널의 기록은 버려요. PowerShell이 붙이는 UTF-8 BOM도 읽을 수 있어요.

## 6. 슬래시 명령

길드 명령으로 시작할 때 등록해요(같은 내용을 다시 `PUT`하므로 멱등).

| 명령 | 동작 |
|---|---|
| `/task text:<필수> [project] [model] [effort] [workflow]` | 채널에 시작 메시지를 남기고 그 메시지에서 쓰레드를 열어 계획을 요청해요. `project`는 활성 프로젝트 자동완성, `model`은 `auto/sol/claude/go`, `effort`는 `auto/low/medium/high`, `workflow`는 `daily/verified` |
| `/status` | 관리자 상태(건강, 작업 접수 가능 여부, 대기열, 진행 중 작업 수)를 **본인에게만** 보여 줘요 |
| `/cancel [task]` | 쓰레드의 작업 취소를 물어보는 확인 카드를 본인에게만 띄워요. `취소 확정`을 누르면 큐에 넣어요 |
| `/pause [task]` | 실행 중인 작업을 멈춰요. 멈춤이 확인된 경우에만 `paused`로 기록해요 |
| `/resume [task]` | 멈춘 작업을 같은 에이전트로 다시 시작해요 |
| `/peek [task]` | 작업 에이전트 로그의 끝부분을 코드 블록으로 본인에게만 보여 줘요 |
| `/manager [use]` | 대화 관리자 설정을 **본인에게만** 보여 줘요. `use:Codex/Claude`를 고르면 관리자를 바꿔요(아래 7.5) |
| `/resolve` | 추적 중인 쓰레드 안에서만 동작해요. 그 대화의 확인 대기(`needs-review`)를 풀고 쓰레드를 다시 hot으로 만들어요. 확인 대기 중에 버려진 메시지는 다시 보내지 않아요 |

`/cancel` `/pause` `/resume` `/peek`는 **이 서비스가 만든 쓰레드 안에서만**
동작해요. `task`를 비우면 그 대화의 진행 중(비종료) 작업이 정확히 하나일 때만
그 작업을 골라요. 둘 이상이면 `id · project · state` 목록과 함께 `task` 값을
골라 달라고 답하고, 없으면 진행 중인 작업이 없다고 알려 줘요. `task` 자동완성도
그 대화의 `sync` 결과에서 채워요.

`/task`의 `project`가 `auto`가 아니면 시작 메시지와 쓰레드를 만들기 **전에**
활성 프로젝트 캐시와 대조해요. 캐시가 비었거나 60초보다 오래됐으면 그 자리에서
새로 읽어요(상호작용은 이미 defer된 상태). 없거나 비활성 프로젝트면
`프로젝트를 찾지 못했어요: <id>. 비슷한 프로젝트: <접두사/부분 일치 최대 5개>`
만 답하고 아무 것도 만들지 않아요.

일반 메시지의 기본 선택은
`{project:"auto", model:"auto", effort:"auto", workflow:"daily"}`이고 실제
강제는 `gui_state.py`가 해요.

**모델과 effort를 말로 정하기.** 대화에서 "A는 claude로 high, B는 go로"처럼
말하면 관리자가 그 작업에만 `model`(sol·claude·go)과 `effort`(low·medium·high)를
적어요. 말하지 않은 작업은 비워 두고, 관리자가 난이도를 보고 스스로 고르지는
않아요. 없는 이름(예: gemini, max)을 말하면 관리자가 쓸 수 있는 이름을 답하고,
그래도 없는 값이 오면 계획을 받지 않아요. 우선순위는 `/task`나 GUI에서 고른 값,
말로 정한 값, 기본값 순서예요. 기본값은 일반 변경·확인만이면 sol·medium이고,
중요 변경이면 작업 종류에 따른 모델과 기기 프로필의 effort예요. 서비스는 실제로
쓸 값을 계획에 `resolvedModel`·`resolvedEffort`로 한 번 계산해 두고, 실행과
카드가 같은 값을 써요. 계획 카드에는 작업마다 "모델 claude · effort high"가
보이므로, 잘못 알아들었으면 접수 전에 거절하고 다시 말하면 돼요.
`modelReason`은 고른 값이면 `직접 선택`, 말로 정했으면 `요청에서 지정`이에요.

## 7. 계획 카드와 버튼

관리자가 계획을 제안하면(`state: pending`) 쓰레드에 요약 카드를 올려요.
프로젝트, 워크플로, 기기(있으면), 모델, effort를 작업마다 보여 주고 버튼
두 개를 붙여요.

각 작업 아래에는 실행할 요청 미리보기(`요청: ` + 앞 300자, 줄바꿈은 공백으로
접음, 잘리면 `…`)와 선행 작업 순번(`선행: 1, 2`, 1부터 시작)을 붙여요. 카드
전체가 2000자를 넘으면 미리보기를 비례해서 줄이고(작업마다 최소 80자) 끝에
`(일부 생략)`을 붙여요.

| 버튼 | `custom_id` | 스타일 | 동작 |
|---|---|---|---|
| 접수 | `pb:approve:<planId>` | SUCCESS(3) | 최신 계획의 `digest`로 `gui_api.py approve` |
| 거절 | `pb:reject:<planId>` | DANGER(4) | `gui_api.py reject` |

- 버튼은 3초 안에 type 6(DEFERRED_UPDATE_MESSAGE)으로 확인 응답하고, 실제
  처리는 그 뒤에 해요.
- 계획이 `pending`을 벗어나면(approved/cancelled/superseded) 카드에서 버튼을
  없애고 결과 문구로 바꿔요.
- 접수·거절 알림(`payload.planOutcome`)은 그 계획 카드를 이 서비스가 올렸을 때
  보내지 않아요. 카드가 이미 결과를 보여 주기 때문이에요. 카드가 없으면(올리기
  실패 등) 알림이 결정을 남기는 유일한 흔적이라 그대로 보내요. GUI는 결정된
  계획을 목록에서 빼므로 알림을 보여 줘요.
- 버튼을 누른 사람이 owner가 아니거나, 다른 길드/채널/쓰레드면 아무 것도
  하지 않고 "권한이 없어요"를 본인에게만 보여 줘요.

## 7.1 작업 제어와 확인 버튼

제어는 작업 레코드를 직접 고치지 않아요. `gui_api.py control`이 대화 범위를
확인한 뒤 `task_controls` 큐에 `requestId = "d-" + interaction.id`로 넣고,
러너가 다음 tick에서 한 번만 적용해요.

- `/cancel`은 먼저 확인 카드를 띄워요. 무작위 12자 키를 `discord-state.json`의
  `confirms`에 `{conversationId, taskId, at}`로 저장하고, 버튼 두 개를 붙여요.

  | 버튼 | `custom_id` | 동작 |
  |---|---|---|
  | 취소 확정 | `pb:cc:<12자 키>` | `control op=cancel`을 큐에 넣고 키를 지워요 |
  | 그만두기 | `pb:cx:<12자 키>` | 아무 것도 하지 않고 키를 지워요 |

  owner만 누를 수 있고, 키는 한 번 쓰면 사라져요. 오래된 키는 200개까지만
  남겨요.
- `/pause`와 `/resume`은 확인 없이 바로 큐에 넣어요. `paused`는 멈춤이 실제로
  확인된 경우에만 기록되고, 확인하지 못하면 작업은 계속 실행돼요(`pause-unverified`).
- `/peek`은 `gui_api.py peek`으로 그 작업의 현재 에이전트 로그 끝부분을 받아
  코드 블록으로 감싸 본인에게만 답해요(전체 1900자 이하, 최신 줄 유지).
- 제어 명령은 모두 먼저 ephemeral로 defer한 뒤 결과를 답해요. 상태 변화는
  `gui_state`가 `paused`, `held`, 재개, 취소, `blockedKind`별 한국어 알림으로
  만들어 쓰레드에 게시해요.

계획의 **done-contract**(§3.1 D3)는 **연기**됐어요. 완료를 PR merge, 체크 통과,
파일 JSON 조건처럼 실시간으로 다시 확인하는 규약은 이 제어 단계에 포함되지
않아요.

## 7.2 권한 요청 버튼

에이전트가 승인을 기다리면 작업은 `waiting-permission`이 되고, 그 대화의
쓰레드에 권한 요청 카드가 올라와요. 카드에는 요청 이름과 설명(앞 600자)이
들어가고, 5분 안에 답이 없으면 자동으로 거절한다는 안내가 붙어요.

| 버튼 | `custom_id` | 스타일 | 동작 |
|---|---|---|---|
| 허용 | `pb:pa:<pid>` | SUCCESS(3) | `gui_api.py permission`에 `decision: allow` |
| 거절 | `pb:pd:<pid>` | DANGER(4) | `gui_api.py permission`에 `decision: deny` |

- `pid`는 12자 `[a-z0-9]` 키예요. 게이트웨이는 `payload.permission`이 있는
  시스템 메시지를 게시할 때 버튼을 붙이고 `pid → {conversationId, taskId,
  messageId, content}`를 `discord-state.json`의 `permissions`에 저장해요.
- owner만 누를 수 있고, 상호작용은 3초 안에 type 6으로 확인 응답한 뒤
  `requestId = "d-" + interaction.id`로 `gui_api.py permission`을 호출해요.
- 처리되면 그 카드의 버튼을 없애고 `허용했어요.` / `거절했어요.`를 덧붙여요.
  시간 초과나 다른 클라이언트가 먼저 처리한 경우에도 해석 메시지의
  `payload.permissionResolved`로 같은 카드의 버튼을 지워요.
- 위험 명령으로 자동 거절된 요청은 사람에게 카드가 가지 않아요. 대신
  `위험 명령이라 자동으로 거절했어요: <규칙 이름>` 알림만 한 번 올라와요.
- 이미 처리된 `pid`를 누르면 `이미 처리된 권한 요청이에요.`를 본인에게만
  보여 줘요.

## 7.3 관리자 읽기 전용 설정

`gui-runtime.json`의 `mode`는 Codex **`"auto"`**로 두세요. workspace-write
샌드박스에 승인 요청이 붙는 모드이고, 봇은 관리자 에이전트의 권한 요청을
사람에게 묻지 않고 **즉시 전부 거절**해요(`manager-permission-denied`, 요청
이름만 기록). `full-access`나 `bypassPermissions`는 봇이 중간에서 막을 수
없어서 프로세스 시작당 한 번 `manager-mode-unsafe` 경고를 남겨요(실행을
거부하지는 않아요). 관리자 역할 프롬프트도 읽기 전용이며, 파일 수정·상태
변경 명령·네트워크 접근을 하지 않고 코드 변경은 owner가 승인할 계획 작업으로
만들라고 지시해요.

`mode`를 생략하면 `"auto"`가 기본이에요. 기존 `full-access` 설정은 위험하니
직접 바꿔 주세요.

## 7.4 기억 승인 버튼

AI가 쓴 기억 중 **중요한 항목만** Discord 버튼으로 승인해요. 판단은 모델이
아니라 코드의 결정적 규칙이 하고, 일상 항목은 승인 없이 바로 저장돼요.
승인 요청은 원래 대화(작업에 대화가 없으면 `memory-review` 대화)에
`기억 변경 승인 요청 (<project or 전역>): <op>` 형식으로 올라가고,
`pb:ma:<key>`(승인) / `pb:mr:<key>`(거절) 버튼이 붙어요. owner만 누를 수
있고, 처리되면 카드를 수정해요. 응답이 없어도 자동 적용되지 않아요.
`memory-review` 대화는 쓰레드 없이 채널 자체에 매핑되고 60초 warm 주기로
확인해요.

자세한 정책, 저장소 스키마, 근거 게이트, 만료·격리 규칙, 내보내기 저장소와
`curator`/`memoryExport` 설정은 [paseo-bot-memory.md](paseo-bot-memory.md)를
보세요.

## 7.5 관리자 프로필과 모델 분배

`gui-runtime.json`에 `managers`가 있으면 관리자 에이전트가 턴마다 모델을 바꿔요.
없으면 예전처럼 최상위 `provider/model/thinking` 하나만 써요.

```json
"managers": {
  "codex":  {"provider": "codex",  "mode": "auto",
             "chat": {"model": "gpt-6.1-terra", "thinking": "max"},
             "plan": {"model": "gpt-6.1-sol",   "thinking": "high"}},
  "claude": {"provider": "claude", "mode": "default",
             "chat": {"model": "claude-sonnet-5-5", "thinking": "medium"},
             "plan": {"model": "claude-opus-5-5",   "thinking": "high"}}
},
"defaultManager": "codex",
"spareManager": true
```

- **잡담 단계(chat):** 모든 메시지는 먼저 `chat` 모델이 받아요. 질문·글쓰기·상태 답변과
  읽기 전용 확인(`inspect`) 작업은 여기서 바로 끝나요.
- **계획 단계(plan):** 프로젝트를 바꾸는 계획이 필요하면 chat 단계가
  `"escalate":"plan"`과 짧은 안내("계획을 세울게요")만 돌려줘요. 봇은 같은 관리자를
  `plan` 모델로 바꿔(`setAgentModel`·`setAgentThinkingOption`) 같은 요청을
  `<메시지ID>.plan` 작업으로 다시 보내요. chat 단계가 escalate 없이 변경 작업을
  써도 봇이 계획 단계로 넘겨요. 계획 단계는 다시 넘기지 않아요. `/task`에서
  `일반 변경`이나 `중요 변경`을 고르면 처음부터 계획 단계로 보내요.
- **관리자 바꾸기:** `/manager use:Claude`는 `gui_meta`의 `manager-profile`만 바꿔요.
  각 스레드는 다음 메시지 때 기존 관리자를 보관(archive)하고 새 프로필로 다시
  만들며, 최근 대화 12개를 넘겨줘요. 진행 중인 작업 에이전트에는 영향이 없어요.
- **예비 관리자(`spareManager`):** 답을 기다리는 요청이 없을 때 현재 프로필의
  chat 모델로 관리자 하나를 미리 만들어 둬요(라벨 `paseo_bot_gui=spare-…`).
  새 스레드는 라벨만 바꿔 이 관리자를 바로 가져가요. 그래서 관리자를 만드는
  20~30초가 사라져요. 예비 관리자는 6시간이 지나거나 프로필이 바뀌면
  보관하고, 만들기에 실패하면 10분 뒤에 다시 시도해요.
- **즉시 감지:** `gui_serve`는 대기 중에도 0.2초마다 새 요청을 확인해서, 다음
  주기까지 기다리지 않고 바로 처리해요.
- **쉬던 관리자:** Paseo 데몬은 한 시간쯤 쓰지 않은 에이전트의 런타임을 거둬요
  (상태 `closed`, 대화 기록은 남아요). 관리자 다리는 `send`·`tune`·`claim` 전에
  `closed` 관리자를 `refreshAgent`로 다시 불러오고, `archive`는 불러오지 않고
  바로 보관해요. 보관됐거나 라벨이 다른 에이전트는 불러오지 않아요.
- **보내기 전 거절:** 다리가 관리자를 건드리기 전에 거절하면(`busy`·`ownership`
  ·`action`) `{"ok":false,"refused":…}`로 답하고 Python은 `ManagerRefused`를
  받아요. 아무 것도 보내지 않았으니 요청은 `unknown`이 아니라 `queued`로
  돌아가요. `ownership`이거나 `busy`가 2분을 넘으면 새 관리자로 이어 가요
  (최근 대화 12개를 넘겨줘요). 그 밖의 실패는 지금처럼 "결과 모름, 다시 보내지
  않음"이에요.
- **예비 관리자 인계 실패:** 인계가 거절되면 그 예비 관리자를 보관하고 대화는
  관리자를 새로 만들어요(`manager-spare-unusable`). 남겨 두지 않아요.
- **멈춘 대화 안내:** `sync`의 `stuck`이 `job-unknown`이나 `manager-missing`이
  되면 스레드에 한 번 알리고 `/resolve`를 안내해요. 같은 상태로는 다시 알리지
  않고, 풀리면 기록을 지워요(`stuckNotice`).
- **로그:** `manager-tuned`(tier, tuneMs), `manager-escalated`,
  `manager-spare-ready`(createMs), `manager-spare-claimed`, `manager-retired`,
  `manager-profile-set`, `manager-send-refused`(reason, replaced),
  `manager-spare-unusable`, `manager-spare-claim-unknown`, `manager-job-unknown`.

## 8. 보안 모델

- **입장 경계**: `guildId`, `channelId`, `ownerIds` allowlist, 그리고 비밀
  저장소의 봇 토큰이에요. 설정이 하나라도 틀리면 아무 것도 받지 않아요.
- **소유자만**: 메시지와 상호작용 모두 owner ID, 봇 아님, 웹훅 아님, 시스템
  메시지 아님을 확인해요. 이 서비스가 만든 쓰레드가 아니면 무시해요.
- **수신기 없음**: 인바운드 HTTP 리스너가 없어요. Discord WebSocket과 REST는
  모두 **나가는** 연결이고, Paseo 쪽은 로컬 `gui_api.py` 호출이에요. 게이트웨이가
  받아들일 수 있는 동작은 `start/send/approve/reject/status/sync/control/permission/peek/memory`로
  제한돼요.
- **멘션 금지**: 모든 게시와 수정에 `allowed_mentions: {parse: []}`를 붙여요.
- **멱등성**: 처리한 Discord 메시지/상호작용 ID를 저장하고, 작업과 대화 ID는
  Discord 메시지 ID에서 만들어요(`d-<id>`). 재시작해도 같은 요청을 다시
  보내거나 다시 게시하지 않아요. `gui_api.py send`도 같은
  `(대화, 메시지 ID, 내용, 선택)`을 중복으로 인정해요.
- **재시도 금지**: 전송에 실패한 요청은 `needs-review`로 표시하고 그 쓰레드에
  짧은 안내를 한 번만 남겨요. 성공 여부가 불확실한 요청을 맹목적으로 다시
  보내지 않아요.
- **확인 대기 표시**: 확인 대기 중인 대화의 쓰레드에 메시지가 오면 버리되,
  hold마다 한 번만 `이 대화는 확인이 필요해서 멈춰 있어요. /resolve 로 다시 열거나 채널에 새 메시지로 시작해 주세요.`
  를 답해요. `/resolve`는 그 hold와 안내 플래그를 지우고 쓰레드를 다시 hot으로
  만들 뿐, 버려진 메시지를 다시 보내지는 않아요.
- **비밀**: 토큰은 자식의 stdin으로 한 번만 전달하고, 로그에는 토큰·인증
  헤더·200자를 넘는 메시지 본문을 남기지 않아요.

## 9. 문제 해결

| 증상 | 확인 |
|---|---|
| 자식이 바로 종료 | `discord_serve.err.log`의 `config-invalid`, `token-invalid`, `state-invalid` |
| `gateway: "error"` | 설정 오류, 비밀 읽기 실패, 또는 자식 종료 직후 |
| 답변이 안 올라옴 | `PASEO_BOT_PYTHON`이 설정됐는지, `gui_api.py sync`가 성공하는지 |
| 카드가 안 생김 | `plans`의 `state`가 `pending`인지, 계획 ID가 안전한 형식인지 |
| 쓰레드가 조용함 | `discord-state.json`의 `review`에 대화가 들어갔는지 확인하고, 그 쓰레드에서 `/resolve`를 써 보세요. `dormant: true`면 새 메시지를 보내면 다시 시도해요 |

**치명적 close code**: `4004`(인증 실패), `4010`(잘못된 shard),
`4011`(sharding 필요), `4012`(잘못된 API 버전), `4013`(잘못된 intent),
`4014`(허용되지 않은 intent)는 다시 연결해도 해결되지 않아요. 게이트웨이는
이 코드에서 재시도를 멈추고 하트비트를 `error`로 쓴 뒤 스스로 종료해요
(종료 코드 3). 토큰, intent, shard 설정을 고친 뒤 서비스를 재시작해 주세요.
그 밖의 close code는 백오프로 다시 연결하고, `session_id`/`seq`가 있으면
RESUME을 먼저 시도해요.

기타 주의:

- `429`는 `retry_after`/`X-RateLimit-Reset-After`/`Retry-After`를 읽어
  기다리고, 전역 제한은 모든 요청에 적용해요.
- 좀비 연결(HEARTBEAT_ACK 없음)은 스스로 닫고 재연결해요.
- `discord.json`의 권한이 넓으면(예: 0644) 서비스가 설정을 거부해요.
  `chmod 600`으로 고쳐 주세요.
- 서비스는 Paseo 데몬을 재시작하지 않아요. 코드를 바꾼 뒤에는 supervisor의
  일반 재시작 절차를 써 주세요.
