---
name: paseo-design
description: Use when building, changing, or reviewing an interface, layout, styling, or frontend visuals. Read project-root DESIGN.md first, reuse existing components, then follow the vendored direction, pattern, and review skills.
---

# paseo-design

Use this for web or app frontend work. Leave tasks that do not change the interface alone.

Locked tokens win over every skill below. A skill that proposes a new palette, font, spacing scale, or radius loses.

Paths below are relative to the directory that contains this file.

## 1. Lock the tokens

Read `DESIGN.md` at the project root when it exists. It holds 4 colors, 2 fonts, spacing `4/8/12/16/24/40`, one radius, and the do-not list. Those values are binding.

If a Penpot export or other token file is already in the repo, copy those values into `DESIGN.md` before writing UI. Do not redesign them.

If `DESIGN.md` is missing, read `vendor/hermes/design-md/SKILL.md` and write that minimal file. Then run `npx -y @google/design.md lint DESIGN.md` from the project root and fix errors. Export Tailwind only when the project has no theme yet or the user asks.

Read `design/reference/` before drawing. Use the desktop image and the mobile image when both exist. If neither exists, ask for them instead of inventing an average layout.

## 2. Compose, then implement

Name one surface before choosing layout. The surface list and the slop diagnostic are in `vendor/hermes/claude-design/SKILL.md`. Read that file for the process. Implement in the project's stack. Write a standalone HTML file only when the user asks for an artifact.

For a new screen or a visual reshape, read `vendor/frontend-design/SKILL.md` for direction. Its color, type, spacing, and radius suggestions lose to `DESIGN.md`.

For layout and components, read `vendor/ui-ux-pro-max/SKILL.md`. Run its search with `python3 vendor/ui-ux-pro-max/scripts/search.py` from this skill's directory. Reuse components the project already has, including shadcn/ui. Do not add a new card for a pattern that already exists. Do not pass `--persist`, and do not write a `design-system/` file.

When the user names a known product and `DESIGN.md` does not exist yet, read `vendor/hermes/popular-web-designs/SKILL.md` and only the one matching file in its `templates/` directory. Use it as vocabulary. Do not copy a branded layout. Skip this when `DESIGN.md` exists.

## 3. Review the built UI

Run the slop diagnostic from `vendor/hermes/claude-design/SKILL.md`. Repair the tells it flags. Composition problems get a new layout. Spacing and type problems stay inside the locked tokens.

Read `vendor/web-design-guidelines/SKILL.md` and review the changed UI. Compare a browser screenshot with `design/reference/` at desktop and mobile. On that comparison, change spacing and hierarchy only.

When the user wants the running app exercised, read `vendor/hermes/dogfood/SKILL.md` and follow its plan, explore, evidence, and report sequence. Use the Paseo browser tools that are available, including `browser_snapshot`, `browser_click`, `browser_fill`, `browser_screenshot`, and `browser_logs`. Do not call Hermes-only tool names.
