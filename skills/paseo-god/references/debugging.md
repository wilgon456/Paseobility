# Debugging procedure

Use for a reproducible failure or a concrete reported symptom.

1. Capture the trigger, expected result, actual result and affected boundary.
   Read the relevant failure/log once; preserve user data and unrelated edits.
2. Trace the path from input/producer through transport/state to the observed
   output. Locate the first divergence before changing downstream symptoms.
3. Write one hypothesis and the smallest observation that could disprove it.
   Separate confirmed facts from assumptions. Run that check, then update the
   hypothesis from its result; avoid changing several variables at once.
4. Apply the smallest fix that addresses the proven cause. Add a regression
   test when it exercises a meaningful failure, not just implementation shape.
5. Reproduce the original trigger and check relevant adjacent behavior. Record
   the layer verified and remaining uncertainty in the run record.

If the symptom cannot be reproduced, capture the missing condition and do
useful static investigation without reporting a fix as runtime-proven.
