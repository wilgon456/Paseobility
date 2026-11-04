# Paseo Discord 봇

Discord 채널과 각 스레드는 각각 하나의 Paseo 에이전트에 연결됩니다. 에이전트가 직접 답하고 필요할 때 작업자를 만듭니다. 중계 서비스는 Paseo의 대화 기록과 상태를 읽어 답변을 Discord에 보내며, 실행 중에는 입력 표시를 유지합니다. 새 봇 상태는 `threads.json`의 스레드 ID · 에이전트 ID 연결뿐입니다. 기존 큐와 GUI 상태는 읽거나 이전하지 않습니다.

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

서비스는 홈에 `AGENTS.md`와 `CLAUDE.md`를 구성하고, `PREFERENCES.md`를 처음에만 만듭니다. 사용자가 기억하거나 잊으라고 한 내용은 에이전트가 이 파일에서 관리합니다. 원격 호스트는 설치된 `paseo-multi` 스킬의 레지스트리나 Paseo 네이티브 호스트를 조회합니다. 프로젝트 힌트 파일은 사실의 기준이 아닙니다. 첨부 파일은 홈의 `attachments/<메시지 ID>`에 내려받고 경로를 에이전트에 전달합니다. 파일당 최대 25 MiB입니다.

같은 제공자에서 모델 · 사고 수준을 바꿀 수 있습니다. 현재 Paseo 0.15.0에서는 기존 Codex 에이전트를 Claude 제공자로 바꿀 수 없어 Sonnet 요청 시 같은 세션을 유지한 전환이 실패합니다. Claude가 필요하면 Claude 제공자의 새 세션이 필요합니다. 원격 Paseo Multi CLI로 만든 작업자는 네이티브 자식으로 연결되지 않으므로 전면 에이전트가 완료 확인과 정리를 수행해야 합니다.

## 배포

검토자는 변경된 저장소를 별도 버전 디렉터리에 배치하고 `discord.json`과 선택적인 `relay.json`의 경로를 확인합니다. `paseo-multi` 스킬, Paseo 데스크톱 또는 CLI 런타임, 비밀 저장소용 Python 환경이 필요합니다. Windows에서는 `paseo-bot.ps1 check`로 설정과 비밀 저장소 접근을 확인할 수 있습니다. 점검 결과에 토큰 값은 표시되지 않습니다.

기존 Guardian이 바라보는 supervisor 경로를 새 버전으로 변경하고 이전 봇 서비스들을 중지한 뒤 새 supervisor를 시작합니다. Windows Guardian 설치는 관리자 PowerShell에서 `guardian/install-guardian.ps1`에 사용자 SID · 상태 경로 · Pythonw 경로를 전달합니다. 일반 사용자 작업 스케줄러는 `paseo-bot.ps1 supervise install -Apply`를 사용할 수 있습니다. `supervisor.py run --state <상태 경로>`는 Discord 서비스 하나만 감독하며 `supervisor.json`과 `discord-health.json`에 상태를 기록합니다. Paseo 데몬을 재시작할 필요는 없습니다. 배포 전에 기존 상태와 설정을 백업하세요.

## 수명과 장애

- 스레드 보관 또는 잠금 시 에이전트를 아카이브합니다. 다시 메시지를 보내면 같은 에이전트를 복원합니다.
- 스레드 삭제 시 에이전트와 해당 로컬 작업공간을 아카이브하고 연결을 지웁니다. 원격에서 독립적으로 만든 작업자는 자동 추적되지 않을 수 있습니다.
- 실행 중 발생한 권한 요청은 허용합니다. 2,000자를 넘는 답변은 나눠 전송합니다.
- 서비스 재시작 시 중복 전송을 피하려고 현재 타임라인을 기준점으로 삼습니다. 따라서 서비스가 중단된 동안에만 생성된 답변은 자동 재전송되지 않습니다. Paseo 기록에서 확인할 수 있습니다.
- `discord-health.json`과 서비스 로그에서 연결 상태를 확인하세요. Discord 권한 · 메시지 콘텐츠 인텐트, Paseo 데몬 연결, 설치된 `paseo-multi` 런타임을 점검합니다. 연결이 끊기면 중계 서비스가 다시 연결을 시도합니다.
