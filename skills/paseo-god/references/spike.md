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
