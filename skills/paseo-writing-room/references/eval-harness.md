# Evaluation Harness

Evaluate the workflow, not only the final prose. AI-detector scores are not an
acceptance metric.

## Contents

- Test matrix
- Deterministic assertions
- Review graders
- Human ratings
- Regression process

## Test matrix

Maintain representative cases across:

| Dimension | Cases |
| --- | --- |
| Sources | none, one, several, large batch, inaccessible |
| Input | topic only, direction only, notes, rough draft, voice samples |
| Format | article, report, proposal, script, social, fiction |
| Stakes | quick/low, public, factual, sensitive |
| Mode + depth | Creative + Quick, Source-guided + Studio, Revision + Quick, Revision + Studio |
| Feedback | accept, local rewrite, direction change, unlock passage |
| Providers | cross-provider available, one provider only, unavailable role |

Include real user-shaped cases and rare costly failures. Run multiple trials
for mode selection, questions, agent routing, and review because outputs vary.

## Deterministic assertions

- topic or direction is present before drafting
- every supplied link has an access-state record
- no source is marked read when access failed
- source-guided mode creates a Researcher
- creative mode does not create a Researcher without a factual need
- Studio mode records calibration status
- user-approved locked passages survive revisions byte-for-byte unless unlocked
- review and patch passes together do not exceed two per human revision cycle
- publishing actions never occur without explicit confirmation
- every created test agent is archived; unrelated agents/workspaces are untouched

Resolve `scripts/writing-check.js` relative to the skill directory and run it
against saved draft fixtures. Treat its findings as regression signals, not
absolute quality judgments.

## Review graders

Keep grader responsibilities separate:

- factual/source grader
- direction and constraint grader
- voice-profile grader
- intended-reader grader

Require exact excerpts and evidence for failures. Prefer a provider family that
did not write the draft. For pairwise comparisons, swap candidate order and
investigate inconsistent judgments. Regularly audit model graders against human
labels.

## Human ratings

Use the user or a representative reader for subjective dimensions:

```text
Ownership: this expresses what I meant
Voice: this sounds like me or the voice I chose
Specificity: this contains concrete, earned detail
Trust: I can stand behind the facts and claims
Effect: it creates the intended reader response
Revision burden: how much I still need to rewrite
```

Store accepted examples as a small golden set. Preserve rejected outputs and
label the failure mode instead of keeping only successful samples.

## Regression process

1. Specify the behavior being changed.
2. Add or update cases before changing instructions.
3. Run baseline and candidate with the same task, context, tool access, and
   bounded budget.
4. Compare deterministic assertions, grader results, human ratings, latency,
   agent count, and revision count.
5. Inspect traces for accidental shortcuts or skipped gates.
6. Add new failure modes to the matrix and rubric.

Do not claim broad writing quality from one successful demo or one model run.
