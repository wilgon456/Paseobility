# ⚡ Paseo Super Power

> Paseo 에이전트에게 초능력을 쥐여주는 확장 스킬팩.
> 브라우저를 손에 쥐고, 멀티에이전트 군단을 지휘하라.

---

## 🧠 어떤 일이 가능한가?

| with `/paseo-computer-use` | with `/paseo-orchestration` |
|---------------------------|----------------------------|
| "로그인 폼 채워줘" | "이 기능 A가 설계하고 B가 구현하고 C가 검토해" |
| "이 페이지 내용 스크린샷 찍어줘" | "버그 수정 3명한테 동시에 시켜서 제일 나은 걸로 골라" |
| "검색 결과 긁어와" | "이 PR 통과할 때까지 루프 돌려" |
| "반응형 레이아웃 모바일/데스크탑 둘 다 찍어줘" | "구현 완료되면 자동으로 코드리뷰 붙여" |

단순한 "코드 짜줘"를 넘어, **에이전트가 다른 에이전트를 생성·관리·검증**하는 오케스트레이션 계층입니다.

---

## 📦 설치

```bash
# 1. 클론
git clone https://github.com/wilgon456/paseo_super_power.git

# 2. 스킬을 Paseo 양쪽 경로에 복사
cp -r paseo_super_power/skills/* ~/.agents/skills/
cp -r paseo_super_power/skills/* ~/.claude/skills/

# 3. Paseo에서 새 에이전트 시작 (또는 Settings → Integrations → Update)
```

---

## 🔥 스킬

### `/paseo-computer-use` — 브라우저 지배

Paseo 내장 20종 브라우저 도구를 하나의 워크플로우로 묶습니다.

```
새탭 → 스냅샷 → 클릭/입력/스크롤 → 검증 → 정리
```

- 폼 자동 작성, 로그인, 검색, 데이터 추출
- 스크린샷, JS 실행, 반응형 테스트
- **보안 가드**: 결제·제출·계정 변경은 사용자 확인 필수
- **evaluate 안전 규칙**: 쿠키/토큰/localStorage 읽기 금지

### `/paseo-orchestration` — 멀티에이전트 지휘

7가지 검증된 협업 패턴:

```
Fan-out       │ 작업을 N개로 쪼개 동시 실행 → 결과 합성
Task DAG      │ Step1 → Step2 → Step3 순차 의존성
Hybrid DAG    │ 병렬 + 순차 혼합 (Split → Merge 패턴)
Decision Gate │ 단계 사이 검토 에이전트로 진행 여부 판단
Coordinator   │ Heartbeat로 여러 워커 주기적 관리
Ask/Reply     │ 다른 에이전트에게 동기 질의
Escalation    │ 실패 시 컨텍스트와 함께 사용자에게 보고
```

**크로스 프로바이더** — Codex로 구현하고 Claude로 리뷰. 서로의 맹점을 잡아냅니다.

---

## 🎯 요구사항

- [Paseo](https://paseo.sh) 데스크탑 앱
- 1개 이상의 AI 프로바이더 (Codex, Claude Code 등)
- Paseo Settings → Agents → **Enable Paseo tools** 활성화

---

## ✨ 원리

이 스킬들은 **새로운 도구를 추가하지 않습니다.**  
Paseo가 이미 가진 MCP 도구들을 **언제, 어떻게, 어떤 순서로, 어떤 안전장치와 함께** 조합할지를 에이전트에게 가르치는 지식 레이어입니다.

공식 Paseo 스킬(`/paseo-handoff`, `/paseo-loop`, `/paseo-committee`)과 동일한 구조와 패턴을 따릅니다.

---

## 📂 구조

```
skills/
├── paseo-computer-use/SKILL.md    # 브라우저 자동화
└── paseo-orchestration/SKILL.md   # 멀티에이전트 협업
```

---

## 🔗 연관 프로젝트

- [ai-skill-library](https://github.com/wilgon456/ai-skill-library) — 크로스 에이전트 스킬 검색·설치 라이브러리 (곧 연동)
