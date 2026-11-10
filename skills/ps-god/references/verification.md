# Checks that establish the requested outcome

Use for implementation, a changed verification method or resuming evidence.
For a small correction, a single criterion and a short result note are enough.
Keep the record in RUN.md; do not introduce a parallel certification system.

## Select the observation before the check

For each required outcome, identify its trigger or scenario, expected result
and a check capable of observing that result. Preserve requested literal names,
paths, formats and counts. Several criteria may share one check when its output
establishes each of them; do not create a redundant test for each table row.

Match the check to the claim. A typecheck does not exercise a retry, a local
server response does not prove an installed app, and an existing archive does
not establish its required contents. For stateful work, include a relevant
failure, repeated operation, boundary or recovery scenario when it can change
the conclusion. Source analysis and preparation use their requested artifacts
as evidence without pretending they performed runtime verification.

Before replacing a failing method, separate an observed product failure from
an unusable tool, unavailable dependency or inadequate assertion. Repair the
method only with the reason and equivalent coverage recorded. Do not delete a
hard scenario, alter the expected outcome, modify comparison inputs or replace
a behavioral check with file existence just to obtain a pass. If the user
revises the outcome, record that revision and reconsider the affected checks.

## Retain enough evidence to recheck it

Record the actual command or observation, working directory, relevant input
state, environment/version when material, exit/result and artifact location.
For an uncommitted change, identify the checked working-tree content or relevant
file digests; a commit ID alone is insufficient. For installed/deployed behavior,
identify the actual target and configuration checked. No credentials, broad
environment dumps or unnecessary transcripts belong in the record.

When a wrapper or subprocess resolves a different runtime, identify the actual
executable/version it used rather than assuming the interactive shell's version.
Use an available compatible runner without silently changing global settings.

Read the output, not just the exit code. A check that discovers zero tests,
skips required cases, truncates a needed result or cannot open its report does
not establish those outcomes. Conversely, a deliberately failing regression
before the fix is evidence of the trigger, not automatically a broken tool.

Keep checks bounded with the tool's supported timeout or an appropriate runner.
An unexpected interaction prompt should not leave a job waiting indefinitely.
Do not add wrapper tests solely to fit a record format; use existing commands
and real observed behavior.

## Refresh only evidence whose basis changed

After a relevant code, input, configuration, dependency, target or check-method
change, mark affected rows stale. Include downstream integration results that
depend on that change. A different environment or runner can also invalidate a
comparison. Explain any decision to retain older evidence; rerun when its
continued relevance cannot be established. Do not rerun unrelated expensive
checks solely because the run resumed.

Wait for the relevant writers/processes to finish before final verification.
A delegated "done" is a report to inspect: compare its actual artifacts and
check evidence with the handoff, then verify the integrated result where needed.
Do not apply a later edit and finish against earlier green output.

Use criterion states such as pending, running, passed, failed, stale or unknown
to describe the evidence. These are not new run statuses. On resume, reconcile
the final files/runtime with the record and continue the next unmet criterion.

## Reconcile an uncertain effect

An interrupted write, install, request or background command may have completed
partially or fully. Inspect the target, relevant process/job and available
receipt before deciding whether to continue, retry or undo an owned change.
Use an existing idempotency or transaction identifier when the actual interface
provides one; do not claim that a note in RUN.md makes an operation idempotent.
Do not launch an overlapping writer while its predecessor's effect is unknown.
Continue independent work, and record the exact unresolved boundary if it
prevents completion. Resolving uncertainty does not grant extra permissions.
