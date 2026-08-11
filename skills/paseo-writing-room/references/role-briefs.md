# Role Briefs

Every agent starts without context. Give each role the Direction Lock, relevant
artifacts, constraints, and exact output contract. Agents must not edit project
files unless artifact persistence was approved.

## Contents

- Provider mapping
- Researcher
- Optional angle agents
- Optional external Writer
- Fact Auditor
- Voice Editor
- Clarity Editor
- Reader

## Provider mapping

| Role | Preference category |
| --- | --- |
| Researcher | `research` |
| Optional Human-first Angle | `planning` |
| Optional Alternative Angle | another available family |
| Optional external Writer | user-selected or `ui` |
| Fact Auditor | `audit` or `research` |
| Voice Editor | `audit`, preferably a different family from the prose author |
| Clarity Editor | `planning` or `audit`, preferably a different family from the prose author |
| Reader | `audit` |

Resolve actual providers through Paseo preferences and provider tools. Do not
hardcode the examples from another skill or reuse an unavailable identifier.
Use separate agents for Fact Auditor, Voice Editor, and Clarity Editor. Prefer
different provider families from the coordinator and from each other when
available; otherwise disclose the limitation. Do not create angle or Writer
agents unless the main skill's opt-in conditions are met.

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

Open every user link. Batch large sets, but merge all batches before returning.
Research searchable factual, contextual, example, counterargument, and public-
perspective gaps. Return personal-experience and voice gaps to the user without
inventing or searching for a replacement. Prefer primary sources for unstable
product claims and attach an access date.

## Optional Human-first Angle

Prioritize the user's content atoms, vocabulary, and desired reader effect.
Return one angle card. Do not write finished prose.

## Optional Alternative Angle

Challenge the obvious structure with a genuinely different tension, opening,
or progression while preserving the same Direction Lock. Return one angle card.
Do not contradict known facts or invent user experiences.

## Optional external Writer

Input: Direction Lock, selected structure, content atoms, voice profile, source
pack when present, document-type guidance, locked passages, and revision brief.

Output:

```text
Draft or requested sections
Section ledger: purpose, plain claim, concrete support, reader takeaway, atoms, sources, new factual claims
Assumptions and placeholders
Locked passages preserved
```

The coordinator owns prose by default. Use this role only when the user asks for
a named model, alternate passage, or delegated draft. The external Writer may
not unlock accepted text or silently change the central direction. It must
receive an approved voice anchor before a full Studio draft. Prefer direct
declarative wording over slogans, repeated antithesis, vague referents, or
abstract transitions unless the approved sample specifically supports those
choices.

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

## Clarity Editor

Input: draft, Direction Lock, section ledger, source ledger when present, and
locked passages. Review without seeing the Writer provider when possible.

For every paragraph, answer:

```text
Literal claim: <one plain sentence, or UNCLEAR>
Named subject and antecedents: <clear | list unresolved words>
Concrete support: <atom, source, example, opinion, or NONE>
Connection to prior paragraph: <specific relation, or MISSING>
```

Return `blocked` when any consequential sentence cannot be paraphrased plainly,
when a pronoun or shorthand has no obvious antecedent, or when a source-dependent
claim uses vague attribution. Flag repeated slogan structures, antithesis,
one- or two-sentence paragraph beats, and transitions that only announce a turn.
Quote every failing excerpt and give a local semantic instruction. Do not polish
or replace the user's voice, and do not rewrite the complete piece.

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

The Reader evaluates reception, not authorship detection. It may not return
`pass` if it cannot summarize the central claim and each major section in plain
language on the first read.
