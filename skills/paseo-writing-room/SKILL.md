---
name: paseo-writing-room
description: >-
  Plan, research when needed, draft, cross-review, and revise source-guided or
  creative writing with a human approval loop and multiple Paseo agents. Use
  for blog posts, essays,
  newsletters, reports, proposals, contributed articles, press releases,
  speeches, video or podcast scripts, website copy, letters, and social
  threads when the user provides a topic or direction, with any number of
  optional reference links, notes, or a rough draft, and wants natural prose,
  web research or fact checking when needed, cross-provider editorial review,
  citations, creative development, or iterative revisions.
---

# Paseo Writing Room

Turn a topic or direction into a reviewed piece of writing. Use every supplied
link as part of the working context; when no link is supplied, allow original
creative development without forcing research. Preserve the user's intent and
voice while separating drafting and editing so one model does not silently
reinforce its own mistakes.

Read `references/document-types.md` after the user chooses a format. Read
`references/review-rubric.md` before briefing the editor.

## Core workflow

```text
Topic or direction (required) + optional references
-> choose source-guided or creative mode
-> ask only material questions
-> optional research and fact check
-> outline approval when useful
-> writer draft
-> editor review
-> writer revision (maximum 2 rounds)
-> human review
-> targeted writer/editor revision
-> final
```

The human review gate is mandatory before calling a draft final. Do not publish,
post, email, upload, or submit the result without a separate explicit request
and confirmation at the point of action.

## 1. Establish the assignment

Extract anything the user already supplied. Require at least one of these before
drafting:

- a topic
- a direction, thesis, scene, question, or intended message

If neither exists, ask for it and stop. Do not replace the user's creative
direction with a topic invented by an agent.

Everything else is optional. Ask only when the answer would materially change
the result, and ask no more than three questions in one message. Do not turn
intake into a mandatory questionnaire.

Useful optional fields:

- subject and intended claim or takeaway
- document type
- target reader
- purpose or desired reader action
- approximate length
- tone and point of view
- required facts, stories, links, or calls to action
- forbidden claims, phrases, topics, or stylistic habits

Request a previous writing sample only when close voice matching matters. Treat
the sample as style evidence, not as text to copy. If the topic or direction is
clear and missing details can be inferred safely, state concise assumptions and
continue without questions.

Example invocation:

```text
/paseo-writing-room
주제: AI 에이전트가 새 프로젝트를 이해하는 방법
참고 글: <없어도 되고, 개수 제한 없이 제공 가능>
형식: 뉴스레터
독자: AI 코딩 도구를 처음 쓰는 개발자
톤: 경험담 중심, 과장 없이
길이: 1,500자 안팎
```

Minimal invocation is also valid:

```text
/paseo-writing-room
이 세 링크 바탕으로 기고문 쓰는 것부터 같이 시작하자.
<URLs>
```

Creative invocation without links is valid:

```text
/paseo-writing-room
퇴근길에 문득 모든 신호등이 파란색으로 보이기 시작한 사람의 단편소설.
불안하지만 지나치게 어둡지는 않은 방향으로 써줘.
```

## 2. Choose the operating mode

### Source-guided mode

Use this mode whenever the user supplies one or more links. There is no minimum
or maximum link count. Open every supplied link and carry it into the working
context. Do not silently select only the first three or the most convenient
sources.

Open and read every user-provided source before drafting. For each source,
record a source ledger:

| Field | Content |
| --- | --- |
| URL/title | Exact source identity |
| Access | Read, partial, blocked, or unavailable |
| Main claims | Claims relevant to the assignment |
| Evidence | Data, examples, or primary-source statements |
| Date | Publication/update date when available |
| Intended use | Background, support, counterpoint, or quotation |

Never imply that an inaccessible link was read. Ask for pasted text when a
paywall, login, robots rule, deleted page, or unsupported format blocks access.

If the source set is too large for one pass, explain a batch plan, process every
batch, and merge the ledger before drafting. Preserve the distinction between
user-provided links and sources discovered by agents.

Use web search only to fill factual gaps, verify unstable claims, or satisfy an
explicit research request. Prefer official documentation, original research,
public records, and first-party statements over summaries. Keep exact URLs
beside every sourced claim. Do not fabricate citations or attach a source to a
claim it does not support.

Paraphrase and synthesize. Do not assemble the draft from lightly modified
source sentences. Keep quotations short and clearly attributed. Include the
supplied links in the researcher, writer, and editor briefings so they remain
part of deliberation through the complete workflow.

### Creative mode

Use this mode when the user supplies no links. Do not require references and do
not browse merely to make the process look researched. Develop the supplied
topic or direction through original structure, scenes, arguments, imagery, or
examples appropriate to the requested document type.

Create a researcher only when the user asks for research or the draft depends
on externally verifiable facts. Otherwise proceed with writer and editor roles.
Do not invent real-world facts, personal memories, quotations, credentials, or
living people's statements. Clearly mark placeholders that require user input.

## 3. Ask only necessary follow-up questions

