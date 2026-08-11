# Coauthoring Harness

Use these compact records to keep human thinking visible throughout the writing
process. Do not turn every field into a required question.

## Contents

- Direction Lock
- Content atoms
- Research Gap Map
- Voice profile
- Optional angle cards
- Continuous draft record
- Writer/editor exchange
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

## Continuous draft record

Keep the harness behind the conversation. The normal flow is:

```text
User supplies an experience or opinion
-> coordinator confirms the useful detail
-> coordinator verifies any external fact in the background
-> Lead Writer writes the complete draft
-> Adversarial Editor critiques exact passages
-> Lead Writer patches the draft
-> Adversarial Editor verifies the patch
-> user receives the reviewed draft
```

Prefer concrete chronology and named tools, events, or decisions. For example,
if the user says they began with one model and later divided work among several
services, draft that progression directly. Do not open with a universal slogan,
invent a theory of model specialization, or show the user an atom table first.

Ask one personal follow-up only when proceeding would invent or materially
misstate the user's experience. Questions such as "What did you use it for?"
are useful when that answer controls the piece; asking the user to fill every
intake field again is not.

Connective prose must not add an inferred motive, emotion, habit, causal story,
or retrospective interpretation. If the user names several tools and uses, it
is safe to state the sequence and uses. It is not safe to claim the separation
"happened naturally" or "was intentional" without user support.

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

## Writer/editor exchange

```text
Round: 1 | 2
Writer model family:
Editor model family:
Editor findings: excerpt | lane | severity | required action
Writer response: accept | partly accept | reject with reason
Patched sections:
Verification: pass | blockers remain
Verified candidate hash or identifier:
New issues introduced:
```

Keep this exchange internal unless the user asks to see it. The Editor does not
rewrite the complete piece. The Writer cannot dismiss a factual or clarity
blocker merely as a matter of taste. Stop after the second round and disclose
any unresolved blocker instead of looping indefinitely.

Freeze the article after a passing verification. Provider and source metadata
may be appended outside the article, but any article edit requires another
verification of the exact changed candidate.

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
Reason: explicitly-user-locked | user-authored-verbatim | legally required | source-sensitive
Can unlock when:
```

Only create a lock when the user explicitly marks wording to preserve, supplies
verbatim required language, or a legal/source constraint requires it. Ordinary
silence or missing passage feedback does not create a lock. Editors may flag a
locked passage but cannot silently rewrite it. Verified factual or safety
problems return to the user for a decision.
