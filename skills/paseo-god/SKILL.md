---
name: paseo-god
description: >-
  Use only when the user explicitly invokes /paseo-god or requests Paseo God
  mode (갓모드). Carry a bounded task through acceptance criteria, selective
  debugging/review/spike guidance, evidence-based verification and a resumable
  run record. Ordinary coding, planning and session resumption do not trigger it.
---

# Paseo God

## Start or resume one run

God mode is a task workflow, not extra permissions or a different model. Work
autonomously inside the user's request and project instructions. Read relevant
project context, not every skill, session or memory file. Load a reference
below only when it helps.

1. State the goal, scope and observable acceptance criteria. Infer routine
   details; ask only for missing information that blocks work.
2. Create or find the run record with the installed skill's helper (Node 18+):

   ```text
   node <skill-dir>/scripts/god-run.mjs init   --root <project-root> --goal "<goal>"
   node <skill-dir>/scripts/god-run.mjs list   --root <project-root>
   node <skill-dir>/scripts/god-run.mjs resume --root <project-root> --id <run-id>
   ```

   Records live in `.paseobility/god/runs/<id>/`; the helper only manages
   records. Without Node, copy [RUN.md](templates/RUN.md) into a new uniquely
   named run directory. Keep these local records out of commits.
3. Fill `RUN.md` with criteria, their observable scenarios and expected check
   results. Keep literal paths, command names and requested
   formats intact. Analysis or preparation ends at the requested deliverable;
   do not invent implementation or runtime checks for it. Reuse the active run
   when the user steers the same task. To resume, `list` and pick the run whose
   goal matches; ask only if several fit.
   Update the `- Status:` line in `RUN.md` yourself; the helper has no status
   update or completion command.

Each run has one writer. A second writer creates its own run and, when edits
overlap, its own worktree. Do not rewrite another run to resolve a conflict.

## Plan before substantive work

After reading enough context to choose an approach, briefly state the plan to
the user and put its TODO in `RUN.md` before substantive changes. For an
investigation, bug fix, change or shipping task, start the TODO from the
matching [playbook](references/playbooks.md). Choose
concrete actions that advance the criteria, order dependencies and include the
checks that establish the outcome. A small correction needs only one or two
steps; a larger task needs meaningful stages, not an exhaustive task graph.
Proceed without a separate plan-approval round unless a required decision is
missing. An available plan/TODO tool can show progress; keep it consistent with
the durable record rather than maintaining a different plan there.

Start the next ready item, update after meaningful outcomes, and change the
plan when observations invalidate the approach. Distinguish pending, in-progress,
blocked, completed and cancelled items. Mark a required outcome complete only
with its evidence; checking off a TODO cannot substitute for verification.
On resume, continue the existing unfinished plan instead of starting over.
Delivering a handoff or summary of unfinished work does not itself close the
underlying goal. Record that deliverable separately and retain unmet criteria
and TODOs in the appropriate unfinished run state; pause only on user request.

For request changes, long-task resumption or delegation, use
[planning and handoff](references/planning-and-handoff.md). Record the loaded
God skill's path and version/content digest in `RUN.md`, including references
used; add other skill identities only when they materially affect the result.
This is provenance, not enforced version pinning. A changed skill prompts an
impact check, not automatic invalidation of all earlier work.

## Keep fixed costs proportional

Per-task overhead repeats on every small change, so size it to the change.

- Classify the change once (copy or bug fix, UI, rights- or data-sensitive,
  release) and record the checks that class needs. Escalate when the diff
  crosses into a heavier class.
- Read mandatory project documents once per run and record the applicable
  constraints in a few lines; reread only when a document changed.
- Iterate with the cheapest check that can fail. Run slow checks (full renders,
  e2e, release builds) once after the batch they cover.
- Pass context to other agents through the run record. Remove check output this
  run generated unless recorded evidence cites it.
- When the user reports slowness or cost, time each layer before naming a
  cause, and record a tiered proposal as a learning candidate.

## Keep the checks tied to the request

