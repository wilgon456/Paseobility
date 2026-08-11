---
name: paseo-writing-room
description: >-
  Run a human-directed multi-agent writing room for source-guided or creative
  writing. Use for articles, essays, newsletters, reports, proposals, press
  releases, speeches, scripts, social threads, website copy, letters, email,
  and fiction when the user supplies a topic or direction plus any number of
  optional links, notes, samples, or drafts. Builds human content atoms and an
  evidence-based voice profile, explores distinct angles before prose, uses an
  early voice-calibration gate, drafts by section, separates fact/voice/reader
  review, preserves accepted passages, and applies bounded patch revisions.
---

# Paseo Writing Room

Produce writing that preserves the user's actual thinking and voice. Do not
optimize for AI-detector scores or pretend that superficial variation proves
human authorship. Optimize for ownership, specificity, source fidelity,
readability, and deliberate stylistic choices.

Load these resources as needed:

- `references/document-types.md` for the selected format
- `references/coauthoring-harness.md` before intake and drafting
- `references/role-briefs.md` before creating Paseo agents
- `references/review-rubric.md` before review
- `references/workspace-artifacts.md` when saving workflow state
- `references/eval-harness.md` when validating or changing this skill

## Invocation intake

When the user invokes `/paseo-writing-room` without a usable assignment, do not
guess a topic, browse, or create agents. Reply in the user's language with one
compact intake card:

```text
무엇을 쓸까요?

- 주제 또는 방향 (필수, 둘 중 하나만 있어도 됨):
- 예상 독자 (선택):
- 참고 링크 (선택, 개수 제한 없음. 없으면 "없음"):
- 원하는 형식이나 길이 (선택):
```

This is one intake prompt, not four required question rounds. Only topic or
direction is mandatory. Intended reader, links, format, and length improve the
result but may be omitted. If the user already supplied any field, extract it
and never ask them to repeat it. Ask only for missing information that would
materially change the piece; otherwise state a low-risk assumption and continue.

## Operating modes

Select one content mode and one execution depth.

| Content mode | Select when | Researcher |
| --- | --- | --- |
| Source-guided | One or more links are supplied | Required |
| Creative | No links are supplied | Only for requested or necessary facts |
| Revision | A draft is supplied | Only for factual verification |

There is no minimum or maximum link count. In source-guided mode, process every
supplied link. If the set is large, use batches and merge one complete source
ledger before drafting. Never silently drop links.

| Depth | Select when |
| --- | --- |
| Quick | Short, low-stakes work; the user requests speed; voice calibration or multi-agent review would add little value |
| Studio | Long-form, public, high-stakes factual or persuasive, strongly voice-sensitive, or iterative work |

Quick mode may collapse angle exploration and calibration, but it must still
respect the user's direction, sources, factual integrity, and final approval.
Studio mode uses the full workflow below.

Choose content mode and depth independently. A short poem or caption can be
`Creative + Quick`; a sourced public statement can be `Source-guided + Studio`.
For `Revision`, choose depth from the draft's stakes, length, voice sensitivity,
and requested review intensity rather than from the fact that a draft exists.

## Non-negotiable input

Require at least one of:

- a topic
- a direction, thesis, scene, question, or intended message

If neither exists, show the invocation intake card and stop. Everything else is
optional. Outside the single intake card, ask no more than three questions in
one message, and only when an answer would materially change the result. If
assumptions are low-risk, state them briefly and continue.

## Studio workflow

```text
Direction Lock
-> Human Material Pack
-> optional Source Ledger
-> Angle Options
-> Human Angle Gate
-> Voice Calibration Sample
-> Human Voice Gate
-> Section Drafting
-> Fact + Voice + Clarity review in parallel
-> Reader review when useful
-> Patch Revision (maximum 2 rounds)
-> Human Draft Gate
-> targeted revision and final
```

The user may explicitly skip an intermediate gate. Record that choice and the
assumptions used; do not silently skip gates merely to finish faster.

## 1. Direction Lock

Restate the assignment in a compact brief:

- topic or direction
- intended reader and desired effect, when known
- document type and approximate length, when known
- content mode and execution depth
- supplied links, notes, draft, and voice samples
- must-include and must-avoid constraints

Do not invent the central message for the user. If multiple interpretations
would produce materially different pieces, ask one focused question.

## 2. Human Material Pack

