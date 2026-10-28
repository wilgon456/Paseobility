# Paseo God v0

`/paseo-god` is an explicitly selected workflow for finishing a bounded task
with observable criteria, proportionate checks and a resumable local record.
It does not change the model, expand permissions or start background jobs.

The initial scope follows the reviewed
[Paseo God design](https://app.notion.com/p/paseo-god-3f8f13d4d4f081a9a416d0bf093562fc).
The debugging, review and spike references are original concise procedures;
this package does not vendor the Hermes skill catalog or its tool adapters.
The playbooks and the 2026-10-28 debugging and review revisions adapt ideas from
[pstack](https://github.com/cursor/plugins/tree/main/pstack) (Lauren Tan, MIT)
and [mattpocock/skills](https://github.com/mattpocock/skills) (Matt Pocock, MIT),
rewritten rather than copied.

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

## Proportional fixed cost

Mandatory reading, split implementation/review agents and full verification
repeat on every task, so a one-line fix can cost as much as a feature. In one
measured project, Git took 0.01 s, typecheck/tests/build about 7 s, e2e 23 s and
a full three-width render 77 s; the long commit cycle came from rereading about
78 KB of required documents per task, a second agent rediscovering the same
context and repeating slow checks after each fix.

God mode therefore classifies the change once and records the checks that class
requires, reads mandatory documents once per run and keeps the applicable
constraints in `RUN.md`, iterates with cheap checks and runs slow checks once per
batch, and passes context through the record. It still follows project rules;
when a measured rule cost is disproportionate, it records a tiered proposal as a
learning candidate instead of editing the rules.

## Learning and capability limits

Reusable observations can become `LEARNING-CANDIDATES.md` inside the selected
run, including evidence, proposed wording and destination. This is a proposal.
God mode does not itself authorize writing native memory, installing generated
skills, changing project rules, pushing a repository or deploying. Existing
authorization for the user's task continues to apply.

v0 includes no four-CLI adapter, embedding router, model swap, skill auto-save,
global INDEX, finance/news workflow or guaranteed token savings. Tools are
discovered in the active environment; Hermes-specific calls are not assumed.

## Workflow revision — 2026-10-25

The [Dinobot comparison](paseo-god-dinobot-review.md) records the inspected
modules and adoption decisions. Criteria now connect to observable scenarios,
expected checks and the actual checked input state. Relevant changes make
affected evidence stale; method repair preserves the obligation being tested.
The agent reconciles an interrupted action before retrying it and checks the
literal final deliverable rather than treating a child task or exit code as
completion.

Conditional guidance covers shared API/state boundaries, ordered handoffs and
controlled comparisons. Learning candidates retain their scope and limits.
Analysis/preparation ends at the requested artifact. These are procedures, not
new tool commands, locks or host-enforced verification. The existing helper
still creates, lists and reads local records only; native memory and generated
skills are not automatically promoted.

## Planning, request revisions and handoff — 2026-10-25 follow-up

After enough initial inspection, God states a short plan and writes a TODO
before substantive changes. Items advance acceptance criteria, follow real
dependencies and include the relevant final check. Small fixes need only one
or two steps; completed work and the remaining plan carry into resumption.
An available plan tool can show the same plan, without becoming a second source
of truth or requiring a separate approval round.

Request and plan revisions are distinct. A user scope change updates criteria,
TODOs and owned helper instructions; old-scope results need reassessment before
integration. A compact handoff keeps critical constraints, decisions, evidence,
unknown effects and the next ready item, with accessible source links.

RUN.md also identifies the loaded God skill and references, using a content
digest when a package/source revision does not identify local edits. On a
material guidance change, apply current user/project rules and reconsider
affected work. This is recorded provenance, not runtime version pinning. Older
records without these fields still resume, with historical identity left unknown.
The optional detailed procedure is
[planning and handoff](../skills/paseo-god/references/planning-and-handoff.md).

Follow-up validation: all 11 helper tests and both skill validators passed.
Temporary install/reinstall matched the 11-file skill in both target layouts.
Three independent fixtures exercised a two-step plan before a one-line fix,
scope revision with a synthetic worker and preservation of an old artifact,
and a documentation-only handoff with missing requirements and changed guidance.
Parent review checked saved plans/action records, reran the two original tests,
and verified the exact JSON output and preserved inputs. A handoff-status
ambiguity was corrected: delivered handoff artifacts are recorded separately
while the unfinished original goal remains blocked on its missing requirements.
See the [follow-up record](paseo-god-dinobot-review.md#follow-up-validation)
for limits; the fixture controller does not prove real worker cancellation.

## Validation — 2026-10-25

All 11 existing helper tests and both skill validators passed. Temporary
installation/reinstallation and copied-helper creation/list/resume passed.
Four independent local fixture requests exercised stale evidence, an empty
successful-looking check, interrupted-effect reconciliation and a report-only
comparison. Parent review inspected the artifacts and reran the relevant checks.
The local `.agents` copy matched all 10 final skill files after a backed-up
single-skill update. See the [comparison's validation record](paseo-god-dinobot-review.md#validation)
for observed outcomes and limits; these checks do not certify a host-enforced
workflow, a distributed execution guarantee or general task success rates.

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

## Playbooks, debugging loop and two-axis review — 2026-10-28

- [Playbooks](../skills/paseo-god/references/playbooks.md) give investigation,
  bug fix, change and ship tasks a starting TODO. Ship covers PR, CI,
  independent verification before merge, deploy or release, a check on the
  real target, and cleanup; it stops before irreversible steps nobody asked for.
- [Debugging](../skills/paseo-god/references/debugging.md) now starts by
  building one command that fails on the bug, on the surface where it appeared,
  with a ladder of ways to build it and a completion criterion. When two fixes
  share a failed premise, the premise is tested before a third fix.
- [Review](../skills/paseo-god/references/review.md) pins a fixed point and
  checks the request and the repository's standards as separate axes, keeping
  only findings shown by a run or concrete trace.
- `SKILL.md` adds a rule for explaining a measured number before acting on it.

These came from comparing the skill with the two reference repositories after a
day of Paseo bot work: a macOS-only permission bug surfaced only on a real Mac,
and a regular expression was fixed twice on the same wrong premise. The skill
grew by seven lines; the rest lives in references read only when needed.

## 한국어 요약

`/paseo-god`를 명시 호출하면 완료 조건을 정하고 필요한 디버깅·리뷰·실험
절차만 읽으며, 작업별 TODO·검증 근거·재개 지점을 남깁니다. Node 도우미는
기록 생성·조회만 합니다. 작업마다 반복되는 고정 비용을 줄이기 위해 변경
등급을 한 번 정해 필요한 검사만 기록하고, 필수 문서는 실행당 한 번 읽어 적용
제약을 기록에 남기며, 느린 검사는 묶음당 한 번만 돌립니다. 실제 실행·완료 판단은 에이전트가 근거로 수행합니다.
학습 내용은 저장 후보이며 기존 메모리·스킬을 자동으로 수정하지 않습니다.
2026-10-28부터 조사·버그 수정·변경·배포 작업은 정해진 절차에서 TODO를 시작합니다.
버그는 실패를 바로 재현하는 명령부터 만들고, 같은 전제로 두 번 실패하면 전제부터
시험합니다. 검토는 "요청대로 했는가"와 "저장소 규칙을 지켰는가"를 나눠 보며,
실제로 돌려 확인한 지적만 남깁니다. pstack과 mattpocock/skills(둘 다 MIT)의
방식을 참고해 새로 썼습니다.
로컬 검사와 임시 설치는 검증했으며, Windows/Linux·각 제공자의 실제 호출과
작업 성과는 별도 검증 대상입니다.