- Connect each criterion to a scenario, the cheapest sufficient check, its
  expected observation and the layer it proves. For implementation, method
  repair or a resumed check, use [verification](references/verification.md).
- Keep the requested outcome and coverage when repairing a check. Record why
  the old method failed and why its replacement tests the same obligation.
  User changes can revise scope; a failing check cannot silently revise it.
- Associate results with the actual checked inputs, method and environment.
  After a relevant edit, mark affected results stale and recheck them after
  the last writer finishes. Preserve unrelated valid evidence; a Git SHA alone
  does not identify uncommitted files or installed runtime state.
- Missing, truncated, skipped or ambiguous evidence leaves the affected
  obligation unproven. Inspect actual output/artifacts; a tool's successful
  return or a helper's `complete` label is not an outcome check.
- Before reporting or acting on a measured number (time, size, speedup, error
  rate), find what limits it and rule out that it measured something else:
  a cache, a warm process, a different input or a skipped step.

## Work, check, continue

- Take the next step that advances an unmet criterion. Procedures when useful:
  [debugging](references/debugging.md), [review](references/review.md),
  [spike](references/spike.md). For changes to shared APIs, persisted data,
  state or coordinated work, use [change boundaries](references/change-boundary.md).
- Use any available tools and installed skills (`paseo-design` for frontend,
  browser or native-app skills as needed); discover active tool schemas rather
  than assuming them. Batch independent steps.
- Spawn a helper agent (second opinion, independent review, parallel spike)
  when it clearly saves time or catches risk worth its token cost, and say so.
  When the installed base skills are present, use `paseo-advisor` for a second
  opinion and `paseo-committee` when planning is stuck; otherwise keep this
  behavior. Large fan-outs or tournaments belong to `paseo-orchestration`.
- Preserve unrelated work. Update the TODO after meaningful outcomes. Record
  decisions, changed paths, check results and the next step; no secrets or raw
  transcripts.
- When the user changes the request, update its criteria and TODO, communicate
  the revised scope to owned helpers, and reconcile old work before starting
  conflicting steps. A late result from the old scope is not current evidence.
- Verify the relevant boundary; distinguish source, local test, installed
  runtime and deployed state. Rerun a check only after a relevant change.
- Distinguish a product/check failure from a tool or environment failure. Two
  attempts with the same cause and no new evidence call for a different
  approach; rerunning a regression after a relevant fix is useful progress.
  When two fixes built on the same premise have failed, write the premise down
  and test it directly before a third.
  If an interrupted action may already have taken effect, reconcile its state
  before retrying; cancellation or timeout does not prove rollback. Continue
  independent work. Save
  `blocked` with evidence and a concrete resume step only when nothing left in
  scope can advance the task. No unbounded retries or background schedules.

## Finish and hand back

Mark `complete` only when every required criterion has current supporting
evidence. Compare the actual final state with the user's literal requirements,
including names, paths, formats and counts. If replacement or installation was
part of the work, check the affected existing entry points still work. A build
or deploy preparation proves only its own layer; an unsettled action is not
verified completion. Local run records are agent-maintained, not host-enforced
certificates, locks or a security boundary.

Ask first only before spending money, irreversible deletion, account-security
changes, or pushing, publishing, deploying or sending something the user did
not ask for. Finish everything reviewable up to that point, record
`awaiting-input` and name the one remaining action. Use `paused` only when the
user asks.

On resume, read the record, check current files and runtime for drift (old
evidence is not current proof), then continue the next unmet criterion. If the
user cancels or replaces the task, record `cancelled`.

Report the outcome, proven criteria, material limits and the run ID when it
helps resuming. Keep the response proportional to the task.

## Learning is a proposal

When a reusable procedure or preference emerges, add it to
`LEARNING-CANDIDATES.md` in this run with the observed trigger, evidence,
applicable project/task scope, limits, proposed text and destination. Merge
duplicate candidates; distinguish a stated preference from an inferred lesson.
Do not broaden a project lesson into a global rule or revive a rejected lesson
without new evidence. Write it into `AGENTS.md`, memory files, skills or public
repositories only when the user asks; a successful trial is not permission to
promote or publish it.
