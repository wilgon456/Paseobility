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

Treat God mode as a task workflow, not extra permissions or a different model.
Follow the project's applicable instructions and the user's existing authority.
Read relevant project context and approved preferences; do not scan every skill,
session or memory file. Load the references below only when they help this task.

1. State the goal, scope and observable acceptance criteria. Infer routine
   details from the request; ask only for missing information that blocks work.
2. Create a separate run record using the installed skill's helper:

   ```text
   node <skill-dir>/scripts/god-run.mjs init --root <project-root> --goal "<goal>"
   node <skill-dir>/scripts/god-run.mjs resume --root <project-root> --id <run-id>
   ```

   The helper needs Node.js 18+, returns JSON with the run ID and record path,
   and stores records in `.paseobility/god/runs/<id>/`. It creates records only;
   it does not perform work, run checks or certify completion. Without Node,
   copy [RUN.md](templates/RUN.md) into a new uniquely named run directory and
   record the absolute project root. Keep these local records out of commits;
   Paseobility already ignores `.paseobility/`, other projects may not.
3. Fill `RUN.md` with criteria, a short TODO and the smallest useful check for
   each criterion. Reuse the active run when the user steers the same task.
   Resume only an explicitly selected ID; never choose an arbitrary latest run.

Each run has one writer. A second writer creates its own run; use separate
worktrees when edits overlap. Run IDs isolate notes, not source-code changes.
Do not rewrite another run or shared memory to resolve a conflict.

## Keep fixed costs proportional

Per-task overhead repeats on every small change, so size it to the change.

- Classify the change once (for example copy or bug fix, UI, rights- or
  data-sensitive, release) and record the checks that class requires in
  `RUN.md`. Escalate when the diff crosses into a heavier class.
- Read mandatory project documents once per run and record the constraints
  that apply in a few lines. Later steps, resumes and authorized reviewers use
  that record; reread only when a document changed or a decision depends on
  wording the record lacks.
- Iterate with the cheapest check that can fail for the change. Run slow checks
  (full renders, e2e, release builds) once after the batch they cover.
- Pass context to another agent through the run record rather than having it
  rediscover the project. Keep only check output that recorded evidence cites;
  remove other output this run generated.
- When the user reports slowness or cost, time each layer (tool, checks,
  workflow) before naming a cause. If project rules impose a measured,
  disproportionate fixed cost, follow them and record a tiered proposal as a
  learning candidate.

## Work, check, continue

- Choose the next step that advances an unmet criterion. Read one relevant
  procedure when needed: [debugging](references/debugging.md),
  [review](references/review.md), or [spike](references/spike.md).
- Use available tools and installed skills for the actual work. Discover active
  schemas instead of assuming Hermes tools, provider-specific hooks or a CLI
  adapter. Follow `paseo-design` for frontend changes and the appropriate browser
  or native-app workflow. Spawn agents only when separately authorized.
- Preserve unrelated work. Update the TODO after meaningful outcomes, not every
  tool call. Record decisions, changed paths, check results and the next step;
  exclude secrets, raw transcripts and private reasoning.
- Verify the smallest relevant boundary. Distinguish source, local test,
  installed runtime and deployed state. Rerun a check after a relevant change;
  do not repeatedly run a passing suite without a new reason.
- If an approach fails twice with the same cause, change the approach before
  another attempt. Continue useful independent work. When no authorized step
  can advance the task, save `blocked`, the evidence, the exact dependency and
  a concrete resume step. Do not turn a task into unbounded retries or a
  background schedule.

## Finish and hand back

Mark `complete` only when every required criterion has supporting evidence and
no required work remains. A candidate solution, successful build or preparation
for a requested deployment proves only its own layer. If approval is needed,
finish the reviewable preparation, record `awaiting-input` and identify the
specific remaining action. Use `paused` only when the user asks to pause.

On resume, read the selected record and applicable instructions, check current
files/runtime state for drift, then continue the next unmet criterion. Old
evidence is not proof of current state. If the user cancels or replaces the
task, record `cancelled` rather than completing the old goal.

Report the outcome, proven criteria, material remaining limits and run ID/path
when it will help the user resume. Keep the response proportional to the task.

## Learning is a proposal

When a reusable procedure or preference emerges, optionally write
`LEARNING-CANDIDATES.md` inside this run with the observation, supporting
evidence, proposed text and proposed destination. Avoid duplicates. Save durable
preferences, native memory or new installed skills only when the user explicitly
requests that write. God mode does not automatically edit `AGENTS.md`, `SOUL.md`,
`MEMORY.md`, skill directories or public repositories. Existing authorization
for the actual task still applies.

This v0 has no always-loaded INDEX, model swap, four-provider adapter, embeddings
or automatic learning hooks. Provider discovery overhead and prompt caching
vary; do not promise zero cost or identical support across CLIs.
