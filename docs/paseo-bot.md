# Paseo Discord 봇

채널의 새 메시지마다 Discord 스레드를 만들고, 각 스레드를 하나의 전면 Paseo 에이전트에 연결합니다. 에이전트는 공용 작업공간에서 직접 답하고 필요할 때 작업자를 만듭니다. 중계 서비스는 Paseo 타임라인을 구독해 답변을 Discord에 보내며, 실행 중에는 입력 표시를 유지합니다. `threads.json`에는 연결과 마지막으로 전달한 타임라인 위치를 저장합니다. 기존 문자열 형태의 연결도 읽습니다. 기존 큐와 GUI 상태는 읽거나 이전하지 않습니다.

## 설정

상태 디렉터리의 `discord.json`은 기존 형식을 사용합니다. `ownerIds`에 지정된 사용자, 지정 서버와 채널 및 그 채널의 스레드만 처리합니다. 토큰은 기존 Bitwarden 항목 `paseo-bot-discord-token`에서 읽어 프로세스 표준 입력으로만 전달합니다.

```json
{
  "version": 1,
  "enabled": true,
  "guildId": "111111111111111111",
  "channelId": "222222222222222222",
  "ownerIds": ["333333333333333333"],
  "python": "C:/path/to/secrets-venv/Scripts/python.exe"
}
```

선택 사항인 같은 디렉터리의 `relay.json`에서 전면 에이전트의 기본 설정을 바꿉니다. 지정하지 않으면 아래 모델과 권한을 사용하고, 홈은 상태 디렉터리의 `assistant`입니다. `source`는 에이전트가 자기 봇의 코드를 찾을 경로이며 기본값은 실행 중인 `tools/paseo-bot` 디렉터리입니다.

```json
{
  "provider": "codex",
  "model": "gpt-6.1-terra",
  "thinking": "high",
  "mode": "full-access",
  "home": "C:/path/to/discord-assistant",
  "source": "C:/path/to/Paseobility/tools/paseo-bot"
}
```

서비스는 홈에 `AGENTS.md`와 `CLAUDE.md`를 구성하고, `PREFERENCES.md`를 처음에만 만듭니다. 사용자가 기억하거나 잊으라고 한 내용은 에이전트가 이 파일에서 관리합니다. 기존 프로젝트 목록으로 `PROJECT_HINTS.md`를 만들고 온라인 호스트의 기존 작업공간 ID를 더합니다. 이 파일은 힌트이며 현재 위치는 확인해야 합니다. 첨부 파일은 홈의 `attachments/<메시지 ID>`에 내려받고 경로를 에이전트에 전달합니다. 파일당 최대 25 MiB입니다.

같은 제공자에서 모델 · 사고 수준을 바꾸면 기존 에이전트를 사용합니다. 제공자가 바뀌면 최근 대화와 선호를 후속 에이전트에 전달하고 연결을 바꾼 뒤 기존 에이전트를 아카이브합니다. 전면 에이전트는 `relay_ctl.mjs switch --thread ID --provider PROVIDER --model MODEL [--thinking ID]`로 현재 턴이 끝난 뒤의 전환을 요청합니다. Paseo에 등록된 네이티브 호스트에서 자식 작업자를 만들면 완료 알림이 전면 에이전트에 돌아옵니다.

## 배포

검토자는 변경된 저장소를 별도 버전 디렉터리에 배치하고 `discord.json`과 선택적인 `relay.json`의 경로를 확인합니다. `paseo-multi` 스킬, Paseo 데스크톱 또는 CLI 런타임, 비밀 저장소용 Python 환경이 필요합니다. Windows에서는 `paseo-bot.ps1 check`로 설정과 비밀 저장소 접근을 확인할 수 있습니다. 점검 결과에 토큰 값은 표시되지 않습니다.

기존 Guardian이 바라보는 supervisor 경로를 새 버전으로 변경하고 이전 봇 서비스들을 중지한 뒤 새 supervisor를 시작합니다. Windows Guardian 설치는 관리자 PowerShell에서 `guardian/install-guardian.ps1`에 사용자 SID · 상태 경로 · Pythonw 경로를 전달합니다. 일반 사용자 작업 스케줄러는 `paseo-bot.ps1 supervise install -Apply`를 사용할 수 있습니다. `supervisor.py run --state <상태 경로>`는 Discord 서비스 하나만 감독하며 `supervisor.json`과 `discord-health.json`에 상태를 기록합니다. Paseo 데몬을 재시작할 필요는 없습니다. 배포 전에 기존 상태와 설정을 백업하세요.

## 수명과 장애

- 스레드 보관 또는 잠금 시 에이전트를 아카이브합니다. 다시 메시지를 보내면 같은 에이전트를 복원합니다.
- 스레드 삭제 시 에이전트와 같은 스레드 레이블을 가진 온라인 호스트의 작업자를 아카이브하고 연결을 지웁니다. 공용 작업공간은 유지합니다. 오프라인 호스트의 작업자는 그때 정리할 수 없습니다.
- 실행 중 발생한 권한 요청은 허용합니다. 2,000자를 넘는 답변은 나눠 전송합니다.
- 서비스 재시작 시 저장된 전달 위치 뒤의 답변을 보냅니다. 이전 문자열 형태의 연결에는 전달 위치가 없으므로 최초 실행 시 과거 답변이 다시 나갈 수 있습니다. Discord 요청 성공과 위치 저장 사이에 프로세스가 중단되면, Discord의 nonce 중복 방지는 최근 몇 분에 한정되므로 장시간 중단 후 중복 가능성이 있습니다. 중단 중 사용자가 Discord에 보낸 메시지의 별도 재수신은 아직 지원하지 않습니다.
- `discord-health.json`과 서비스 로그에서 연결 상태를 확인하세요. Discord 권한 · 메시지 콘텐츠 인텐트, Paseo 데몬 연결, 설치된 `paseo-multi` 런타임을 점검합니다. 연결이 끊기면 중계 서비스가 다시 연결을 시도합니다.
