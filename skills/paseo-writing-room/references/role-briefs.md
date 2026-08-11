# Role Briefs

Every agent starts without context. Give each role the Direction Lock, relevant
artifacts, constraints, and exact output contract. Agents must not edit project
files unless artifact persistence was approved.

## Contents

- Provider mapping
- Researcher
- Angle agents
- Writer
- Fact Auditor
- Voice Editor
- Reader

## Provider mapping

| Role | Preference category |
| --- | --- |
| Researcher | `research` |
| Human-first Angle | `planning` |
| Alternative Angle | `ui` or another available family |
| Writer | `ui` |
| Fact Auditor | `audit` or `research` |
| Voice Editor | `audit`, preferably a different family from Writer |
| Reader | `audit` |

Resolve actual providers through Paseo preferences and provider tools. Do not
hardcode the examples from another skill or reuse an unavailable identifier.
Use separate agents for Fact Auditor and Voice Editor. Prefer different provider
families for them when available; otherwise disclose the limitation.

## Researcher

Input: Direction Lock, every supplied link, relevant content atoms, current
date.

Output:

```text
Source ledger with access state
Verified claim table: claim, URL, support, caveat, confidence
Contradictions and missing context
Facts that must remain qualified
Source-supported content atoms
No finished prose
```

Open every user link. Batch large sets, but merge all batches before returning.

## Human-first Angle

Prioritize the user's content atoms, vocabulary, and desired reader effect.
Return one angle card. Do not write finished prose.

## Alternative Angle

Challenge the obvious structure with a genuinely different tension, opening,
or progression while preserving the same Direction Lock. Return one angle card.
Do not contradict known facts or invent user experiences.

## Writer

Input: Direction Lock, selected angle, content atoms, voice profile, source pack
when present, document-type guidance, locked passages, and revision brief.

Output:

```text
Draft or requested sections
Section ledger: purpose, atoms, sources, new factual claims
Assumptions and placeholders
Locked passages preserved
```

The Writer owns prose. It may not unlock accepted text or silently change the
central direction.

## Fact Auditor

Input: draft, source ledger, section ledger, current date.

Check only:

- support for material claims
- quotation accuracy and attribution
- dates, names, numbers, and current information
- caveats, contradictions, and inaccessible sources
- invented real-world details

Return `pass`, `revise`, or `blocked`, followed by exact excerpt, source, issue,
and required action. Do not rewrite for style.

## Voice Editor

Input: draft, Direction Lock, content atoms, voice profile with sample evidence,
calibration decision, and locked passages. Do not reveal the Writer provider
when avoidable.

Check only:

- fidelity to user direction and approved calibration
- generic or inflated language
- paragraph and sentence rhythm
- cultural/register flattening
- explanation that replaces the user's perspective
- revision-induced tone drift

Return exact excerpts and local revision instructions. State what must remain
unchanged. Do not rewrite the whole piece and do not add artificial mistakes,
random slang, or unsupported personal details.

## Reader

Input: draft, intended reader, desired effect, and document type. Do not provide
the internal agent discussion unless needed for factual context.

Return:

```text
What I think the piece is saying
Where attention rises or drops
What is confusing or unearned
What feels specific and memorable
Likely reader response or action
One highest-value change, or pass
```

The Reader evaluates reception, not authorship detection.
