---
name: paseo-design
description: >-
  Use when building, changing, or reviewing a web or app interface, layout,
  styling, or frontend visuals with measured checks. Follows the project's own
  design rules when it has them; otherwise locks a small token set, composes
  surface-first, implements in the project's stack, then proves the result
  with scripts/design-check.mjs (phone, tablet and desktop screenshots plus
  measured findings) and fixes every error before calling the work done. Do
  not use for design discussion that changes no interface.
---

# paseo-design

Web and app frontend work. Leave tasks that do not change the interface alone.

Paths are relative to this skill's directory. When your working directory is the project, prefix them with the skill's absolute location (Claude Code: `~/.claude/skills/paseo-design/`; Codex and OpenCode: `~/.agents/skills/paseo-design/`). Scripts need Node 20+ and, for step 4, a Chromium-family browser on the machine (Chrome, Edge, Chromium, or a Playwright download). Nothing is installed by this skill.

## 0. The project's own rules win

Before anything else, look for design rules the project already has:

1. a design skill inside the repo (`.claude/skills/*design*`, `.agents/skills/*design*`, UI sections in `AGENTS.md` or `CLAUDE.md`);
2. a design document (`DESIGN.md`, `design.md`, `docs/DESIGN.md`, `docs/design/*`);
3. token sources (`ui_tokens.*`, `tokens.*`, `theme.*`, `tailwind.config.*`, a Tailwind `@theme` block, CSS custom properties in the global stylesheet);
4. UI checks the repo already runs (save hooks, lint scripts, screenshot or visual-regression tests, Storybook).

If any exist, follow them, reuse their components and tokens, run their checks, and do not create a second source of truth: no new `DESIGN.md`, no new palette, no new component for a pattern that exists. Then build, and run design-check (step 4) unless the project already has a check that renders and measures the page.

## 1. Lock the tokens (only when the project has none)

Read `DESIGN.md` at the project root if it exists. Its values are binding; every guide below loses to it.

If it does not exist, find the concept first (step 2), then choose a small token set yourself and state it:

- 4 to 6 colors (ink, muted, surface, border, one accent; danger and success only if needed), body text at 4.5:1 or better;
- 1 or 2 type families. If the interface shows Korean, the first family must be a Korean one (Pretendard, Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic). Inter, Geist or system-ui first means Korean renders in whatever the OS falls back to;
- a 4-px spacing scale with 6 or 7 steps (4/8/12/16/24/32/48), 2 or 3 radii, 2 or 3 shadows;
- a do-not list.

