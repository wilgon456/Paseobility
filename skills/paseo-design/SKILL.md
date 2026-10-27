---
name: paseo-design
description: >-
  Use when building, changing, or reviewing a web or app interface, layout,
  styling, or frontend visuals. Turns product intent and references into a
  coherent composition, implements in the project's stack, and improves the
  rendered result through visual critique and measured checks. Reuses project
  design rules and verifies phone, tablet and desktop layouts with
  scripts/design-check.mjs before calling an interface complete. Do
  not use for design discussion that changes no interface.
---

# paseo-design

Web and app frontend work. Leave tasks that do not change the interface alone.

Optimize for a screen that fits its users, content and product: clear hierarchy,
deliberate proportions, coherent typography and useful interaction. Distinctive
expression matters when the brief calls for it; quiet, familiar precision can
be the right result for a working tool. A list of avoided styles or a clean
checker report is not evidence of good design.

Paths are relative to this skill's directory. When your working directory is the project, prefix them with the skill's absolute location (Claude Code: `~/.claude/skills/paseo-design/`; Codex and OpenCode: `~/.agents/skills/paseo-design/`). Scripts need Node 20+ and, for step 4, an installed Chromium-family browser. `design-check` prefers Ego Lite, then Chrome, then other supported Chromium builds or an existing Playwright download; Microsoft Edge is never auto-selected. Ego Lite's standard paths are `/Applications/ego lite.app` on macOS and `C:\Program Files\Citro Labs\ego lite\Application\ego.exe` on Windows. `DESIGN_CHECK_BROWSER` (or `CHROME_PATH`) selects an explicit executable. Nothing is installed by this skill.

## 0. The project's own rules win

Before anything else, look for design rules the project already has:

1. a design skill inside the repo (`.claude/skills/*design*`, `.agents/skills/*design*`, UI sections in `AGENTS.md` or `CLAUDE.md`);
2. a design document (`DESIGN.md`, `design.md`, `docs/DESIGN.md`, `docs/design/*`);
3. token sources (`ui_tokens.*`, `tokens.*`, `theme.*`, `tailwind.config.*`, a Tailwind `@theme` block, CSS custom properties in the global stylesheet);
4. UI checks the repo already runs (save hooks, lint scripts, screenshot or visual-regression tests, Storybook).

If any exist, follow them, reuse their components and tokens, run their checks, and do not create a second source of truth: no new `DESIGN.md`, no new palette, no new component for a pattern that exists. Apply the workflow below within those rules; use design-check (step 4) unless the project already has a check that renders and measures the page.

## Choose the working depth

When explicitly invoked for planning or preparation only, stop at the requested
brief or recommendations. Report that implementation and rendered verification
remain; do not build a screen merely to satisfy step 4. The render requirement
applies to claiming a completed interface, not to a preparation-only deliverable.

- A bounded correction (copy, spacing, one control): keep the intent, affected state and check in a few working notes. Reuse local styles and the established direction; skip token/concept exploration that would not affect the correction. No new brief, research round or variants by default.
- A new or substantially recomposed screen: settle a compact brief before implementation. For multi-screen work or a substantial public page, keep it in the project's existing brief/planning document so revisions and rejected directions survive resumption. Use `templates/BRIEF.md` only when a new document is useful; omit irrelevant sections. Link to existing tokens and components rather than copying their definitions.
- For composed screens, read [references/creative-workflow.md](references/creative-workflow.md): product evidence before copy, references chosen for specific decisions, purposeful interaction, and a recorded visual revision loop. Small corrections need only its relevant parts.

This skill owns the design procedure even when called by `paseo-god` or another workflow. Put design decisions and review evidence in the existing brief or run record; do not maintain parallel records. A design task does not itself authorize deployment, publication or merging.

## 1. Lock the tokens (only when the project has none)

Read `DESIGN.md` at the project root if it exists. Its values are binding; every guide below loses to it.

If it does not exist, choose the visual direction first (step 2), then choose a small token set yourself and state it:

- 4 to 6 colors (ink, muted, surface, border, one accent; danger and success only if needed), body text at 4.5:1 or better;
- 1 or 2 type families. If the interface shows Korean, the first family must be a Korean one (Pretendard, Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic). Inter, Geist or system-ui first means Korean renders in whatever the OS falls back to;
- a 4-px spacing scale with 6 or 7 steps (4/8/12/16/24/32/48), 2 or 3 radii, 2 or 3 shadows;
- a do-not list.

