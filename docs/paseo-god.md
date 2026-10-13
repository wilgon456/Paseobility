# Paseo God v0

`/paseo-god` is an explicitly selected workflow for finishing a bounded task
with observable criteria, proportionate checks and a resumable local record.
It does not change the model, expand permissions or start background jobs.

The initial scope follows the reviewed
[Paseo God design](https://app.notion.com/p/paseo-god-3f8f13d4d4f081a9a416d0bf093562fc).
The debugging, review and spike references are original concise procedures;
this package does not vendor the Hermes skill catalog or its tool adapters.

## Install and invoke

Use the existing installer; no new installer or package build is needed.

```bash
./scripts/paseobility-init.sh --skill paseo-god --no-context
```

```powershell
.\scripts\paseobility-install.ps1 -Skill paseo-god
```

Add `--with-claude` / `-WithClaude` only when Claude installation is wanted.
The installer backs up an existing same-name skill. Selecting this skill alone
does not install Cua Driver or restart Paseo. Start a new agent session or reload
integrations to refresh skill discovery.

```text
/paseo-god Fix this bug, verify the original trigger, and save a resume point if blocked.
/paseo-god 이 버그를 고치고 원래 증상으로 검증해줘. 막히면 재개 지점을 남겨줘.
```

Both the description and `agents/openai.yaml` restrict use to explicit requests.
Other providers may interpret discovery metadata differently; the body retains
the explicit invocation contract. Ordinary tasks do not load the full workflow
or an always-on index. Native discovery overhead and cache behavior still vary.

## Run records

The agent defines criteria and keeps a short TODO, decisions, evidence and next
step in `.paseobility/god/runs/<uuid>/RUN.md`. The optional Node.js 18+ helper:

```text
node <skill-dir>/scripts/god-run.mjs init --root <project-root> --goal "<goal>"
node <skill-dir>/scripts/god-run.mjs resume --root <project-root> --id <run-id>
```

`init` creates a fresh directory, immutable-by-convention `run.json` identity
metadata and an editable `RUN.md`. `resume` is read-only: it checks the selected
ID and canonical project root, then returns JSON including the record content.
It refuses missing, corrupt or mismatched identity and symlinked storage/record
files. Moving a project requires inspecting and reconciling the identity first;
the helper does not silently rewrite it. It executes no commands from records.

Node is optional for the workflow: use the bundled template and a unique run
directory manually when unavailable. One agent writes each record. A different
writer creates a different run; overlapping source edits still require isolated
worktrees. Local records should be ignored by Git and omit credentials and raw
transcripts. `.paseobility/` is already ignored in this repository.

Statuses are agent-maintained: active, blocked, awaiting-input, paused, complete
or cancelled. The helper never certifies status or completion. Each required
criterion needs evidence at the requested boundary. A local check proves its
local layer; it cannot certify installed or deployed behavior. On resume, check
current state for drift before relying on an old result.

## Learning and capability limits

Reusable observations can become `LEARNING-CANDIDATES.md` inside the selected
run, including evidence, proposed wording and destination. This is a proposal.
God mode does not itself authorize writing native memory, installing generated
skills, changing project rules, pushing a repository or deploying. Existing
authorization for the user's task continues to apply.

v0 includes no four-CLI adapter, embedding router, model swap, skill auto-save,
global INDEX, finance/news workflow or guaranteed token savings. Tools are
discovered in the active environment; Hermes-specific calls are not assumed.

## Validation — 2026-10-13

- Apple Silicon macOS: all 10 run-helper tests passed under Node 18.4.0 and
  22.23.2. They exercise parallel creation, Unicode and edited resume records,
  missing/corrupt/wrong-project records, symlink rejection, CLI errors and a
  copied installation in a path containing spaces.
- Temporary-home single-skill install: both `.agents` and `.claude` file trees
  matched the source. A pre-existing God skill was backed up; an unrelated skill
  was preserved. The installed helper successfully created/resumed a record.
- Skill-creator validation and catalog/frontmatter validation passed. The
  shared Python suite passed all 54 tests after registering the tenth skill in
  the doctor's allow-list and updating package-count expectations.
- CI contains the helper suite for macOS and Windows. Local execution does not
  prove a Windows/Linux run, provider skill discovery or that the workflow
  improves an agent's end-to-end task outcome. Those remain separate checks.

## 한국어 요약

`/paseo-god`를 명시 호출하면 완료 조건을 정하고 필요한 디버깅·리뷰·실험
절차만 읽으며, 작업별 TODO·검증 근거·재개 지점을 남깁니다. Node 도우미는
기록 생성·조회만 합니다. 실제 실행·완료 판단은 에이전트가 근거로 수행합니다.
학습 내용은 저장 후보이며 기존 메모리·스킬을 자동으로 수정하지 않습니다.
로컬 검사와 임시 설치는 검증했으며, Windows/Linux·각 제공자의 실제 호출과
작업 성과는 별도 검증 대상입니다.