Before prose, extract `content atoms`: concrete observations, experiences,
opinions, scenes, vocabulary, examples, and tensions supplied by the user.
Label every atom as `user-supplied`, `source-supported`, `agent-proposed`, or
`placeholder`. Never promote an agent-proposed atom into the user's lived
experience.

If the user provides their own writing samples, derive a voice profile from
observable evidence. Record perspective, register, sentence and paragraph
rhythm, vocabulary to preserve, humor, transitions, punctuation habits, and
phrases to avoid. Quote short sample evidence for each observation. Do not
infer personality, identity, demographics, or private facts from style.

Do not require a sample. Without one, use the requested tone and label the voice
profile `direction-based`, not `sample-based`.

Follow the templates in `references/coauthoring-harness.md`.

## 3. Source handling

In source-guided mode, open every supplied link before prose. Track URL, title,
access state, date, claims, evidence, caveats, and intended use. Never imply an
inaccessible source was read. Ask for pasted text only when the blocked source
is important enough to change the result.

Use web search only to verify unstable claims, fill a named gap, find primary
sources, or satisfy an explicit research request. Keep user links distinct from
agent-discovered links. Paraphrase and synthesize; do not stitch lightly edited
source sentences together.

In creative mode, do not force references or browse for decoration. Research
only when externally verifiable facts matter.

## 4. Explore angles before prose

For Studio mode, create two distinct angle options before drafting. Use one
angle agent that prioritizes the user's supplied material and another that
tests a meaningfully different structure, tension, or reader entry point. They
return angle cards, not finished prose.

Each angle card contains:

- one-sentence controlling idea
- opening move
- section progression
- content atoms and sources used
- what makes it distinct
- risk or tradeoff

Do not create cosmetic variants with different titles but the same argument.
Let the user choose when the choice is subjective or consequential. Otherwise,
the coordinator may select one and state why.

## 5. Voice Calibration Gate

Before a full Studio draft, have the writer produce one representative opening
or section, normally about 10-15% of the target length. Ask the user for a fast
calibration using concrete options:

- sounds like me
- too polished or generic
- too explanatory
- too casual or too formal
- wrong emotional distance
- sentences sound polished but the meaning is unclear
- vague references make sources or subjects hard to identify
- keep specific lines

Convert the response into profile updates and `locked passages`. Do not ask a
vague question such as "What do you think?" If the user approves, use the
sample as the voice anchor for the remaining sections.

When no sample-based voice profile exists, ask two different provider families
for short calibration candidates when available. Give both the same semantic
brief, label them `Sample A` and `Sample B` without provider names, and let the
user choose or combine specific traits. Do not generate two full drafts.

Before showing a calibration candidate, run a bounded preflight: reject
placeholders, unclear literal meaning, unresolved referents, vague source
attribution, and violations of the Direction Lock. Retry that candidate once;
if it still fails, discard it, use another available provider, or disclose that
only one viable sample remains. Do not ask the user to calibrate against broken
prose, and do not rank candidates by provider reputation.

Studio mode may enter Section Drafting only when `calibration_status` is
`approved` or `explicitly-skipped-by-user`. Missing status means stop at the
Human Voice Gate. The coordinator may never infer approval from silence or from
the user's earlier angle choice.

## 6. Draft by section

Give the writer the Direction Lock, content atoms, voice profile, selected
angle, source pack when present, and locked passages. Draft section by section
while keeping one coherent document.

For each section, track:

- purpose in the whole piece
- plain-language claim: what the section literally says without a slogan
- concrete support: user atom, named source, example, scene, or explicit opinion
- intended reader takeaway
- content atoms used
- sources used, if any
- new factual claims requiring audit
- locked text that must remain unchanged

The writer may not invent personal experience, quotations, customers,
statistics, credentials, or events. It may propose clearly labeled creative
options for the user to accept.

Unless the approved voice sample demonstrates otherwise, avoid using these as
default scaffolding:

- slogan-like or metaphorical negation openings
- repeated `A가 아니라 B` / `A 때문이 아니라 B` antithesis
- a whole article made of uniform one- or two-sentence paragraph beats
- vague referents such as `그쪽`, `어떤 쪽`, `한 글`, or `같은 이야기`
- unnamed source gestures such as "한 글에서" or "어떤 자료에 따르면"
- abstract transitions that do not add a claim, fact, example, or decision

Prefer ordinary declarative sentences when they carry the meaning more clearly.
Every pronoun or shorthand reference must have an obvious antecedent. Name the
source, model, tool, actor, or event when the reader could otherwise ask "which
one?" Never sacrifice comprehension to make a sentence sound quotable.

