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
| Research gaps | personal experience, current product fact, background, example, counterargument, conflicting evidence |
| Input | empty invocation, topic only, direction only, partial intake, notes, rough draft, voice samples |
| Format | article, report, proposal, script, social, fiction |
| Stakes | quick/low, public, factual, sensitive |
| Mode + depth | Creative + Quick, Source-guided + Studio, Revision + Quick, Revision + Studio |
| Feedback | accept, local rewrite, direction change, unlock passage |
| Providers | cross-provider available, one provider only, unavailable role |
| Korean failure modes | repeated antithesis, vague referents, unnamed sources, slogan opening, uniform short paragraphs |
| Coauthoring | personal chronology, incremental acceptance, local rejection, external-writer opt-in |

Include real user-shaped cases and rare costly failures. Run multiple trials
for mode selection, questions, agent routing, and review because outputs vary.

## Deterministic assertions

- topic or direction is present before drafting
- an empty invocation returns one intake card and creates no agents or draft
- supplied intake fields are not requested again
- intended reader and links remain optional
- every supplied link has an access-state record
- no source is marked read when access failed
- personal-experience and voice gaps are never filled from web research
- material factual or contextual gaps trigger targeted research without an extra user request
- unstable claims record source and access date
- every researched claim is labeled `source-supported`, not `user-supplied`
- weak or contradictory evidence is qualified, omitted, or returned to the user
- source-guided mode creates a Researcher
- creative mode does not create a Researcher without a factual need
- Studio mode cannot expand beyond the voice-anchor passage without `approved` or `explicitly-skipped-by-user` calibration status
- the coordinator produces the first voice-anchor passage by default
- no angle or Writer agent is created before the passage loop unless explicitly requested
- an unambiguous user acceptance approves the voice anchor without another gate
- internal atom, gap, and angle records stay hidden unless requested
- ordinary passage turns do not append rating forms or calibration checklists
- connective prose adds no unsupported motive, feeling, habit, or causal story
- passage drafting does not map each supplied sentence to its own paragraph
- when enough material exists, at least one passage paragraph has two or more connected sentences
- accepted passages are locked before the next section is drafted
- calibration candidates with placeholders or clarity blockers are rejected before the human gate
- long-form or public Studio work receives a Clarity Editor verdict
- every section ledger records a plain claim, concrete support, and reader takeaway
- unclear antecedents and vague source attribution cannot receive `ready-for-human`
- user-approved locked passages survive revisions byte-for-byte unless unlocked
- review and patch passes together do not exceed two per human revision cycle
- publishing actions never occur without explicit confirmation
- every created test agent is archived; unrelated agents/workspaces are untouched

Include a personal-essay regression in which a user first relies on one tool,
then explains distinct uses for several others. The expected result should name
the actual sequence and uses in ordinary first-person prose. Reject outputs that
replace the experience with a generic model-ranking essay, a visible content-
atom table, an appended evaluation form, an inferred motive such as "it divided
naturally," uniform one-sentence paragraph formatting, or an unsupported theory
about why all users subscribe.

Resolve `scripts/writing-check.js` relative to the skill directory and run it
against saved draft fixtures. Treat its findings as regression signals, not
absolute quality judgments.

## Review graders

Keep grader responsibilities separate:

- factual/source grader
- direction and constraint grader
- voice-profile grader
- literal clarity and antecedent grader
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
