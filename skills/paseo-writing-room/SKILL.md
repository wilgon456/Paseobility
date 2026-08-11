---
name: paseo-writing-room
description: >-
  Run a human-directed multi-agent writing room for source-guided or creative
  writing. Use for articles, essays, newsletters, reports, proposals, press
  releases, speeches, scripts, social threads, website copy, letters, email,
  and fiction when the user supplies a topic or direction plus any number of
  optional links, notes, samples, or drafts. Researches missing factual context,
  drafts continuously without requiring passage-by-passage approval, and runs a
  bounded two-model writer/editor critique loop before returning a complete
  human-reviewable draft.
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
| Quick | Short, low-stakes work or the user explicitly requests speed |
| Studio | Long-form, public, high-stakes factual or persuasive, strongly voice-sensitive, or iterative work |

Quick mode may use one compact writer/editor exchange. Studio mode uses the full
two-model workflow below. Use only one model when the user explicitly requests
it or the output is too small for a second model to add meaningful review.

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
-> Research Gap Map
-> targeted web research and Source Ledger when needed
-> Lead Writer full draft
-> Adversarial Editor critique
-> Lead Writer response and patch
-> Adversarial Editor verification
-> optional second critique/patch round
-> Human Draft Gate
-> targeted revision and final
```

Do not pause for passage, angle, or voice approval unless the user explicitly
asks to collaborate step by step. Record low-risk assumptions and continue.
Stop only when a missing personal fact would otherwise be invented, materially
different directions remain unresolved, or a source problem blocks the piece.

## 1. Direction Lock

Record the assignment in a compact internal brief:

- topic or direction
- intended reader and desired effect, when known
- document type and approximate length, when known
- content mode and execution depth
- supplied links, notes, draft, and voice samples
- must-include and must-avoid constraints

Do not invent the central message for the user. If multiple interpretations
would produce materially different pieces, ask one focused question.
Do not print the Direction Lock unless the user asks to inspect the process.

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

Keep content atoms, gap maps, and voice profiles as internal working records.
Do not dump these records into the conversation unless the user asks to inspect
the process. Ask one focused follow-up only when needed, then move directly into
the complete drafting and critique loop. The user should not have to operate the
harness.

Follow the templates in `references/coauthoring-harness.md`.

## 3. Source handling

In source-guided mode, open every supplied link before prose. Track URL, title,
access state, date, claims, evidence, caveats, and intended use. Never imply an
inaccessible source was read. Ask for pasted text only when the blocked source
is important enough to change the result.

Before angle exploration, create a Research Gap Map even when the user supplied
no links. Classify each material gap:

| Gap type | Action |
| --- | --- |
| Personal experience, motive, preference, or memory | Ask the user or leave a labeled placeholder; never search for a substitute |
| Current or externally verifiable fact | Search and verify with primary or authoritative sources |
| Background explanation or definition | Search when it would make the argument clearer or more accurate |
| Example, counterargument, or public perspective | Search for attributable evidence or representative perspectives |
| Voice, taste, or subjective conclusion | Keep with the user; do not let sources decide it |

For every searchable gap, record the question, why it matters, preferred source
type, freshness requirement, evidence needed to close it, and status. Search
automatically when the gap materially affects accuracy, usefulness, or reader
understanding; do not make the user remember to request research.

Prefer official documentation and primary sources for prices, limits, product
behavior, dates, and technical capabilities. Use reputable reporting, research,
or clearly attributed community material for context and lived perspectives.
If a brand name could refer to several products, plans, models, or versions,
ask one focused question or keep the claim qualified before searching; never
silently map a user's generic name to a specific SKU.
For unstable claims, record the access date and avoid presenting the result as
timeless. One focused search pass plus one refinement per gap is normally
enough; if evidence remains weak or contradictory, qualify, omit, or return the
decision to the user instead of browsing indefinitely.

Keep user links distinct from agent-discovered links. Every researched claim
becomes `source-supported`, never `user-supplied`. Name or cite sources in the
draft where attribution matters; phrases such as "한 글에서" do not count.
Paraphrase and synthesize; do not stitch lightly edited source sentences
together or add research merely to make the piece look substantial.

In creative mode, do not force references or browse for decoration. Research
when externally verifiable facts, requested realism, or a named contextual gap
matters. Do not use research to overwrite deliberate fictional choices.

## 4. Continuous Lead Draft

Use everything the user has already supplied and never ask them to repeat
intake. Ask at most one focused question only when a missing personal fact would
materially change the piece and cannot be safely omitted. Search factual gaps
instead of asking the user to research them.

Model A is the Lead Writer and owns the prose from first draft through final
patch. It writes the complete requested draft before returning control to the
user. Prefer the order in which events happened and the user's named examples
over an abstract thesis-first structure.

The Lead Writer must:

- keep prose close to the user's ordinary wording without merely copying notes
- group related details into real paragraphs with varied, supported rhythm
- avoid mapping every supplied sentence to its own paragraph
- use connective tissue only to clarify order and reference
- never infer a motive, feeling, habit, causal story, or retrospective judgment
- avoid slogans, unsupported general theories, and vague unnamed sources
- avoid a conclusion that merely re-lists three or more examples from the body
  without adding a supported decision, implication, or reader action
- keep internal atoms, gap maps, ledgers, and provider discussion out of draft
- treat requested length as subordinate to supported material: never repeat,
  inflate, or invent content merely to hit a word or character target

When the supplied material supports a shorter piece than requested, produce the
stronger shorter draft and disclose the length tradeoff after it. Ask one
focused question only when the user explicitly made length a hard requirement.

Angle exploration is internal and optional. Resolve low-risk structural choices
without asking. Ask the user only when two directions would create materially
different arguments or personal claims.

## 5. Two-Model Critique Loop

Use two distinct model/provider families when available:

- **Model A — Lead Writer:** creates and revises one coherent draft.
- **Model B — Adversarial Editor:** challenges facts, logic, clarity, voice,
  reader effect, unsupported inference, and mechanical prose without rewriting
  the entire piece.

The default exchange is automatic:

1. Model A returns the full draft plus an internal section ledger.
2. Model B returns prioritized findings with exact excerpts and local actions.
3. Model A marks each finding `accept`, `partly accept`, or `reject with reason`,
   then patches only affected passages and transitions.
4. Model B verifies that blocking findings are resolved and that revisions did
   not introduce new factual or voice problems.
5. Run one additional critique/patch exchange only when blocking issues remain.

The verification candidate must be byte-for-byte identical to the article
later shown to the user. After the Editor returns `pass`, freeze that draft.
The coordinator may add a clearly separated provider/source footer, but it may
not change article wording, punctuation, or ordering. Any article change after
verification invalidates the verdict and must return to the same Editor.

The user sees the reviewed draft, not the internal debate, unless they ask for
it. Do not stop after step 1 to request approval. Do not let Model B replace the
whole draft: one model must retain prose ownership so the voice does not become
committee-written. A model name is not a quality guarantee; apply the same
contracts regardless of which provider fills either role.

If the coordinator's provider family is known, it may serve as Model A and only
one independent Model B agent is needed. If it is unknown, create separate Lead
Writer and Adversarial Editor agents. If two provider families are unavailable,
use two independent agents or passes from the available family and disclose
that the review was not cross-provider.

## 6. Draft Ledger

Keep one coherent document throughout the critique loop. Track the following
internally for each section:

- purpose in the whole piece
- plain-language claim: what the section literally says without a slogan
- concrete support: user atom, named source, example, scene, or explicit opinion
- intended reader takeaway
- content atoms used
- sources used, if any
- new factual claims requiring audit
- locked text that must remain unchanged

The Lead Writer may not invent personal experience, quotations, customers,
statistics, credentials, or events. It may propose clearly labeled creative
options only when the genre permits them.

Unless the user's own sample demonstrates otherwise, avoid using these as
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

## 7. Editorial Review Contract

The Adversarial Editor applies the combined contract in
`references/role-briefs.md` and `references/review-rubric.md`. It must cover
Fact, Voice, Clarity, and Reader lanes separately in one response so no concern
is silently averaged away. Use extra specialist agents only for high-stakes
facts, legal/safety review, or an explicit user request.

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
or mechanical short-paragraph rhythm must be inspected in the Adversarial
Editor's Clarity lane; they are not automatic failures by themselves.

## 8. Patch Revision

Return review findings to the Lead Writer as a bounded revision brief. Classify
each item as `blocking`, `required`, `optional`, or `human decision`. Revise only
the affected passages and nearby transitions. Preserve explicitly locked text
unless the user unlocks it or a verified factual problem requires a change.

After revision, record internally:

- sections changed
- reason for each change
- locked passages preserved
- factual claims added or removed

Run at most two writer/editor rounds within one human revision cycle,
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

Turn human feedback into a targeted revision brief and automatically run the
same writer/editor exchange on changed passages. Recheck nearby transitions,
not the entire document by default. The latest user direction overrides earlier
preferences.

Do not publish, post, email, upload, or submit without a separate explicit
request and confirmation at the point of action. Human review is mandatory
before calling a draft final unless the user explicitly asks for a one-pass
final and accepts the stated limitations.

## Provider and agent rules

Read the base **paseo** skill and actually read
`~/.paseo/orchestration-preferences.json` before choosing providers. Resolve
real provider/model identifiers through Paseo tooling when missing, invalid, or
named by the user. Never hardcode identifiers.

Use the role categories and contracts in `references/role-briefs.md`. Resolve a
Lead Writer and Adversarial Editor from different provider families when
available. Do not create more agents than this pair unless research or stakes
materially require a specialist. Disclose any same-family fallback.

All agents receive self-contained briefings. Do not create an external project
or a new workspace for this read-only workflow. Archive only agents created by
this run after they finish. Never archive the current workspace or unrelated
agents.

## Artifacts and evaluation

Keep Quick mode conversational. Create an optional
`.paseobility/writing/<slug>/` state directory only when the user asks to save
workflow artifacts. This is not a new Paseo workspace or external project.
Follow `references/workspace-artifacts.md` and never overwrite an accepted
final.

When changing this skill, run the regression matrix in
`references/eval-harness.md`. Use several trials for nondeterministic agent
behavior, deterministic checks for structural invariants, independent LLM
reviewers for scalable signals, and human ratings as the authority for voice
and ownership.
