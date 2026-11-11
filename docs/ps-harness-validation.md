# Planning and writing harness verification

2026-11-10 · version 3.0.0 · branch `feat/ps-rename` · repository changes only.

Added explicit-only `ps-plan` and `ps-write`; the package now registers fifteen
skills. Each harness defines intake, one optional catalog lookup, its method,
evidence checks and a resumable report. New Korean prose guidance was authored
for this change; no installed writing/style skill or third-party text was used.

The pre-existing rename/catalog work was preserved. The Git index matches the
captured task-start index byte for byte. No stage, commit, push, branch switch,
real-home skill install, dependency install, settings change, Paseo restart or
agent creation was performed. Installer tests use temporary synthetic homes.

## Files added

| File | Purpose |
| --- | --- |
| [skills/ps-plan/SKILL.md](../skills/ps-plan/SKILL.md) | One grounded Markdown plan, graded current state, testable criteria, independent phases, risks and path-based handoff. |
| [skills/ps-plan/agents/openai.yaml](../skills/ps-plan/agents/openai.yaml) | Disable implicit invocation. |
| [skills/ps-write/SKILL.md](../skills/ps-write/SKILL.md) | Reader outcome, source tracing, drafting, revision and explicit review evidence. |
| [skills/ps-write/agents/openai.yaml](../skills/ps-write/agents/openai.yaml) | Disable implicit invocation. |
| [skills/ps-write/references/korean-style.md](../skills/ps-write/references/korean-style.md) | Original Korean guidance, before/after examples and final checklist; conditional loading. |
| [docs/ps-harness-validation.md](ps-harness-validation.md) | This report. |

## Files changed

| Files | Change |
| --- | --- |
| `skills/ps-research/SKILL.md`, `skills/ps-design/SKILL.md`, `skills/ps-god/SKILL.md` | Only the four-line specialist check below was added, with a separating blank line. |
| `paseobility.json` | Register both skills; retain version 3.0.0. |
| `plugin/shared/skills.ts` | Two status entries with English summaries. |
| `plugin/shared/workflows.ts` | Two entries with English/Korean titles and hints, placeholders, existing verified icons and single-character glyphs. |
| `plugin/paseo-plugin.json`, `plugin/OVERVIEW.md` | Fifteen workflows and the new capabilities. |
| `scripts/paseobility-doctor.py` | Add both IDs to the fixed allowlist. |
| `scripts/check-plugin-runtime.mjs` | Expect fifteen status entries. |
| `plugin/tests/workflows.test.mjs` | Change the registry count from 13 to 15; all existing metadata checks retained. |
| `tests/test_skill_migration.py` | Expect fifteen installed skills; exclude the two new skills from the fixture that models the twelve historical renames. No migration behavior changed. |
| `README.md`, `README.ko.md` | Current count, release introduction, skill tables and repository trees. |
| `AGENTS.md` | Current count and single-skill install guidance. |
| `docs/release-history.md`, `docs/release-history.ko.md` | Add a paragraph to the existing v3.0.0 entry. |

`plugin/client/i18n.ts` needs no per-skill registration: the current implementation
uses the localized fields in `WORKFLOWS`. It was left unchanged. Historical test
counts, version numbers and the earlier P1 catalog verification snapshot were
preserved rather than rewritten as new test results. No CI command was added.
No existing test pins the three edited skills' wording or length; their tests
were not weakened or rewritten.

## Commands and results

| Command | Final result |
| --- | --- |
| `python3 scripts/validate-skills.py` | PASS: `OK: 15 skills; catalog, version and skill frontmatter agree`. |
| `python3 -B -m unittest discover -s tests -p "test_*.py"` | PASS: 426 tests, 13 skipped. |
| `node skills/ps/scripts/skill-catalog.test.js` | PASS: 20 tests. |
| `node --test skills/ps-god/scripts/god-run.test.mjs` | PASS: 11 tests. |
| `node skills/ps-design/scripts/design-check.mjs --selftest` | PASS: all selftests, using the existing Ego Lite executable. |
| `npm test --prefix plugin` | 43 passed, 1 known failure: `host compatibility accepts checked releases on daemon and app, rejects the next minor` cannot import absent `@getpaseo/protocol`. No new failures. |
| `git diff --check` | PASS. |
| `python3 <skill-creator>/scripts/quick_validate.py skills/ps-plan` | PASS: skill valid. Local skill directory normalized to avoid a private path. |
| `python3 <skill-creator>/scripts/quick_validate.py skills/ps-write` | PASS: skill valid. Local skill directory normalized to avoid a private path. |

Additional inline Python assertions checked manifest/plugin/doctor ID parity
(fifteen entries), both explicit-only policies, line and description budgets,
and unchanged Git index bytes. Direct review checked the requested plan and
writing content, original Korean examples and absence of private host paths in
added text. Existing data identifiers and catalog scripts were not changed.

The initial sandboxed design run failed because headless rendering and its
localhost fixture server were blocked (`EPERM`). The initial Python run also
hit localhost/process restrictions and exposed the historical-rename fixture's
assumption that every `ps-*` skill existed in v2. After the minimal fixture
correction, the same required commands were rerun with permission for temporary
browser profiles, fixture servers and fake supervisor processes; both passed.
No check implementation was changed to bypass those environment failures.

