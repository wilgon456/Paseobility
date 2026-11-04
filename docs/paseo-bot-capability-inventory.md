# Discord 봇 기능 조사

조사일 : 2026-11-04. 현재 봇의 기준은 `ce340d8`입니다. 아래의 이전 상태는 그 커밋과 실제 전면 에이전트의 도구 확인 결과를 뜻하며, 지금 상태는 이 변경의 구현과 별도 테스트 홈에서의 검증을 뜻합니다.

| 기능 | Dori · Hermes에서 사용자가 얻은 것 | 새 봇 이전 | 지금 |
| --- | --- | --- | --- |
| 대화와 여러 컴퓨터의 작업 | Dori의 Discord bridge와 `remote-worker`가 대화를 작업자와 원격 호스트에 연결 | 전면 에이전트 · 네이티브 호스트 · 작업 완료 알림 | 기존 기능 유지 |
| 정기 작업과 선제 알림 | Hermes cron이 자연어 일정의 결과를 대화로 전달 | Paseo heartbeat는 있었으나 봇 안내와 수명 처리가 없었음 | 같은 스레드 heartbeat · 자동 보관과 모델 변경 시 일정 유지 |
| 긴 작업 감시 | Dori `harness.ts`의 10 · 20 · 40분 nudge로 오래 조용한 작업을 확인 | 완료 알림은 있으나 진행 중 감시 안내가 없었음 | 전면 에이전트가 heartbeat로 상태 · 최근 활동 확인, 문제가 있을 때만 보고 |
| 웹 · 브라우저 · 화면 | Hermes의 검색 · 페이지 추출 · 브라우저 · 화면 도구 | `web__run`, `paseo-browser`, `paseo-research`, `paseo-cua` 사용 가능 | 사용 경로 안내 · 실제 웹 검색과 페이지 읽기 검증 |
| 이미지 생성 · 이해 | Hermes의 이미지 생성 · 시각 분석 | 전면 Codex의 이미지 생성 · 보기 도구와 첨부 다운로드는 있으나 결과 파일 전달 경로가 없었음 | 생성 파일을 Discord 첨부로 보내는 명령 · 기존 이미지 보기 사용 |
| 음성 메모 | Hermes의 음성 전사와 음성 답변 | 첨부 다운로드는 있으나 전면 Codex에 전용 전사 도구 없음 | 선택적 로컬 faster-whisper 전사. 음성 합성 답변은 미구현 |
| 이전 대화 · 선호 · 스킬 | Hermes의 세션 검색 · 기억 · 스킬 | `PREFERENCES.md`와 설치된 스킬은 있으나 다른 스레드 검색 명령은 없음 | Paseo의 활성 · 보관 타임라인 검색 추가. 별도 대화 데이터베이스는 만들지 않음 |
| 대화에 먼저 참여하기 | Hermes의 그룹 대화 chime-in 여부는 이번에 확인하지 못함 | 소유자의 메시지 · 작업 완료에 반응 | 일정과 작업자 알림은 선제 전달. 일반 그룹 대화의 자발적 끼어들기는 추가하지 않음 |

## 확인한 원본과 범위

- MAC_MINI의 `dori-supervisor-20261103.tgz`에서 파일 목록과 `bridge/inbound.ts`, `bridge/outbound.ts`, `bridge/policy.ts`, `bin/remote-worker`, `vendor/dori-superagent/src/harness.ts` 등을 읽었습니다. `harness.ts`의 `NUDGE_MINUTES = [10, 20, 40]`와 원격 작업자 실행 · 상태 확인 경로는 코드에서 관찰했습니다. 비밀 파일은 읽지 않았습니다.
- [Grok 백업 저장소](https://github.com/wilgon456/grok_bot_backup)의 README와 Discord 스킬 문서는 확인했지만, 살펴본 트리에는 실행 가능한 Grok 서버 구현이 없었습니다. 해당 문서만으로 과거 실제 동작 전체를 확정하지 않았습니다.
- Hermes [v0.22.7 도구 목록](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/toolsets.py), [README](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/README.md), [cron 문서](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/website/docs/user-guide/features/cron.md), [memory 문서](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/website/docs/user-guide/features/memory.md)를 확인했습니다. 문서에 기재된 기능과 실제 이 봇에서의 동작은 구분했습니다.
- MAC_COM에는 Hermes CLI `v0.20.5`와 설정 디렉터리가 있었고, mac_home에는 설정 디렉터리가 있었으나 CLI는 PATH에서 찾지 못했습니다. MAC_MINI에서는 CLI와 설정 디렉터리를 찾지 못했습니다. 설정 내용 · 비밀값과 각 설치의 실제 사용 이력은 조사하지 않았습니다.
- 별도 테스트 홈에서 실제 전면 에이전트와 Paseo daemon을 사용했고 Discord 전송은 가짜 HTTP 수신부로 검증했습니다. 음성 전사는 별도 임시 가상환경에서 시험했습니다. 실제 Discord 서버에 메시지를 보내거나 실행 중인 봇을 재시작하지 않았습니다.
