---
name: paseo-writing-room
description: >-
  Run a human-directed multi-agent writing room for source-guided or creative
  writing. Use for articles, essays, newsletters, reports, proposals, press
  releases, speeches, scripts, social threads, website copy, letters, email,
  and fiction when the user supplies a topic or direction plus any number of
  optional links, notes, samples, or drafts. Develops the piece conversationally
  with the user one passage at a time, researches missing factual context,
  preserves accepted wording, and uses other models mainly for factual, voice,
  clarity, and reader review after a coherent human-led draft exists.
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
-> Research Gap Map
-> targeted web research and Source Ledger when needed
-> Conversational Passage Loop
-> Human Voice Anchor
-> Coherent Section Drafting
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

Keep content atoms, gap maps, and voice profiles as internal working records.
Do not dump these records into the conversation unless the user asks to inspect
the process. Speak like a coauthor: acknowledge the useful detail, ask one
focused follow-up only when needed, and move into a concrete passage as soon as
there is enough material. The user should not have to operate the harness.

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

## 4. Conversational Passage Loop

The coordinator is the lead coauthor. Before creating prose-writing agents,
turn the user's supplied experience, opinion, sequence, and vocabulary into one
short passage, normally two to four natural paragraphs. Prefer the order in
which events actually happened over an abstract thesis-first structure.

For each turn:

1. Use everything the user has already said; never ask them to repeat intake.
2. Ask at most one focused question when a missing personal fact would change
   the passage. Search factual gaps instead of asking the user to research them.
3. Write the next usable passage, not a content-atom table, angle card, outline,
   or explanation of the workflow.
4. Keep the prose close to the user's ordinary wording. Add connective tissue,
   but do not inflate a simple experience into a slogan or general theory.
   Connective tissue may clarify order and reference; it may not invent a
   motive, feeling, habit, causal explanation, or retrospective judgment. For
   example, do not turn a list of changing tool uses into "쓰다 보니 자연스럽게
   나뉘었다" unless the user said that happened.
5. Shape a passage rather than line-breaking the user's notes. Group sentences
   that explain the same moment or choice, vary paragraph length where the
   material supports it, and normally give at least one paragraph two or more
   connected sentences. Do not make every source sentence its own paragraph.
6. End with the passage itself or one natural continuation question. Do not
   append a rating form, diagnostic checklist, JSON, internal status, or a list
   of calibration choices to ordinary coauthoring output.
7. When the user accepts the passage, lock it and continue to the next logical
   section. When they reject it, revise locally before moving on.

Do not ask external providers to author calibration candidates by default. A
provider that is good at ideation or speed can still produce mechanical prose,
and provider identity is not a substitute for voice evidence. Use another
writer only when the user explicitly requests alternatives, delegation, or a
named model. Even then, the coordinator must preflight the candidate and may
discard it.

Angle exploration is optional. Offer two compact angles only when materially
different structures remain plausible and the user has not already chosen one.
Do not create angle agents for a personal piece whose chronology and purpose
are already clear.

## 5. Human Voice Anchor

The first accepted coauthored passage becomes the Studio voice anchor. Ask for
fast calibration using concrete options when the response is not already an
unambiguous acceptance:

- sounds like me
- too polished or generic
- too explanatory
- too casual or too formal
- wrong emotional distance
- sentences sound polished but the meaning is unclear
- vague references make sources or subjects hard to identify
- keep specific lines

Use these options selectively in a natural sentence, not as a form appended to
every passage. Show a compact choice list only when the user says the voice is
wrong but cannot identify why, or explicitly asks for calibration choices.

Convert the response into profile updates and `locked passages`. Do not ask a
vague question such as "What do you think?" If the user approves, use the
sample as the voice anchor for the remaining sections.

Before showing a coauthored or optional external candidate, run a bounded
preflight: reject
placeholders, unclear literal meaning, unresolved referents, vague source
attribution, and violations of the Direction Lock. Retry that candidate once;
if it still fails, revise locally or discard it. Do not ask the user to
calibrate against broken prose, and do not rank candidates by provider
reputation.

Studio mode may expand beyond the voice-anchor passage only when
`calibration_status` is
`approved` or `explicitly-skipped-by-user`. Missing status means stop at the
Human Voice Gate. The coordinator may never infer approval from silence or from
the user's earlier angle choice.

## 6. Draft by section

Continue the same coordinator-led passage loop section by section. Give any
explicitly requested Writer agent the Direction Lock, content atoms, voice
profile, selected structure, source pack when present, and locked passages.
Keep one coherent document and preserve the causal or chronological line that
made the accepted passage feel natural.

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
Do not create these reviewers until the user and coordinator have a coherent
draft or the user explicitly asks for an early audit. Their job is to find
problems in a human-led draft, not to replace it with a committee-written one.
Use separate agents for Fact Auditor, Voice Editor, and Clarity Editor. Prefer
different provider families from the coordinator or optional external Writer
and from each other when available; if roles resolve to the same family,
disclose that the reviews used independent prompts but were not fully
cross-provider.

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
different provider family for reviewers when available. The coordinator owns
the prose by default; an external Writer is opt-in. If only one provider exists,
use separate agents and disclose that review was not cross-provider.

Do not create writing or angle agents before the Conversational Passage Loop.
A Researcher may run earlier only for a real source or fact gap. Minimize agent
count: for ordinary personal writing, one coordinator plus final reviewers is
usually enough.

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