For a project that will keep growing, write `DESIGN.md` from `templates/DESIGN.md` (Google's DESIGN.md format; schema and pitfalls in `vendor/hermes/design-md/GUIDE.md`) and lint it:

    npx -y -p @google/design.md@0.4.0 designmd lint DESIGN.md

The dotted bin name `design.md` does nothing on Windows (exit 0, no output), so empty output is a failure, not a pass. Fix errors.

## 2. Choose the direction, then compose

Read `references/design-digest.md` (visual direction, the surface list, the AI-tell list). Then:

- State a visual direction tied to the user and task, with concrete consequences for density, type, proportions and emphasis. For an expressive page, the subject's materials or imagery can supply a concept. For a working tool, clarity, scan speed and consistency may supply the direction; do not force a visual metaphor or signature ornament.
- When the direction is genuinely open and comparing alternatives will resolve it, explore distinct compositions (content priority, density, type and image treatment), render representative views and compare them against the task. A requested reference, chosen direction or small correction is usually enough to proceed without variants.
- Name the surface in one line before choosing a layout: Monitor, Operate, Compare, Configure, Decide/Learn, Explore, or Command/Inspect. A hero plus three equal cards is right for Decide/Learn only.
- Read what exists: screens, components, copy, the screenshots the user gave. Reuse components (the project's own, shadcn/ui, the design system) before adding any.
- Avoid unnecessary auxiliary labels and explanations. Let layout, grouping, spacing, hierarchy and clear control names explain the interface. Remove subtitles that repeat headings and helper text that merely narrates an obvious action; fix an unclear composition before adding prose to explain it. Keep visible input labels, accessible names, constraints, error/recovery guidance and consequential-action information when users need them to act correctly.
- Give each element a job: new information, a needed action or a meaningful visual role. Cut duplicate status copy, decorative micro-labels, unnecessary card wrappers and repeated icon toppers. Do not fill space with slogans, invented metrics or extra sections. Use the subtraction examples in `references/design-digest.md` during composition and rendered review; preserve units, time ranges and other context needed to interpret values.
- Ask only when the brand or audience is unknown and guessing would waste real work. Otherwise state your assumptions and proceed.
- Before coding a new screen, settle reading order, dominant content, density and phone adaptation. Translate references into observable decisions (column balance, type roles, image crop, spacing rhythm), not mood words alone; use `references/creative-workflow.md` for the first-screen and critique process.
- When the user names a known product as a reference and the project has no tokens yet, read only the matching file in `vendor/hermes/popular-web-designs/templates/`. Take vocabulary (density, contrast posture, type roles), never a branded layout.
- `vendor/ui-ux-pro-max/GUIDE.md` fronts a searchable rule base: `python vendor/ui-ux-pro-max/scripts/search.py "<query>" --domain ux` (use `python3` or `py -3` if `python` is missing). Skip `--persist`; it writes a second design source into the project.

## 3. Implement in the project's stack

Write production code in the repo's framework. A standalone HTML artifact only when the user asks for one. Step 4 measures these, so build them in:

- Korean text: `word-break: keep-all; overflow-wrap: break-word` on `body`; `overflow-wrap: anywhere` or `min-width: 0` only on boxes that must be allowed to shrink; no letter-spacing on Korean body text; line-height 1.6 to 1.75; 30 to 45 characters per line; `text-wrap: balance` on headings.
- Spacing from the scale only. One `gap` per row or column instead of per-item margins. One container (max-width and side padding) for every section.
- Controls on one row share one height token (40px; 44px on phones) and sit on `align-items: center`.
- Contrast 4.5:1 (3:1 at 24px or bold 19px and up); tap targets 44px on phones; nothing under 12px.
- Images keep their aspect ratio (`object-fit: cover` or one fixed dimension) and carry `alt`. Keyboard focus stays visible (`:focus-visible` ring; never bare `outline: none`). Buttons and inputs use one or two height tokens across the page; icons in a row share one size. Animations stop under `prefers-reduced-motion: reduce`.
- For substantial copy or demos, check the underlying product behavior and label simulations. For motion, define the state change and its reduced-motion equivalent before choosing effects; use the focused guidance in `references/creative-workflow.md` when needed.
- The AI tells (gradient washes, glows, glass, left accent rails, tracked uppercase eyebrows, emoji as icons, icon toppers, arrows in button text, centered multi-line paragraphs) are habits, not bans. Do not reach for them by default; use any of them boldly when the concept calls for it (an airmail border is a gradient, a tilted envelope is a rotation, a seal stamp is a red accent). What to cut is decoration that belongs to no idea. Over-restraint is its own failure: a page of grey cards that passes every check can still be bad.

## 4. Prove it with design-check

Render and measure every changed screen at phone, tablet and desktop widths:

    node scripts/design-check.mjs <url-or-file> [more ...] --out <dir>

This explicit headless check launches the selected browser with a temporary
profile, preferring Ego Lite then Chrome; it does not attach to the user's
interactive Ego TaskSpace or Chrome profile.

Per page and width it writes a clean screenshot, a marked screenshot with numbered boxes, `-report.md` with a fix hint per finding, `-report.json`, and `-sheet.png` with all widths side by side. Exit 1 means errors remain; exit 2 means the tool could not run (no browser, page did not load).

- Open the sheet and the marked screenshots and look at them. The machine finds overflow, clipping, overlap, misalignment, uneven rhythm, contrast, Hangul mid-word breaks, scale sprawl and the common AI tells. You judge hierarchy, composition, copy and fit to the visual direction; `references/review-checklist.md` lists what to look for.
- Compare the first rendered screen with the brief and actual product content before extending its composition to other screens. Record concrete visual issues, corrections and recheck evidence in the existing brief/run record (the format is in `references/creative-workflow.md`). Zero measured errors and visual quality are separate judgments. After a relevant edit, refresh the affected screenshots; old images do not prove the final state.
- Fix errors and rerun until none remain, or `--ignore`/`--disable` a false positive with the reason. Fix the warnings that matter.
- Findings named `ai-*` are 참고 (info): they point at habits. Keep one when the concept needs it; remove it when it is decoration for its own sake.
- Review task fit, hierarchy/proportions, typography, content/assets and responsive composition separately. Tie each material weakness to a visible location and correction. Fix structure before decorative polish, then compare fresh screenshots; use the diagnosis table in `references/creative-workflow.md`. Do not invent a beauty score or add ornament just to make a working tool distinctive.
- When the change touches forms, keyboard flow or motion, check it against `vendor/web-design-guidelines/command.md` (Vercel's Web Interface Guidelines) for what a renderer cannot see.
- Changing an existing screen: a design-check run before you edit gives a before/after comparison.
- Running app: use its dev or staging URL. If nothing is serving, start the project's dev server in the background (its `package.json` scripts or run skill), wait for the port, check, then stop it. Never exercise production data. Pages behind a login: a staging server with a test account, or a saved copy of the rendered HTML.
- A project with a dark theme: add `--scheme light,dark`.
- Findings marked 참고 (info) do not fail the run but tell you what the machine could not measure (text over images, a screenshot cut at `--max-height`); check those by eye.
- If you cannot view images in this runtime, say so in the report and rely on the findings and hints. Do not claim you looked at a screenshot you could not open.
- Legacy pages with old findings: `--baseline <file>` fails only when a rule count grows; `--update-baseline` after you fixed some. `--ignore <selectors>` for third-party embeds; `--disable <rules>` with the reason in the report.
- `node scripts/design-check.mjs --selftest` proves the checker works on this machine (about 20 seconds).

## 5. Report

What changed, the design-check result (errors, notable warnings, before/after counts when you have them), current screenshot paths and the widths/states actually covered, visual issues fixed or still open, and what was not verified. Distinguish observed product behavior from a simulated demo and measured performance from a target. Never claim a screen or state was checked if it was not rendered or exercised; the checker selftest proves the checker, not the page or its design quality.

## Exercising the running app

When the user wants the app clicked through, follow `/paseo-browser` for the browser (installed Ego Lite task space preferred, or the selected existing Chrome tab; that skill defines lifecycle and alternatives) and `vendor/hermes/dogfood/GUIDE.md` for the plan, explore, evidence and report sequence and its severity taxonomy. Only on a local or staging instance; saving and submitting test data there is fine. Ask before deleting data you did not create.

## About the vendored guides

`vendor/` carries the upstream texts with their licenses (`vendor/SOURCES.md`). They were written for other runtimes: skip sentences that call `write_file`, `skill_view`, `browser_vision`, `generative-widgets`, cloudflared tunnels, or `${CLAUDE_PLUGIN_ROOT}` paths, and use your own file and browser tools. Where this file and a vendored guide disagree, this file wins; where any guide and `DESIGN.md` disagree, `DESIGN.md` wins.
