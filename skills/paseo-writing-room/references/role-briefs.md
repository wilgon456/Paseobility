# Role Briefs

Every agent starts without context. Give each role the Direction Lock, relevant
artifacts, constraints, and exact output contract. Agents must not edit project
files unless artifact persistence was approved.

## Contents

- Provider mapping
- Researcher
- Lead Writer
- Adversarial Editor
- Optional specialist

## Provider mapping

| Role | Preference category |
| --- | --- |
| Researcher | `research` |
| Lead Writer | current coordinator, otherwise `ui` or user-selected |
| Adversarial Editor | `audit` or `planning`, from another family when available |
| Optional factual specialist | `research` or `audit` |

Resolve real providers through Paseo preferences and provider tools. Do not
hardcode identifiers. Prefer distinct provider families for Lead Writer and
Adversarial Editor. If the coordinator's family is known, it may be the Lead
Writer and only one editor agent is necessary. If the family is unknown, create
separate Writer and Editor agents. If only one family is available, use two
independent agents or passes and disclose that review was not cross-provider.

## Researcher

Input: Direction Lock, Research Gap Map, every supplied link, relevant content
atoms, current date.

Output:

```text
Source ledger with access state
Verified claim table: claim, URL, support, caveat, confidence
Contradictions and missing context
Facts that must remain qualified
Source-supported content atoms
Gap status updates: supported, contradicted, blocked, or omitted
No finished prose
```

Open every user link. Batch large sets, but merge all batches before drafting.
Return personal-experience and voice gaps to the coordinator without inventing
or searching for replacements. Prefer primary sources for unstable claims and
attach an access date. Reuse the Adversarial Editor as Researcher when practical
to keep the default workflow to two model families.

## Lead Writer

Input: Direction Lock, selected structure, content atoms, voice profile, source
pack, document-type guidance, explicit locked passages, and revision brief.

First output:

```text
Complete draft
Section ledger: purpose, plain claim, concrete support, reader takeaway, atoms, sources, new factual claims
Assumptions and placeholders
Explicit locks preserved
```

Revision output:

```text
Finding response: accept | partly accept | reject with reason
Patched complete draft
Sections changed and why
New claims added or removed
Explicit locks preserved
```

The Lead Writer owns the prose throughout the run. It may not invent the user's
experience or replace the direction with a generic thesis. It must address every
blocking Editor finding. A rejection needs concrete source, meaning, or voice
evidence; provider preference is not a reason.

Do not pad to a requested word or character count. If available atoms cannot
support the target without repetition or invention, return the strongest
shorter draft and flag the tradeoff for the final response.

## Adversarial Editor

Input: draft, Direction Lock, content atoms, voice profile, source ledger,
section ledger, explicit locks, current date, and any prior finding responses.
Judge the text rather than provider reputation.

Review four lanes separately:

### Fact

- source support, quotations, dates, names, numbers, and caveats
- contradictions, inaccessible sources, and invented real-world details
- user experience incorrectly presented as a universal fact

### Voice

- fidelity to supplied wording, samples, direction, and emotional distance
- generic or inflated language, rhythm flattening, and over-explanation
- unsupported motive, feeling, habit, or retrospective interpretation
- first-person retrospective phrases such as "처음부터 그러려던 건 아니다"
  unless a user atom directly supports them

### Clarity

- literal meaning, named subjects, antecedents, attribution, and paragraph logic
- slogans, repeated antithesis, abstract transitions, and reformatted-note rhythm
- whether each material paragraph has a plain claim and concrete support
- conclusions that repeat three or more earlier examples without adding meaning

### Reader

- central point understood on first read
- attention drops, unearned conclusions, and likely reader response
- one highest-value improvement when no blocker remains

Return:

```text
Verdict: pass | revise | blocked
Findings: lane | severity | exact excerpt | evidence | required local action
What must remain unchanged
No complete rewrite
```

On verification, inspect the patches and nearby transitions. Confirm which
blockers resolved, identify regressions, and return `pass` when no blocker
remains. Do not manufacture disagreement to force another round.

Verify the exact candidate that will be shown to the user. Return a stable hash
or an unambiguous complete-candidate identifier with the verdict. If article
text changes after verification, the prior verdict is invalid; verify again.

## Optional specialist

Use an additional specialist only for high-stakes factual, legal, safety, or
domain review, or when the user explicitly requests more models. Give it a
narrow contract and feed its findings through the same Lead Writer response
step. Ordinary public writing should remain a two-model writer/editor workflow.