## Size checks

Counts include frontmatter and blank lines. Words are whitespace-separated;
Korean counts are not linguistic word segmentation. Body counts include the
blank line immediately after frontmatter.

| New file | Total lines | Body lines | Total words | Description words |
| --- | ---: | ---: | ---: | ---: |
| `skills/ps-plan/SKILL.md` | 93 | 86 | 716 | 42 |
| `skills/ps-plan/agents/openai.yaml` | 2 | — | 3 | — |
| `skills/ps-write/SKILL.md` | 90 | 83 | 728 | 38 |
| `skills/ps-write/agents/openai.yaml` | 2 | — | 3 | — |
| `skills/ps-write/references/korean-style.md` | 82 | — | 543 | — |

Both skill files and the Korean reference are below 120 lines; both descriptions
are below 50 words. The descriptions and policies restrict activation to an
explicit invocation or a direct request to use the skill.

## Exact changes to the three existing skills

These diffs compare against the task-start working files, not HEAD, which also
contains the owner's earlier uncommitted rename changes.

### `ps-research`

```diff
--- skills/ps-research/SKILL.md (task start)
+++ skills/ps-research/SKILL.md (now)
@@ -21,6 +21,11 @@
 code at a known commit, an official statement for a specific version. Note the
 versions, platforms and dates that matter. If the question is really several,
 answer them separately.
+
+If `ps` is installed, run its catalog `list` once and read at most one
+specialist that clearly fits; otherwise continue. Read it in place; never
+install anything. It adds domain facts and steps, never replaces this
+skill's verification.
 
 ## 2. Read sources in trust order
 
```

### `ps-design`

```diff
--- skills/ps-design/SKILL.md (task start)
+++ skills/ps-design/SKILL.md (now)
@@ -32,6 +32,11 @@
 4. UI checks the repo already runs (save hooks, lint scripts, screenshot or visual-regression tests, Storybook).
 
 If any exist, follow them, reuse their components and tokens, run their checks, and do not create a second source of truth: no new `DESIGN.md`, no new palette, no new component for a pattern that exists. Apply the workflow below within those rules; use design-check (step 4) unless the project already has a check that renders and measures the page.
+
+If `ps` is installed, run its catalog `list` once and read at most one
+specialist that clearly fits; otherwise continue. Read it in place; never
+install anything. It adds domain facts and steps, never replaces this
+skill's verification.
 
 ## Choose the working depth
 
```

### `ps-god`

```diff
--- skills/ps-god/SKILL.md (task start)
+++ skills/ps-god/SKILL.md (now)
@@ -15,6 +15,11 @@
 autonomously inside the user's request and project instructions. Read relevant
 project context, not every skill, session or memory file. Load a reference
 below only when it helps.
+
+If `ps` is installed, run its catalog `list` once and read at most one
+specialist that clearly fits; otherwise continue. Read it in place; never
+install anything. It adds domain facts and steps, never replaces this
+skill's verification.
 
 1. State the goal, scope and observable acceptance criteria. Infer routine
    details; ask only for missing information that blocks work.
```

## Verification limits and resume point

The new harnesses were reviewed as instructions, not exercised in newly created
agent sessions; creating agents and installing skills were outside scope. Plugin
labels and metadata passed static tests, but no installed plugin UI was rendered
or changed. Word/HWP/PDF/slide output behavior was not tested. Platform-dependent
Python checks account for the thirteen skips. The broader plugin compiler/SDK
runtime matrix was not rerun because dependencies are absent and installations
were prohibited.

To close the single known plugin failure, use an environment where the plugin's
existing dependencies are already available and rerun `npm test --prefix plugin`.
To assess live harness behavior, separately authorize a new-session exercise with
synthetic source material. No further repository implementation remains for this
brief's scoped changes.

## 2026-11-11 · Pinned Korean revision references for `ps-write`

`ps-write` reads the local Korean style guide before drafting. During revision
it reads `quick-rules.md` and applies the rulebook's self-check to the final
draft. It reads `rewriting-playbook.md` for supplied Korean text or when a
flagged pattern needs a clearer fix. Both references and the MIT license match
the bytes from upstream commit `b37e0206d31fffd9149bf57168d4d62eb2086bee`.
The local guide defines which upstream pipeline instructions to skip.
[Sources and license](../skills/ps-write/vendor/humanize-korean/SOURCES.md)

| Check | Result |
| --- | --- |
| `python3 scripts/validate-skills.py` | PASS. All 15 skills validated, including the required Korean reference files and their local links. |
| `python3 -m unittest discover -s tests -p "test_*.py"` | PASS. 431 tests, 14 skipped. The suite checks pinned hashes, missing references, license and provenance, broken links, and Bash installation into a temporary home. |
| `node skills/ps/scripts/skill-catalog.test.js` | PASS. 20 passed, 0 failed, 0 skipped. |
| `shasum -a 256` and `cmp` | PASS. Both references and the MIT license match the downloaded upstream files. |
| Entrypoint size | 99 lines, 38 description words. |

The Bash installer copied all four vendor files byte-for-byte. The PowerShell
installer's recursive copy was confirmed by reading its source. Its copy test
was skipped because PowerShell was unavailable. Live Korean revision in a fresh
agent session remains unverified. This update changes neither the package
version nor the plugin.
