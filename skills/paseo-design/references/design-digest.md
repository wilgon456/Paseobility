# Design digest

Condensed from Anthropic's `frontend-design` (Apache-2.0) and Hermes' `claude-design` (MIT). The full texts are in `../vendor/frontend-design/GUIDE.md` and `../vendor/hermes/claude-design/GUIDE.md`; read them when you need the long form.

## Direction before decoration

Choose a direction that serves the product and its users, then make it visible in proportions, type, density and imagery. An expressive page may draw on the subject's materials or rituals: airmail for an address converter or a paper slip for a lottery picker. A working tool may instead earn its quality through precise alignment, useful density and familiar controls. A metaphor is optional. Neither bold decoration nor extreme restraint guarantees quality; judge the rendered composition against the actual task.

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

Before code, settle surface, reading order (first, second, third), dominant content, type roles, color posture, what stays quiet, alignment and density. Reuse familiar patterns when they fit; change a generic composition when it fails the actual content or task. Distinctiveness should come from appropriate decisions, not novelty for its own sake.

## Ground the look in the subject

The subject's industry, materials and vernacular are where distinctive choices come from; a tool for financial analysts and a toy shop should not share a look. Build with the brief's real content. Placeholder copy reads as templated as a placeholder layout.

## Type

One family, or two clearly distinct ones. Choose deliberately rather than the default you reach for everywhere, and set a clear scale with intentional weights and spacing. Lines under 80 Latin characters, 30 to 45 Korean characters; serif body gets a little more line-height. Type is hierarchy before boxes, icons or color.

Tells: one accented word in a headline (italic, bold or a color); all-caps labels; labels above content that add nothing; numbered 01/02/03 markers on content that is not a sequence.

## Color

Brand or design-system colors first. Without them, a small system: ink, muted text, surface, border, one accent, danger and success only if needed. Check contrast on text and controls. Do not invent many colors.

## Structure is information

Borders, dividers, eyebrows, numbering and outlines should clarify relationships. Establish a dominant region with quieter supporting content, and use space before unnecessary containers. Build to a quality floor without announcing it: responsive to phones, visible keyboard focus, reduced motion respected, readable contrast. Remove accessories that add no meaning; do not remove useful cues to satisfy a quota.

## Motion

One orchestrated moment lands better than scattered effects; fade-and-slide-up on every section and a hover transition on every card is the generic default. Motion that answers a user's action (opening, expanding, confirming) is welcome. Respect `prefers-reduced-motion`.

## Content discipline

No fake metrics, decorative stats, generic feature grids, placeholder testimonials, filler sections, or invented claims. Mark draft copy as draft. Write from the user's side, in their words: active voice, sentence case, a button that says what happens ("Save changes", not "Submit") and keeps its name through the flow ("Publish" produces "Published"). Errors say what went wrong and how to fix it; an empty state is an invitation to act.

## Subtract low-value UI

For each visible element, ask what would be lost if it were removed: new
information, an action, orientation, feedback or purposeful visual expression.
If none is lost, remove it. Let placement, grouping, spacing and type hierarchy
explain relationships before adding another caption or container. This is a
review of meaning, not a word-count target or a demand for bare screens.

| Pattern to remove by default | Better treatment |
| --- | --- |
| A subtitle that paraphrases its heading | Under `프로젝트 목록`, omit `프로젝트를 확인하고 관리하세요` when the list and actions already convey it. |
| Several phrases for one state | Keep `사용 가능`; omit adjacent `지금 사용할 수 있습니다`. Keep distinct availability conditions. |
| A decorative micro-label or number | Remove `OVERVIEW` above a self-explanatory heading and `01/02/03` from non-sequential content. Retain useful category or step labels. |
| Every fragment wrapped in a card | Use shared space, rows or a table when the content belongs together; keep containers that clarify a meaningful group or action. |
| Automatic emphasis and effects | Omit arbitrary headline-word coloring, repeated icon toppers, gradient accents and reveal animations unless they direct attention, explain change or support the chosen visual direction. |
| Generic slogans or filler sections | State the actual capability and audience. Do not invent benefits, statistics or testimonials to balance a layout. |

Keep button labels short and specific to the action; shorten redundant object
names only when the target stays clear. Preserve visible input labels,
accessible names, units, date ranges, constraints, recovery instructions and
consequential-action information. A status icon plus text can improve access;
two sentences saying the same thing add no information. Do not replace useful
visible guidance with an ambiguous icon or a hover-only tooltip.

In rendered review, check whether removal preserves first-time comprehension
and the next action. If it does not, restore the needed cue or fix the grouping.
Do not claim a comprehension study from visual inspection alone. Fix identified
noise before completion; a passing geometry report does not detect semantic
duplication or prove that the remaining copy is useful.

## Variations

When alternatives would resolve an open decision, compare different compositions: conservative (closest to what exists), strong fit (best reading of the brief), divergent (to find the taste boundary). Not color swaps. A supplied reference or established direction can make this unnecessary. Once a direction is chosen, consolidate.

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

Do not replace these habits with a new universal aesthetic. A cream editorial page, dark technical console or rounded card system can each be appropriate. Judge why the treatment belongs here and whether its execution supports the content; its popularity alone is not a defect.

Diagnose first, then repair at the right level. When an equal tile grid, center stack or wrong surface fails the task, change the composition before recoloring. When palette, type or decoration undermines hierarchy, correct that relationship. A detected habit is a prompt to inspect, not a demand to replace a valid choice. `design-check` flags 1, 4, 5, 6, 7, 8 and 9 (and part of 2) mechanically; 3 and 10 are yours to judge. The diagnosis table in `creative-workflow.md` connects visible symptoms to corrections.

## Verification

The file exists and is complete; it opens; the console is clean; screenshots at the primary viewports look right; key interactions work; light and dark and reduced motion if present. Say exactly what was and was not verified. Never say done if it was not rendered.
