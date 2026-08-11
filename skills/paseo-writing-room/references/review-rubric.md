# Editorial Review Rubric

Review the draft against its Direction Lock, source state, content atoms, voice
profile, calibration decision, and intended reader. Separate factual,
voice-level, and reader-response judgments.

## Contents

- Shared blocking checks
- Fact Auditor rubric
- Voice Editor rubric
- Reader rubric
- Combined decision

## Shared blocking checks

Return `blocked` when any of these remain:

- the central direction is missing or contradicts the user's latest decision
- a material factual claim is unsupported or contradicted by reliable evidence
- a source is cited for a claim it does not support
- personal experience, quotation, customer, statistic, or event was invented
- an accepted locked passage changed without approval
- the document violates a required format or publication rule
- private or sensitive information appears without a clear need

## Fact Auditor rubric

For each externally verifiable claim that matters:

1. Locate it in the section ledger.
2. Locate support in the source ledger.
3. Confirm that the source supports the precise wording and context.
4. Check dates, names, numbers, quotation boundaries, and instability.
5. Preserve caveats and contradictions.
6. Mark claims based only on model memory as unsupported.

Output:

```text
Verdict: pass | revise | blocked
Claim ID or excerpt:
Source:
Problem:
Required action: retain | qualify | cite | research | remove | ask user
```

Do not rewrite for tone or elegance.

## Voice Editor rubric

Score each dimension from 1 to 5. Use `not applicable` instead of inventing a
score when no sample or calibration evidence exists.

| Dimension | Review question |
| --- | --- |
| Direction fidelity | Does the piece express the user's selected idea and effect? |
| Atom use | Does it use supplied material instead of generic filler? |
| Voice evidence | Does it match observable sample or calibration choices? |
| Specificity | Are important points grounded in earned detail? |
| Rhythm | Do sentence and paragraph choices feel deliberate rather than uniform? |
| Register | Is cultural, professional, and emotional distance appropriate? |
| Continuity | Did revisions preserve accepted tone and locked passages? |

Flag exact excerpts for:

- generic openings that could introduce any topic
- repeated list patterns or identical paragraph rhythms
- abstract nouns where a concrete actor or scene is available
- unnecessary restatement of headings
- inflated transitions and importance claims
- conclusions that only summarize prior sections
- unexplained tone shifts
- polish that erases user vocabulary or meaningful irregularity
- invented slang, quirks, memories, or errors added to appear human

Output:

```text
Verdict: pass | revise | human-decision
Scores with evidence:
Required local revisions:
Optional revisions:
Keep unchanged:
Locked passages checked:
```

Diagnose; do not rewrite the entire piece.

## Reader rubric

Evaluate without guessing whether AI was involved.

```text
What I think the piece says:
Where attention rises:
Where attention drops:
What feels specific or memorable:
What feels confusing, generic, or unearned:
Likely reader response:
Highest-value change: <one change or pass>
```

The Reader does not score source correctness unless a visible inconsistency
breaks trust.

## Combined decision

The coordinator merges reviews without averaging away blockers.

Return `ready-for-human` only when:

- no shared blocker remains
- Fact Auditor passes, when factual review applies
- Voice Editor has no required revision
- Reader has no major comprehension failure
- locked passages are accounted for
- the review-loop budget has not been exceeded

When reviewers disagree on taste, present the tradeoff to the user. Do not let
another agent settle a subjective voice decision on the user's behalf.

AI-detector scores are not part of this rubric. Deterministic script findings
are evidence to inspect, not automatic failures.
