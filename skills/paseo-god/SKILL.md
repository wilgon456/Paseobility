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
3. Fill `RUN.md` with criteria, a short TODO and the cheapest useful check per
   criterion. Reuse the active run when the user steers the same task. To
   resume, `list` and pick the run whose goal matches; ask only if several fit.

Each run has one writer. A second writer creates its own run and, when edits
overlap, its own worktree. Do not rewrite another run to resolve a conflict.

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

## Work, check, continue

- Take the next step that advances an unmet criterion. Procedures when useful:
  [debugging](references/debugging.md), [review](references/review.md),
  [spike](references/spike.md).
- Use any available tools and installed skills (`paseo-design` for frontend,
  browser or native-app skills as needed); discover active tool schemas rather
  than assuming them. Batch independent steps.
- Spawn a helper agent (second opinion, independent review, parallel spike)
  when it clearly saves time or catches risk worth its token cost, and say so.
  Large fan-outs or tournaments belong to `paseo-orchestration`.
- Preserve unrelated work. Update the TODO after meaningful outcomes. Record
  decisions, changed paths, check results and the next step; no secrets or raw
  transcripts.
- Verify the relevant boundary; distinguish source, local test, installed
  runtime and deployed state. Rerun a check only after a relevant change.
- If an approach fails twice with the same cause, switch approach or fall back
  to another tool rather than repeating it. Continue independent work. Save
  `blocked` with evidence and a concrete resume step only when nothing left in
  scope can advance the task. No unbounded retries or background schedules.

## Finish and hand back

Mark `complete` only when every required criterion has supporting evidence. A
build or deploy preparation proves only its own layer.

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
`LEARNING-CANDIDATES.md` in this run with evidence, proposed text and
destination. Write it into `AGENTS.md`, memory files, skills or public
repositories only when the user asks.
