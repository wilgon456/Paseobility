# Editorial Review Rubric

Use this rubric after a complete draft exists. Review the draft against its
actual assignment rather than an abstract ideal.

## Contents

- Blocking checks
- Scored review
- Natural voice checks
- Citation and source checks
- Review output

## Blocking checks

Return `blocked` when any of these remain:

- a central factual claim is unsupported or contradicted by a reliable source
- a source is cited for a claim it does not support
- personal experience, quotation, customer, or statistic was invented
- the document violates the requested format or publication rules
- essential user intent is ambiguous and cannot be resolved conservatively
- private or sensitive information appears without a clear need

## Scored review

Score each dimension from 1 to 5. A draft is `ready` only when no blocking issue
exists and every dimension scores at least 4.

| Dimension | Review question |
| --- | --- |
| Assignment fit | Does it serve the named reader, purpose, format, and length? |
| Factual integrity | Are factual statements supported, current, and qualified? |
| Argument | Is the central point clear, coherent, and honestly defended? |
| Structure | Does each section advance the piece without repetition? |
| Specificity | Are claims grounded in concrete detail, evidence, or examples? |
| Voice | Does it match the user's sample and requested point of view? |
| Readability | Are sentences, transitions, and paragraph lengths easy to follow? |
| Ending | Does the ending produce the intended thought or action? |

## Natural voice checks

Flag exact excerpts rather than labeling the entire piece as awkward. Look for:

- generic openings that could introduce any topic
- repeated three-item lists or identical paragraph rhythms
- abstract nouns where a concrete actor and action are available
- unnecessary restatement of the heading in the first sentence
- inflated transitions such as announcing that every point is crucial
- excessive hedging or certainty unsupported by the evidence
- conclusions that merely summarize every section
- abrupt tone shifts introduced during revision
- polished language that erases the user's supplied vocabulary or perspective

Do not intentionally add typos, false memories, random slang, or factual errors
to make writing appear human. Do not optimize for AI-detector scores.

## Citation and source checks

For every externally verifiable claim that matters to the argument:

1. Locate its source in the source ledger.
2. Confirm the source supports the precise wording.
3. Check date and context for unstable information.
4. Prefer the primary source when available.
5. Preserve caveats and uncertainty.
6. Ensure links point to the supporting page, not a search result.

Treat unsupported but plausible claims as unsupported. Do not repair them from
memory; request research or soften/remove them.

## Review output

Return this compact structure:

```text
Verdict: ready | revise | blocked

Scores
- Assignment fit: N/5
- Factual integrity: N/5
- Argument: N/5
- Structure: N/5
- Specificity: N/5
- Voice: N/5
- Readability: N/5
- Ending: N/5

Blocking issues
- <claim or none>

Required revisions
- <exact location, problem, and requested change>

Optional improvements
- <change and expected benefit>

Keep unchanged
- <strong passages or structural choices>

Source notes
- <URL, access/citation issue, and action>
```

Do not rewrite the full document unless the coordinator explicitly requests a
rewrite. The writer owns prose; the editor owns diagnosis and acceptance.
