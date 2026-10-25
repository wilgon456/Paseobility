# Spike procedure

Use when one technical uncertainty prevents a sound implementation choice.

1. Name the decision and the unknown that matters. Define success/failure
   observations and a small time, attempt or cost budget suited to the task.
2. Consult authoritative documentation or existing code for the unknown.
   Build an isolated minimal experiment only if reading cannot settle it.
3. Test the actual disputed property. Save the command, version, result and
   artifact path. Do not mistake a toy experiment for production readiness.
4. Stop when the observation settles the decision or the budget is exhausted.
   Record the chosen approach and its limits, or the exact remaining unknown.
5. Carry justified findings into the implementation TODO. Keep experimental
   files out of production unless their inclusion is intentional and reviewed.

Unsettled experiments leave a pending criterion; they do not count as a
completed implementation or silently extend into continuous monitoring.

For a comparison or claimed improvement, keep the baseline, inputs, evaluator
and material environment fixed across candidates. Define the metric, direction,
minimum useful difference and correctness constraints before choosing a winner.
Retain failed and unavailable trials rather than reporting only the best run.
Separate a candidate defect from an evaluator failure or missing measurement;
unavailable evidence is inconclusive, not a passing or losing score.

Reserve a proportionate confirmation check for the selected candidate when the
conclusion depends on measurement or repeated trials. Use a fresh run, or a
separate representative input when generalization is claimed. Do not tune on
that confirmation and still call it independent. Report an inconclusive or
limited result when noise, missing data or the budget prevents the promised
comparison. A chosen approach does not by itself prove an implementation or
authorize promoting a generated skill.