In source-guided mode, read the sources before asking source-specific questions.
In creative mode, ask only about choices that cannot be inferred safely. Useful
questions include:

- Which position should the piece ultimately take?
- What personal experience can make the argument specific?
- Which reader objection should be answered?
- What outcome should the ending produce?
- Which facts are sensitive or require qualification?

Do not repeat intake questions. If the supplied topic or direction is already
sufficient, skip questions and begin. If the user wants speed, prefer explicit
assumptions over low-value questions.

## 4. Resolve Paseo providers

Read the base **paseo** skill before creating agents. Actually read
`~/.paseo/orchestration-preferences.json` if it exists and incorporate its
`preferences` into every role briefing where relevant.

Resolve roles as follows:

| Role | Preferred category | Responsibility |
| --- | --- | --- |
| Researcher | `research` | Read supplied links and verify facts when needed |
| Writer | `ui` | Create outline and draft in the requested voice |
| Editor | `audit` | Check facts, structure, voice, citations, and awkwardness |

If the user names providers or models, inspect available Paseo providers/models
and use only valid identifiers. Never guess or hardcode a provider string. If
preferences are missing or invalid, inspect available providers, choose valid
ones, and tell the user once.

Prefer a different provider family for the editor than for the writer when one
is available. If only one provider is available, use separate agents with
separate role prompts and disclose that the review is not cross-provider.

Do not create a new workspace for this read-only workflow. Use the current
workspace and do not allow agents to edit project files unless the user asked
to save writing artifacts.

## 5. Run the writing room

### Researcher brief

Create this role only in source-guided mode or when creative mode needs factual
research. Give the researcher the complete assignment, every supplied URL,
interview answers, current date, and output contract. Require:

```text
1. Source ledger with access status
2. Verified claim table: claim, source URL, confidence, caveat
3. Counterarguments or missing context
4. Useful examples and data
5. Facts that should not be stated as certain
6. Recommended angle, without drafting the article
```

The researcher must not edit files or produce the final prose.

### Writer brief

Give the writer the assignment brief, all supplied links, and the verified
research pack when one exists. Do not ask the writer to browse independently
unless the research pack contains a named gap.
Require the format-specific structure from `references/document-types.md` and:

```text
- lead with the user's real point, not generic background
- use concrete nouns, verbs, examples, and transitions
- preserve uncertainty and source attribution
- avoid invented personal experiences or quotations
- avoid repetitive summaries, canned headings, and inflated claims
- return an outline followed by the complete draft
```

When structure is consequential, show the outline to the user before drafting.
For short pieces or when the user asks for speed, continue directly.

### Editor brief

Give the editor the assignment, all supplied links, source pack when one exists,
the draft, and
`references/review-rubric.md`. The editor must return:

```text
Verdict: ready | revise | blocked
Blocking factual issues
Unsupported or overstated claims
Structural issues
Voice/awkwardness issues, with exact excerpts
Specific revision instructions
What should remain unchanged
```

Tell the editor to diagnose rather than rewrite the entire piece. A rewrite
that erases the user's voice is a failed review.

### Revision rounds

Send the editor's actionable notes back to the writer. Run at most two
writer/editor rounds before returning the draft to the user. Stop earlier when:

- the editor returns `ready`
- remaining issues require user judgment
- a source cannot be verified
- the two agents disagree on taste rather than correctness

Present unresolved tradeoffs instead of hiding them.

## 6. Human revision loop

Return the reviewed draft with a compact note containing:

- document type and intended audience
- sources used and any inaccessible sources, when links were supplied
- material caveats or unresolved facts
- major editorial choices
- requested feedback areas

When the user requests changes, convert their feedback into a revision brief.
Classify each item as `must change`, `preference`, or `question`. Have the writer
revise only the affected sections, then have the editor check those changes and
their surrounding transitions. Run at most two more review rounds per human
revision cycle.

The user's latest instruction overrides earlier stylistic preferences. Preserve
accepted passages unless a requested change makes them inconsistent.

## 7. Persist artifacts only when useful

Keep the normal workflow in the conversation. If the user asks to save the work
or the project already uses writing artifacts, use:

```text
.paseobility/writing/<slug>/
├── brief.md
├── sources.md
├── outline.md
├── draft.md
├── review.md
└── final.md
```

Ask before creating this directory when the user requested only conversational
output. Never overwrite an existing `final.md`; create a dated or numbered
revision instead.

## 8. Completion and cleanup

Archive only the researcher, writer, and editor agents created by this run,
after confirming they are finished. Never archive unrelated or running agents.
Do not archive the current workspace.

Final output must identify:

- which providers were actually used for research, writing, and editing
- which supplied sources were read, partial, inaccessible, or not used; write
  `no links supplied` in creative mode
- whether cross-provider review occurred
- remaining factual or editorial uncertainty
- whether artifacts were written, including exact paths

Do not claim the text is undetectable as AI-written. Optimize for accuracy,
specificity, readability, and fidelity to the user's voice, not detector evasion.