## 7. Separate reviews

Do not use one editor for every concern. Run independent review contracts from
`references/role-briefs.md`:

- **Fact Auditor**: source support, quotations, dates, caveats, contradictions
- **Voice Editor**: voice-profile fit, generic language, rhythm, tone drift
- **Clarity Editor**: literal meaning, antecedents, paragraph logic, attribution
- **Reader**: comprehension, interest, persuasion, emotional and practical effect

Run Fact Auditor, Voice Editor, and Clarity Editor in parallel when applicable.
Clarity Editor is required for long-form or public Studio work and whenever the
voice profile is direction-based. Add Reader for long-form, public, persuasive,
or creative Studio work. Reviewers diagnose with exact excerpts and
instructions; they do not rewrite the complete piece.
Use separate agents for Fact Auditor, Voice Editor, and Clarity Editor. Prefer
different provider families from the Writer and from each other when available;
if roles resolve to the same family, disclose that the reviews used independent
prompts but were not fully cross-provider.

Use `scripts/writing-check.js` for deterministic signals when files exist. Resolve
the helper relative to this `SKILL.md`; do not assume the target project contains
the script:

```bash
node <skill-dir>/scripts/writing-check.js --draft <draft.md>
node <skill-dir>/scripts/writing-check.js --draft <draft.md> --sources <sources.md> --sample <voice-sample.md>
node <skill-dir>/scripts/writing-check.js --draft <draft.md> --forbid <forbidden-phrases.txt> --json
```

Its findings are editing signals, not proof of AI authorship or poor quality.
Checker warnings for repeated antithesis, vague attribution, transition density,
or mechanical short-paragraph rhythm must be inspected by Clarity Editor; they
are not automatic failures by themselves.

## 8. Patch Revision

Return review findings to the writer as a bounded revision brief. Classify each
item as `blocking`, `required`, `optional`, or `human decision`. Revise only the
affected passages and nearby transitions. Preserve locked and accepted text
unless the user explicitly unlocks it or a verified factual problem requires a
change.

After revision, report:

- sections changed
- reason for each change
- locked passages preserved
- factual claims added or removed

Run at most two writer/reviewer rounds within one human revision cycle,
including every review and patch pass before returning to the user. New user
feedback starts a new cycle. Stop early when all blocking issues pass or
remaining disagreements are matters of taste.

Before the Human Draft Gate, perform a read-aloud pass for speeches, scripts,
creative prose, and voice-sensitive public writing. Flag breathless sentences,
accidental repetition, and transitions that only look natural on the page.
Revise only when the spoken rhythm conflicts with the selected voice.

## 9. Human Draft Gate and finalization

Return the reviewed draft with:

- sources used, blocked, and unused, or `no links supplied`
- unresolved facts or tradeoffs
- major editorial decisions
- locked passages preserved
- providers actually used by role
- whether review was cross-provider

Turn human feedback into a targeted revision brief. Recheck changed passages
and transitions, not the entire document by default. The latest user direction
overrides earlier preferences.

Do not publish, post, email, upload, or submit without a separate explicit
request and confirmation at the point of action. Human review is mandatory
before calling a draft final unless the user explicitly asks for a one-pass
final and accepts the stated limitations.

## Provider and agent rules

Read the base **paseo** skill and actually read
`~/.paseo/orchestration-preferences.json` before choosing providers. Resolve
real provider/model identifiers through Paseo tooling when missing, invalid, or
named by the user. Never hardcode identifiers.

Use the role categories and contracts in `references/role-briefs.md`. Prefer a
different provider family for Writer and Voice Editor when available. If only
one provider exists, use separate agents and disclose that review was not
cross-provider.

All agents receive self-contained briefings. Do not create an external project
or a new workspace for this read-only workflow. Archive only agents created by
this run after they finish. Never archive the current workspace or unrelated
agents.

## Artifacts and evaluation

Keep Quick mode conversational. For Studio mode, ask once before creating an
optional `.paseobility/writing/<slug>/` state directory inside the current
target project. This is not a new Paseo workspace or external project. If
approved, follow `references/workspace-artifacts.md` and never overwrite an
accepted final.

When changing this skill, run the regression matrix in
`references/eval-harness.md`. Use several trials for nondeterministic agent
behavior, deterministic checks for structural invariants, independent LLM
reviewers for scalable signals, and human ratings as the authority for voice
and ownership.
