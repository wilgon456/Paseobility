# Paseo Super Power

Paseo 오케스트레이션을 위한 확장 슬래시 스킬 3종 + 스킬허브 연동.

## 설치

```bash
# skills/ 폴더를 각 Paseo 환경의 ~/.agents/skills/ 와 ~/.claude/skills/ 에 복사
cp -r skills/* ~/.agents/skills/
cp -r skills/* ~/.claude/skills/
```

## 스킬 목록

| 슬래시 | 설명 |
|--------|------|
| `/paseo-computer-use` | Paseo 내장 브라우저 도구 20종으로 웹페이지 조작 (스냅샷, 클릭, 폼 입력, 스크린샷, JS 실행) |
| `/paseo-orchestration` | 멀티에이전트 협업 7가지 패턴 (Fan-out, Task DAG, Hybrid DAG, Decision Gate, Coordinator Loop, Blocking Ask/Reply, Escalation) |
| `/paseo-skillhub` | [ai-skill-library](https://github.com/wilgon456/ai-skill-library) 연동 — 스킬 검색→검증→승인→설치 워크플로우 |

## 요구사항

- Paseo 데스크탑 앱 (또는 CLI)
- 1개 이상의 AI 프로바이더 (Codex, Claude Code 등)
