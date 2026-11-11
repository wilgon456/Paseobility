# Vendored Korean writing references

Source repository [epoko77-ai/im-not-ai](https://github.com/epoko77-ai/im-not-ai).
Pinned commit [`b37e0206d31fffd9149bf57168d4d62eb2086bee`](https://github.com/epoko77-ai/im-not-ai/tree/b37e0206d31fffd9149bf57168d4d62eb2086bee), dated 2026-10-12 (UTC).
The three files below are unmodified copies. The [MIT license](LICENSE) retains
the upstream copyright notice, Copyright (c) 2026 epoko77-ai.

| Local file | Upstream path |
| --- | --- |
| `quick-rules.md` | `skills/humanize-korean/references/quick-rules.md` |
| `rewriting-playbook.md` | `skills/humanize-korean/references/rewriting-playbook.md` |
| `LICENSE` | `LICENSE` |

Use the references through [the Korean style guide](../../references/korean-style.md).
The following upstream pipeline references and instructions do not apply here.

| File and lines | Upstream-only detail |
| --- | --- |
| `quick-rules.md` 1–7, 103–105 | The monolith agent, the `build_quick_rules.py` generator, and its timing. |
| `quick-rules.md` 3–7, 112 and pattern IDs throughout both references | The omitted `ai-tell-taxonomy.md`, including checklist IDs whose entries do not appear in the compact rulebook. |
| `quick-rules.md` 15, 109 | Orchestrator Phase 2.5 and `scripts/verify_change_rate.py`. The writer estimates change rate for supplied text. |
| `quick-rules.md` 115, 117–122 | The upstream retry and grading workflow, strict-mode recommendation, and the `final.md` and `HUMANIZE-SUMMARY` output. Report unresolved checks in the `ps-write` report. |
| `rewriting-playbook.md` 3, 11, 65, 105, 122, 133, 209–212 | Upstream detection reports, agents, taxonomy and gates, including `verify_gates.py` P5, and the pipeline's repeat-review workflow. |
| `rewriting-playbook.md` 151–177 | Pointers to an upstream report, `references/scholarship.md`, an external PDF and upstream metric validation. |
| `rewriting-playbook.md` 179–184 | Upstream change-rate measurement and target range. Follow the local estimate and thresholds for supplied text. |

Ignore the pointers to omitted material. No upstream script ships with
`ps-write`. Do not look for or run those scripts. Do not create `final.md`
or a `HUMANIZE-SUMMARY` block.
