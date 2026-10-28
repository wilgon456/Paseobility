# Playbooks

Pick the one playbook that matches the task and copy its steps into the run's
TODO. They are starting orders, not ceremonies: drop a step that cannot change
the outcome and record why. A task that spans several, such as a bug fix that
ships, runs them in sequence.

## Investigation

A question to answer, with no change requested ("how does X work", "why is Y
like this", "are we sure").

1. Restate the question and what would settle it.
2. Read the code, history and runtime that bear on it. Prefer observing behavior
   over inferring it when a cheap run exists.
3. Answer with evidence: paths, commands and outputs. Separate what was observed
   from what was inferred, and say what would change the answer.

Do not edit the subject of the investigation.

## Bug fix

1. Build a loop that goes red on the reported surface
   ([debugging](debugging.md) step 1). Ask the user only for what the loop cannot
   reach.
2. Find the first divergence and confirm the mechanism with runtime evidence.
3. Make the smallest fix at that point. Keep the loop as a regression test when
   it is cheap, recorded failing before the fix.
4. Run the loop again on the same surface, then adjacent checks.

Report what was broken, the cause, the fix, and the failing and passing output.

## Change

New or changed behavior, or a behavior-preserving restructuring.

1. Name the data shape and the boundary the change crosses before writing logic.
   For shared APIs, persisted data or coordinated work, use
   [change boundaries](change-boundary.md).
2. Remove what the change makes dead before adding to it; prefer the smallest
   design that meets the criteria.
3. Split the work into units that each end in a check, and verify each before the
   next. A restructuring keeps the existing behavior checks green throughout.
4. Check the result where users meet it: the real UI, CLI, installed copy or
   platform, not only unit tests. When it must work on several platforms,
   check each one or say which were not checked.

## Ship

Taking a change through review to merged, released or deployed, as far as the
user asked.

1. Open the PR with the goal, the change and the evidence. Keep unrelated edits
   out.
2. Wait for CI without polling faster than it changes. Read a failure before
   rerunning it; a flaky rerun needs a stated reason.
3. Verify independently before merging: green CI is necessary, not sufficient.
   Confirm the checks covering the change actually ran rather than being
   skipped, and review the final diff once.
4. Merge only what the user asked to land. Then deploy or release in the
   project's documented way, confirming idle or safe boundaries first.
5. Check the deployed or installed result on the real target, not only the
   merged source. Clean up branches, worktrees and temporary files you created.

Stop before an irreversible step the user did not ask for: force-push, deleting
shared data, publishing, or sending something outside the project.

Sources: the playbook structure and the "loop that goes red" debugging method
adapt ideas from pstack (Lauren Tan, MIT) and mattpocock/skills (Matt Pocock,
MIT), rewritten for this skill.