For a project that will keep growing, write `DESIGN.md` from `templates/DESIGN.md` (Google's DESIGN.md format; schema and pitfalls in `vendor/hermes/design-md/GUIDE.md`) and lint it:

    npx -y -p @google/design.md@0.4.0 designmd lint DESIGN.md

The dotted bin name `design.md` does nothing on Windows (exit 0, no output), so empty output is a failure, not a pass. Fix errors.

## 2. Find the concept, then compose

Read `references/design-digest.md` (concept first, the surface list, the AI-tell list). Then:

- Find one concept in the subject's own world before any layout: its objects, materials, rituals and vernacular (an address converter becomes airmail: striped borders, stamps, a typewritten label; a lottery page becomes the paper slip). Name it in one line. The concept decides color, type, shapes and the one memorable element. A screen without a concept is what makes generated UI look bland and interchangeable, more than any single tell.
- When the direction is open or taste matters to the user, sketch three clearly different directions (concept, palette, type, memorable element), render a first screen of each and show them side by side or pick the strongest. Otherwise commit to the best concept and build.
- Name the surface in one line before choosing a layout: Monitor, Operate, Compare, Configure, Decide/Learn, Explore, or Command/Inspect. A hero plus three equal cards is right for Decide/Learn only.
- Read what exists: screens, components, copy, the screenshots the user gave. Reuse components (the project's own, shadcn/ui, the design system) before adding any.
- Ask only when the brand or audience is unknown and guessing would waste real work. Otherwise state your assumptions and proceed.
- Before coding a new screen, settle surface, reading order, the memorable element and density, and rework any part that reads like what you would produce for any similar brief.
- When the user names a known product as a reference and the project has no tokens yet, read only the matching file in `vendor/hermes/popular-web-designs/templates/`. Take vocabulary (density, contrast posture, type roles), never a branded layout.
- `vendor/ui-ux-pro-max/GUIDE.md` fronts a searchable rule base: `python vendor/ui-ux-pro-max/scripts/search.py "<query>" --domain ux` (use `python3` or `py -3` if `python` is missing). Skip `--persist`; it writes a second design source into the project.

## 3. Implement in the project's stack

Write production code in the repo's framework. A standalone HTML artifact only when the user asks for one. Step 4 measures these, so build them in:

- Korean text: `word-break: keep-all; overflow-wrap: break-word` on `body`; `overflow-wrap: anywhere` or `min-width: 0` only on boxes that must be allowed to shrink; no letter-spacing on Korean body text; line-height 1.6 to 1.75; 30 to 45 characters per line; `text-wrap: balance` on headings.
- Spacing from the scale only. One `gap` per row or column instead of per-item margins. One container (max-width and side padding) for every section.
- Controls on one row share one height token (40px; 44px on phones) and sit on `align-items: center`.
- Contrast 4.5:1 (3:1 at 24px or bold 19px and up); tap targets 44px on phones; nothing under 12px.
- Images keep their aspect ratio (`object-fit: cover` or one fixed dimension) and carry `alt`. Keyboard focus stays visible (`:focus-visible` ring; never bare `outline: none`). Buttons and inputs use one or two height tokens across the page; icons in a row share one size. Animations stop under `prefers-reduced-motion: reduce`.
- The AI tells (gradient washes, glows, glass, left accent rails, tracked uppercase eyebrows, emoji as icons, icon toppers, arrows in button text, centered multi-line paragraphs) are habits, not bans. Do not reach for them by default; use any of them boldly when the concept calls for it (an airmail border is a gradient, a tilted envelope is a rotation, a seal stamp is a red accent). What to cut is decoration that belongs to no idea. Over-restraint is its own failure: a page of grey cards that passes every check can still be bad.

## 4. Prove it with design-check

Render and measure every changed screen at phone, tablet and desktop widths:

    node scripts/design-check.mjs <url-or-file> [more ...] --out <dir>

Per page and width it writes a clean screenshot, a marked screenshot with numbered boxes, `-report.md` with a fix hint per finding, `-report.json`, and `-sheet.png` with all widths side by side. Exit 1 means errors remain; exit 2 means the tool could not run (no browser, page did not load).

- Open the sheet and the marked screenshots and look at them. The machine finds overflow, clipping, overlap, misalignment, uneven rhythm, contrast, Hangul mid-word breaks, scale sprawl and the common AI tells. You judge hierarchy, composition, copy and whether one thing is memorable; `references/review-checklist.md` lists what to look for.
- Fix errors and rerun until none remain, or `--ignore`/`--disable` a false positive with the reason. Fix the warnings that matter.
- Findings named `ai-*` are 참고 (info): they point at habits. Keep one when the concept needs it; remove it when it is decoration for its own sake.
- Judge blandness as hard as breakage: is there one memorable element, does the page look like this subject and no other, would a designer keep it? If it is merely tidy, push the concept further and rerun.
- When the change touches forms, keyboard flow or motion, check it against `vendor/web-design-guidelines/command.md` (Vercel's Web Interface Guidelines) for what a renderer cannot see.
- Changing an existing screen: a design-check run before you edit gives a before/after comparison.
- Running app: use its dev or staging URL. If nothing is serving, start the project's dev server in the background (its `package.json` scripts or run skill), wait for the port, check, then stop it. Never exercise production data. Pages behind a login: a staging server with a test account, or a saved copy of the rendered HTML.
- A project with a dark theme: add `--scheme light,dark`.
- Findings marked 참고 (info) do not fail the run but tell you what the machine could not measure (text over images, a screenshot cut at `--max-height`); check those by eye.
- If you cannot view images in this runtime, say so in the report and rely on the findings and hints. Do not claim you looked at a screenshot you could not open.
- Legacy pages with old findings: `--baseline <file>` fails only when a rule count grows; `--update-baseline` after you fixed some. `--ignore <selectors>` for third-party embeds; `--disable <rules>` with the reason in the report.
- `node scripts/design-check.mjs --selftest` proves the checker works on this machine (about 20 seconds).

## 5. Report

What changed, the design-check result (errors, notable warnings, before/after counts when you have them), the screenshot paths, design issues you found and fixed, and what was not verified. Never claim a screen was checked if it was not rendered.

## Exercising the running app

When the user wants the app clicked through, follow `/paseo-browser` for the browser (installed Ego Lite task space preferred, or the selected existing Chrome tab; that skill defines lifecycle and alternatives) and `vendor/hermes/dogfood/GUIDE.md` for the plan, explore, evidence and report sequence and its severity taxonomy. Only on a local or staging instance; saving and submitting test data there is fine. Ask before deleting data you did not create.

## About the vendored guides

`vendor/` carries the upstream texts with their licenses (`vendor/SOURCES.md`). They were written for other runtimes: skip sentences that call `write_file`, `skill_view`, `browser_vision`, `generative-widgets`, cloudflared tunnels, or `${CLAUDE_PLUGIN_ROOT}` paths, and use your own file and browser tools. Where this file and a vendored guide disagree, this file wins; where any guide and `DESIGN.md` disagree, `DESIGN.md` wins.
