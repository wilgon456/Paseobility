# Coauthoring Harness

Use these compact records to keep human thinking visible throughout the writing
process. Do not turn every field into a required question.

## Contents

- Direction Lock
- Content atoms
- Research Gap Map
- Voice profile
- Conversational passage loop
- Optional angle cards
- Human voice anchor
- Locked passages

## Direction Lock

```text
Topic or direction:
Intended reader:
Desired reader effect:
Document type:
Approximate length:
Content mode: source-guided | creative | revision
Depth: quick | studio
Must include:
Must avoid:
Supplied links:
Supplied notes/draft/samples:
Assumptions:
```

Only `Topic or direction` is always required.

## Content atoms

An atom is a small unit that can survive outline and prose changes.

```text
ID: A01
Origin: user-supplied | source-supported | agent-proposed | placeholder
Content: <observation, scene, claim, phrase, fact, or tension>
Why it matters: <role in the piece>
Evidence: <user message, source URL, or none>
Safe use: fact | opinion | memory | fictional element | needs confirmation
```

Rules:

- Preserve the user's distinctive wording when it carries meaning.
- Do not convert `agent-proposed` into `user-supplied`.
- Ask for confirmation before using a placeholder as a real event or belief.
- Use atoms to compare angle options and detect generic filler.

## Research Gap Map

```text
Gap ID: G01
Type: personal | current-fact | background | example | counterargument | public-perspective | voice
Question:
Why it matters:
Action: ask-user | web-search | agent-proposal | omit
Preferred source type:
Freshness requirement:
Evidence needed:
Status: open | supported | contradicted | blocked | omitted
Resulting atom or placeholder:
```

Searchable gaps receive at most one focused pass and one refinement by default.
Personal and voice gaps never become researched substitutes for the user's own
experience or judgment.

## Conversational passage loop

Keep the harness behind the conversation. The normal visible exchange is:

```text
User supplies an experience or opinion
-> coordinator confirms the useful detail
-> coordinator verifies any external fact in the background
-> coordinator writes two to four usable paragraphs
-> user accepts or requests a local change
-> accepted passage is locked
-> coordinator continues
```

Prefer concrete chronology and named tools, events, or decisions. For example,
if the user says they began with one model and later divided work among several
services, draft that progression directly. Do not open with a universal slogan,
invent a theory of model specialization, or show the user an atom table first.

Ask one personal follow-up only when it unlocks the next passage. Questions such
as "What did you use it for?" are useful; asking the user to fill every intake
field again is not.

Connective prose must not add an inferred motive, emotion, habit, causal story,
or retrospective interpretation. If the user names several tools and uses, it
is safe to state the sequence and uses. It is not safe to claim the separation
"happened naturally" or "was intentional" without user support.

End ordinary passage turns with the prose or one conversational question. Keep
calibration rubrics internal unless the user needs help naming what feels wrong.

Do not convert each note sentence into a separate one-sentence paragraph. Group
details that belong to the same moment, use, or decision. When there is enough
material, at least one paragraph should contain two or more connected sentences
so the result reads as prose rather than reformatted notes.

## Voice profile

Build from the user's own samples when available.

```text
Basis: sample-based | direction-based
Samples used:
Perspective and distance:
Register:
Sentence rhythm:
Paragraph rhythm:
Vocabulary to preserve:
Typical transitions:
Humor or emotional register:
Punctuation habits:
Useful irregularities:
Avoid:
Uncertain observations:
```

For every sample-based observation, retain a short supporting excerpt. Do not
infer identity, personality, education, age, ethnicity, or private facts.

## Angle cards

```text
Angle ID:
Controlling idea:
Opening move:
Progression:
Atoms used:
Sources used:
Distinctive choice:
Risk or tradeoff:
```

Reject an angle set when options differ only in title, ordering, or adjectives.

## Human voice anchor

Use one representative opening or section before the full Studio draft.

```text
Calibration sample:
Author: coordinator | user-requested provider
Assumptions used:
Preflight: pass | retry | discarded
Preflight blockers:
User response:
Profile updates:
Lines to lock:
Lines to revise:
Meaning clear on first read: yes | no
Referents and source names clear: yes | no
Gate: approved | revise | explicitly-skipped-by-user
```

Ask concrete choices instead of a broad quality question. One focused feedback
turn is normally enough; allow a second only when the direction remains wrong.
An unambiguous response such as "좋다", "이런 식으로", or a direct acceptance
sets the gate to `approved`; do not ask for a redundant confirmation.

## Section ledger

```text
Section ID:
Purpose:
Plain-language claim:
Concrete support: atom ID | named source | example | scene | explicit opinion
Intended reader takeaway:
New factual claims:
Locked text:
```

If `Plain-language claim` cannot be completed without copying a slogan from the
draft, the section is not ready to write.

## Locked passages

```text
Lock ID:
Exact text or section identifier:
Reason: user-approved | user-authored | legally required | source-sensitive
Can unlock when:
```

Reviewers may flag a locked passage but cannot silently rewrite it. Verified
factual or safety problems return to the user for a decision.
