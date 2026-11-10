# Independent review before completion

Use only for an explicitly invoked ps-god durable run, after the worker's own
checks pass. A compact run or ordinary request does not acquire a reviewer.

## Select and launch one reviewer

Read Paseo's current profile list and every profile's notes. Prefer an available
profile whose notes designate independent review, provided both its provider
and its model family differ from the worker's. Compare actual model families:
two provider adapters can serve the same family. If the worker is Codex, choose
a different family rather than another GPT model on a different adapter.

If no eligible review profile exists, use current provider/model discovery to
choose an available different provider and family. Do not guess model IDs or
require a machine-specific profile name. If none is available, say
"Independent review unavailable: no eligible different-provider/model-family reviewer."
and finish with the worker's checks. Report a launch, quota or tool failure as
unavailable review, not as no findings; do not retry it indefinitely.

Use the installed base Paseo skill or current tool schemas for launch details.
Materialize the chosen profile's provider/model and any mode, thinking and
feature settings into the agent call; there is no assumed profile argument.
Use a supported read-only mode when available. Give the reviewer the actual
work path and a separate read-only role. Pause edits while it checks the files;
another writer changing them invalidates the review's basis.

## Reviewer brief

Supply the following brief with the actual task statement, acceptance criteria,
work path and changed-file list filled in. Include applicable project constraints
and existing check commands. Share requirements and artifacts, not the worker's
reasoning or a desired verdict.

> Independently review this work against the supplied task and acceptance
> criteria. Read the changed files and relevant callers/tests in the work path,
> and run the existing checks without editing files. Preserve unrelated work;
> use the supplied scope and constraints. Look for concrete contract defects:
> unhandled edge cases, wrong error behavior, violated invariants, or tests that
> fail to exercise what they claim. Do not rewrite the solution or offer style
> opinions. Return a list of findings. For each, give file and line, severity,
> what is wrong, and a reproducible input/command with expected versus observed
> behavior. Distinguish an untested concern from an observed defect. If there
> are none, explicitly return "no findings" and the checks run and their limits.

## Verify claims and close the loop

Treat each finding as a claim. Reproduce it against the current files before
editing. Fix confirmed in-scope defects and re-run the affected checks plus the
worker's completion verification. Record unconfirmed claims and the evidence
or reason for rejecting them; do not count them as fixes.

Use a second and final exchange with the same reviewer only when fixes or
unresolved claims need a recheck. Supply the updated changed files and check
evidence. Never request a third round. Report findings still open after the
second, and leave any unmet acceptance criterion unfinished. Record the actual
reviewer agent/provider/model, review rounds, findings and dispositions in the
existing RUN.md; the record helper needs no new metadata field. Include the
review outcome and final verification in the handback. Archive only helpers
this run owns when their work is complete.
