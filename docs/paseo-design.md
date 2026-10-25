# Paseo Design: product evidence, composition and visual review

The design procedure lives in `paseo-design`. A caller such as `paseo-god`
reuses it and links its evidence; it does not need a second design workflow.

## Working depth

| Request | Preparation |
| --- | --- |
| Bounded copy, spacing or control correction | Reuse the existing styles/direction; keep a few notes and verify the affected screen. No new brief or research round by default. |
| New or substantially recomposed screen | Settle a compact brief with product evidence, reading order, the primary action and required states. |
| Substantial public page or several screens | Maintain that brief in the existing planning document, including selected/rejected directions and visual corrections. |

Project rules, tokens and components remain authoritative. The optional
[brief template](../skills/paseo-design/templates/BRIEF.md) links their sources
rather than duplicating them. Research answers specific open decisions; there
is no website quota, mandatory agent team, game or fixed FPS target.

The [creative workflow](../skills/paseo-design/references/creative-workflow.md)
connects material copy/demo claims to product evidence, distinguishes simulated
examples from implemented behavior, and gives interaction and motion a purpose.
After the first render, compare the screen with the brief and actual content.
Record concrete issues, corrections and current recheck evidence in the existing
brief/run record. Measured errors and visual judgment are reported separately.

## Reducing AI slop

The skill now requires a meaning-based subtraction pass: remove repeated
heading/status explanations, decorative micro-labels, redundant card wrappers,
automatic emphasis/effects and generic filler. The
[design digest](../skills/paseo-design/references/design-digest.md) includes
concrete examples and preserves labels, accessible names, units, time ranges
and recovery guidance. Layout, grouping, spacing and hierarchy should carry
relationships; a clean geometry report does not detect semantic duplication.

Visual direction is grounded in the task and actual content. References become
decisions about proportions, typography, density and image treatment. Review a
representative desktop/phone composition before extending it, then correct the
largest mismatch first. Working tools do not require a decorative signature;
the example token template no longer imposes a universal style blacklist.

The wording is a project-specific synthesis, informed by sources reviewed on
2026-10-25, not a copied third-party skill or a mandatory browsing step:

- [NN/g: Aesthetic and Minimalist Design](https://www.nngroup.com/articles/aesthetic-minimalist-design/): remove noise while retaining information needed for the task.
- [Vercel: Web Interface Guidelines](https://vercel.com/design/guidelines): deliberate alignment, concise content, meaningful motion and preserved accessible labels.
- [Anthropic: frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md): subject-specific decisions and avoidance of default typographic labels and visual treatments.
- [Yuta Okada: unnecessary explanatory UI text](https://note.com/dhythm/n/n75f78a70e9cc): an author's comparison of redundant heading, button and status copy; reported partial improvement, not general proof of effectiveness.
- [Kosta Canatselis: Spot the Slop](https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c): practitioner critique of generic slogans, uniform treatments and unmotivated decoration.

These changes are instructions and review criteria. They do not establish
measured aesthetic improvement; that requires comparable generated screens and
separate evaluation. The earlier validation below predates this subtraction
revision and is retained with its original scope.

## Source context

The 2026-10-25 revision follows a static comparison with Dinobot's
[`frontend-craft` at 5071c150](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/plugins/skills/frontend-craft/body.md).
The new Paseobility instructions and template were written for this workflow;
no Dinobot source files, scripts, assets or instruction text were vendored.
Its public snapshot excludes the landing service implementation, so the
comparison did not reproduce its landing-page results. Existing vendored
guides and their attribution are unchanged.

## Validation — 2026-10-25

On Apple Silicon macOS, Node 22.23.2 and Python 3.9.22:

- Catalog/frontmatter validation and skill-creator quick validation passed.
- Catalog tests: 5 passed. Installer/migration tests: 7 passed.
- The unchanged `design-check` passed all 15 selftest checks in installed
  headless Microsoft Edge, with `DESIGN_CHECK_REQUIRE_BROWSER=1`.
- Temporary single-skill installation and reinstallation in a path with spaces
  matched the final local tree in both `.agents` and `.claude`: 155 package
  files plus 17 existing ignored Python bytecode caches. The original marker
  and prior installation were retained in separate backups; an unrelated skill
  fixture was preserved. The real host runtime and daemon were not used by
  those install tests.
- An independent agent exercised two isolated requests. A one-label correction
  kept the existing styles and layout; before/after renders at 375/768/1440px
  each reported zero errors and warnings, and the evaluator viewed the sheets
  and marked images. A new-page preparation request updated the existing brief
  from product sources, distinguished proposed sample interactions from current
  capabilities, and stopped before implementation as requested. Parent review
  checked the brief, report and final sheet. These were scope/decision checks,
  not a comparison of generated designs.
- That exercise exposed ambiguity between a preparation-only request and the
  rendered-completion rule. The entrypoint now explicitly permits completing
  the requested preparation while keeping interface implementation and rendered
  verification unverified. The existing checker's lack of `--help` was also
  observed; its documented file/URL invocation worked, and no runtime code was
  changed for this revision. The evaluator reread the revised entrypoint and
  confirmed the preparation-only interpretation without rerunning unchanged
  browser checks.
- The local `.agents/skills/paseo-design` installation was updated with the
  single-skill installer and its default backup. All 172 local files matched
  source, including the unchanged caches. Digest comparison confirmed that
  the other 29 installed agent skills and the existing Claude design skill
  were unchanged. This does not prove discovery in a fresh provider session;
  a new session or integration reload may be needed.

These checks establish packaging and checker behavior. They do not establish
a general improvement in design preference, task duration or model cost, or
certify Windows/Linux execution. Such claims need comparable real tasks and
separate measurements. The entrypoint's required rendered page checks remain
in place; the checker selftest is not a substitute for them.
