# Design digest

Condensed from Anthropic's `frontend-design` (Apache-2.0) and Hermes' `claude-design` (MIT). The full texts are in `../vendor/frontend-design/GUIDE.md` and `../vendor/hermes/claude-design/GUIDE.md`; read them when you need the long form. Read this before composing anything.

## Concept first

The single biggest difference between a page people call pretty and one they call generated is a concept: one idea taken from the subject's world and carried through color, type, shape and the memorable element. Airmail for an address converter, the paper slip for a lottery picker, ink and a red seal for fortune telling. Find it before the layout, then let it license boldness: saturated color, big type, illustration, texture, a tilt, a stripe. Restraint is a tool, not a goal; a page that avoids every tell but has no idea is bland, and bland reads as generated too.

## Start from context, not vibes

Read brand docs, existing screens, components, tokens, copy, and the constraints from product, legal or engineering. The file tree is only the menu; read the files that define the visual vocabulary (theme, tokens, global stylesheet, button/card/form components) before drawing. If fidelity matters and context is missing, ask two or three short questions instead of inventing a generic mockup. Skip questions for small tweaks, continuations, or when the missing detail has an obvious default; label the important assumptions.

## Name the surface first

Most AI design slop is compositional, not cosmetic: the model reaches for a centered hero plus three equal cards for every surface, then decorates. Recoloring never fixes that. Before any color or type decision, commit out loud to one surface:

1. **Monitor**: watching state change (dashboards, status pages). Density, glanceable hierarchy, no marketing framing.
2. **Operate**: acting on things (consoles, admin panels, queues, inboxes). Action affordances and selection state dominate.
3. **Compare**: weighing options (pricing, plans, spec tables, results). Aligned columns, structural parity, one differentiator emphasized.
4. **Configure**: setting things up (settings, forms, wizards, onboarding). Progressive disclosure, clear save and validation states, low decoration.
5. **Decide / Learn**: being convinced or taught (landing pages, docs, marketing). One idea per section. The only surface where a hero is usually right.
6. **Explore**: browsing an open space (galleries, maps, catalogs, search and filter). Filters, result grids, peek and zoom are the composition.
7. **Command / Inspect**: driving by keyboard or drilling into one object (command bars, inspectors, detail panes). Speed and focus over breadth.

State the surface in one line. A dashboard is Monitor, not Decide. If a screen spans two, name the primary and treat the other as secondary; do not average them.

## Plan, then check the plan

Work in two passes. First a short plan: surface, reading order (first, second, third), the one memorable element, type roles, color posture, what stays quiet, alignment (left or centered, and why), density. Then check it against the tell list below: if any part is what you would produce for any similar brief, change it and say why. Only then write code.

## Ground the look in the subject

The subject's industry, materials and vernacular are where distinctive choices come from; a tool for financial analysts and a toy shop should not share a look. Build with the brief's real content. Placeholder copy reads as templated as a placeholder layout.

## Type

One family, or two clearly distinct ones. Choose deliberately rather than the default you reach for everywhere, and set a clear scale with intentional weights and spacing. Lines under 80 Latin characters, 30 to 45 Korean characters; serif body gets a little more line-height. Type is hierarchy before boxes, icons or color.

Tells: one accented word in a headline (italic, bold or a color); all-caps labels; labels above content that add nothing; numbered 01/02/03 markers on content that is not a sequence.

## Color

Brand or design-system colors first. Without them, a small system: ink, muted text, surface, border, one accent, danger and success only if needed. Check contrast on text and controls. Do not invent many colors.

## Structure is information

Borders, dividers, eyebrows, numbering and outlines encode meaning or they go. Spend boldness in one place and keep everything around it quiet. Build to a quality floor without announcing it: responsive to phones, visible keyboard focus, reduced motion respected, readable contrast. Before shipping, remove one accessory.

## Motion

One orchestrated moment lands better than scattered effects; fade-and-slide-up on every section and a hover transition on every card is the generic default. Motion that answers a user's action (opening, expanding, confirming) is welcome. Respect `prefers-reduced-motion`.

## Content discipline

No fake metrics, decorative stats, generic feature grids, placeholder testimonials, filler sections, or invented claims. Ask before adding sections or claims; mark draft copy as draft. Write from the user's side, in their words: active voice, sentence case, a button that says what happens ("Save changes", not "Submit") and keeps its name through the flow ("Publish" produces "Published"). Errors say what went wrong and how to fix it; an empty state is an invitation to act.

## Variations

When exploring, three options: conservative (closest to what exists), strong fit (best reading of the brief), divergent (to find the taste boundary). Not color swaps. When the user picks, consolidate; do not leave a pile of options.

## The ten AI tells (habits to notice, not rules to obey)

1. Tech gradient: glossy blue, violet or indigo gradient on everything.
2. Generic tech hue: indigo or violet accent chosen by habit, not for the brand.
3. Feature-tile grid: icon plus heading plus sentence, times three, all equal weight.
4. Accent rail: a colored left strip on cards, decoration pretending to be organization.
5. Unearned blur: glass effects with no depth system behind them.
6. Monument stat: oversized numbers filling space the product story should carry.
7. Icon topper: a rounded-square icon centered above every heading.
8. Center stack: everything centered because no composition was committed to.
9. Default type: Inter or system-ui used by default rather than chosen.
10. Wrong surface: the composition does not match the surface (a hero on a Monitor). The root cause behind most of the others.

Current clichés to add to the list: cream background with a high-contrast serif display and a terracotta accent; near-black with one acid-green or vermilion accent; broadsheet hairlines with zero radius and dense columns; the SaaS card kit (identical rounded cards, one radius everywhere, the same soft shadow, gradient washes); template chrome (tracked ALL-CAPS eyebrow above every heading, "A · B · C" meta strings, "WORD — fragment" labels, tinted near-black, monospace for small data labels, "→" on every button). All legitimate for some briefs; none a default.

Diagnose first, then repair in the matching register. Tells 3, 8 and 10 need a new composition (do not recolor). Tells 1, 2 and 9 need a new palette or type. Tells 4 to 7 need the decoration removed and hierarchy rebuilt with scale, weight and spacing. Re-score after repairing; do not stop while 3, 8 or 10 still fire. `design-check` flags 1, 4, 5, 6, 7, 8 and 9 (and part of 2) mechanically; 3 and 10 are yours to judge.

## Verification

The file exists and is complete; it opens; the console is clean; screenshots at the primary viewports look right; key interactions work; light and dark and reduced motion if present. Say exactly what was and was not verified. Never say done if it was not rendered.
