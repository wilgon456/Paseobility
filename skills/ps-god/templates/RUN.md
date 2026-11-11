# Paseo God run

- Run ID: {{RUN_ID}}
- Project: {{PROJECT_ROOT}}
- Created: {{CREATED_AT}}
- Status: active
- Writer: current agent/session (record identity when available)
- Request revision: 1 (advance when the user's scope/criteria change)
- Plan revision: 1 (advance when the approach or dependencies change)

## Goal

{{GOAL}}

## Scope and constraints

Record the requested scope, literal names/paths/formats and applicable project
constraints. Note unrelated edits to preserve. Analysis/preparation stops at
its requested deliverable.

## Guidance actually loaded

- God skill: resolved path and package/source revision or content digest.
- References read: paths and identities; add other material skills as needed.
- Guidance drift/limits: not checked yet; older unknown identities stay unknown.

Record once and update when relevant guidance changes. Do not put these fields
in run.json or claim that a recorded version enforces runtime pinning.

## Change class and checks

- Class: pending (for example small fix, UI, rights/data-sensitive, release).
- Checks: cheap checks per iteration; slow checks once after the batch.
- Project documents read once, with the constraints that apply: none yet.

## Acceptance criteria and evidence

| ID | Criterion and scenario | Check / expected result | Checked inputs and proven layer | Evidence / outcome | State |
| --- | --- | --- | --- | --- | --- |
| C1 | Define before implementation | Choose a sufficient observation | Identify relevant files/target | Pending | pending |

A short note suffices for a small task. Criterion states may be pending, running,
passed, failed, stale or unknown; they are separate from the run status. Record
relevant input/method/environment changes and refresh affected evidence.

## Plan and TODO

Replace the examples below with concrete actions before substantive changes;
one or two steps suffice for a small task. Link criteria and meaningful
dependencies, including the final relevant check. Continue this plan on resume.

- [ ] T1: Next concrete action advancing C1; no unmet dependency.
- [ ] T2: Check C1 against its expected observation after T1.

Use pending/in-progress/blocked/completed/cancelled labels when checkboxes alone
are insufficient. Preserve superseded items and update the plan after meaningful
outcomes. TODO completion is separate from evidence that a criterion passed.

## Decisions and checkpoints

Record concise decisions, changed paths and check results with timestamps.
Include command exit codes and artifact paths when useful; omit secrets and
raw transcripts. Keep facts separate from assumptions.

When applicable, summarize affected callers/state owners, delegated write
scopes/dependencies and returned artifacts. For a repaired check, retain the
failure, reason and equivalent coverage. Do not duplicate these into new logs.

For a changed request, record what changed, affected criteria/items, which
owned helpers were notified and the actual state of any old action/result.

## Blocker or required input

None recorded. When blocked, name the failed boundary, evidence and the exact
dependency needed to continue. For awaiting-input, name the reviewable result
and the remaining decision/action.

If an interrupted operation may already have taken effect, record the target,
known receipt/process state and next reconciliation step before retrying.

## Resume

- Recheck: changed instructions and the current input/method/runtime basis of
  affected evidence, including unfinished writers or uncertain effects.
- Current request/plan and remaining criteria: fill before a handoff.
- Constraints, decisions/rejected approaches and relevant artifacts: link here.
- Known failures/unknowns and write owner: identify before dependent work.
- Next step: the next ready TODO and its intended check.

Keep this capsule concise but complete; verify critical source links are
accessible rather than dropping required context to shorten it.

## Final outcome

Pending. Valid statuses: active, blocked, awaiting-input, paused, complete,
cancelled. Set complete only after all required criteria have current evidence
and the actual outcome matches the requested names, paths, formats and counts.
This record is agent-maintained, not a host-issued certificate.
Delivering a handoff/summary does not itself complete unfinished implementation;
record the delivered artifact separately and preserve the remaining run work.
