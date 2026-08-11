# Editorial Review Rubric

Review the draft against its Direction Lock, source state, content atoms, voice
profile, and intended reader. The Adversarial Editor evaluates each lane
separately instead of averaging concerns together.

## Contents

- Shared blocking checks
- Fact lane
- Voice lane
- Clarity lane
- Reader lane
- Combined decision

## Shared blocking checks

Return `blocked` when any of these remain:

- the central direction is missing or contradicts the user's latest decision
- a material factual claim is unsupported or contradicted by reliable evidence
- a source is cited for a claim it does not support
- personal experience, quotation, customer, statistic, or event was invented
- a first-person motive, habit, or retrospective interpretation has no direct
  user atom, even when it seems inferable from chronology
- an explicitly locked passage changed without approval
- the document violates a required format or publication rule
- private or sensitive information appears without a clear need

## Fact lane

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

## Voice lane

Score each dimension from 1 to 5. Use `not applicable` instead of inventing a
score when no sample or direction evidence exists.

| Dimension | Review question |
| --- | --- |
| Direction fidelity | Does the piece express the user's selected idea and effect? |
| Atom use | Does it use supplied material instead of generic filler? |
| Voice evidence | Does it match observable samples or explicit direction? |
| Specificity | Are important points grounded in earned detail? |
| Rhythm | Do sentence and paragraph choices feel deliberate rather than uniform? |
| Register | Is cultural, professional, and emotional distance appropriate? |
| Continuity | Did revisions preserve established tone and explicit locks? |

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
- four or more consecutive short declarative sentences that create staccato
  rhythm without voice-sample support

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

## Clarity lane

Meaning comes before elegance. Review each paragraph without rewarding
quotable-sounding language.

Return `blocked` for:

- a consequential sentence that cannot be paraphrased into one plain claim
- a pronoun, shorthand, or category such as `그쪽`, `어떤 쪽`, or `한 글` whose
  referent is not obvious in the same or previous paragraph
- a source-dependent statement that does not name or cite the source
- a paragraph with no claim, evidence, example, scene, decision, or useful link
  to the surrounding argument
- a transition that announces contrast or conclusion but adds no meaning
- a conclusion that re-lists three or more body examples without a supported
  decision, implication, or reader action

Flag as `revise` when the draft repeatedly relies on antithesis, slogans,
fragment-like paragraph beats, abstract nouns, or restated thesis sentences.
One deliberate instance may be valid; repetition without voice-sample evidence
is the failure.

Output:

```text
Verdict: pass | revise | blocked
Excerpt:
Plain paraphrase: <meaning or UNCLEAR>
Unresolved referent or missing support:
Required semantic change:
Preserve unchanged:
```

Do not solve unclear meaning by adding decorative transitions. Route factual
questions to the Fact lane and unresolved subjective voice choices to the user.

## Reader lane

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

The Adversarial Editor combines its lane verdicts without averaging away
blockers.

Return `ready-for-human` only when:

- no shared blocker remains
- Fact lane passes, when factual review applies
- Voice lane has no required revision
- Clarity lane passes
- Reader lane has no major comprehension failure
- locked passages are accounted for
- the review-loop budget has not been exceeded
- the verified candidate is exactly the article text returned to the user

When Lead Writer and Editor disagree on taste, preserve the Writer's choice and
report the tradeoff only when it materially affects the user's direction. Do
not let the Editor settle a subjective voice decision on the user's behalf.

AI-detector scores are not part of this rubric. Deterministic script findings
are evidence to inspect, not automatic failures.
