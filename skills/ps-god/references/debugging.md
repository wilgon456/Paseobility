# Debugging procedure

Use for a reproducible failure, a concrete reported symptom or a performance
regression. The work is mostly building one fast check that fails on this bug;
once it exists, finding the cause is mechanical.

## 1. Build a loop that goes red

Find one command that fails because of this bug and passes when it is gone.
Spend real effort here, before forming theories. Try, roughly in this order:

1. A failing test at the narrowest seam that reaches the bug.
2. A request script (`curl` or similar) against the running service.
3. The CLI with a fixture input, compared with a known-good output.
4. A browser or desktop-automation script on the same surface the user used.
5. A captured payload, log or trace replayed through the code path.
6. A throwaway harness that runs only the failing piece.
7. Many random or repeated inputs when the failure is intermittent.
8. A bisection loop between a good and a bad state (`git bisect run`, versions,
   configurations).
9. The same input through the old and new version, with the outputs diffed.
10. A guided script for a step only a person can perform, last.

Reproduce on the surface where the symptom appeared: another platform, account,
locale, runtime or installed copy can hide it. Then tighten the loop: faster,
an assertion on the specific symptom rather than "did not crash", and
deterministic (fixed time, seeds, isolated files). For an intermittent failure,
raise the reproduction rate (repeat, parallelize, add stress) until it fails
often enough to compare.

Done when you can name the command, have run it, and have seen it fail for the
reported reason. Redact secrets in commands and output. If no loop can be built,
say so, list what was tried, and ask for the missing environment, artifact or
permission instead of guessing; static investigation is still useful but is
not a runtime-proven fix.

Check the loop itself when results look impossible: a broken harness, wrong
working copy or stale install produces convincing failures.

## 2. Find the first divergence

Trace from the input or producer through transport and state to the output, and
locate the first place the system goes wrong. Write each hypothesis with the
smallest observation that could disprove it, then split the remaining space
with the check that eliminates the most. Add temporary logging where state is
unclear. Change one variable at a time and keep confirmed facts apart from
assumptions.

If two fixes built on the same premise have failed, stop fixing. Write the
premise down and test it directly; the premise, not the third fix, is the next
thing to check.

## 3. Fix and prove

Apply the smallest change the evidence justifies, at the first divergence rather
than where the symptom shows. A guard is a fix only when the state it handles is
legitimate. Revert anything a refuted hypothesis motivated.

Run the loop again on the same surface: it must now pass for the right reason.
When the loop is a cheap test, keep it as a regression test and record it
failing before the fix. Check adjacent behavior the fix could affect. Record the
loop command, the failing and passing results, the layer verified and what
remains uncertain in the run record.
