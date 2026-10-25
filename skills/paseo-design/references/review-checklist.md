# Review checklist: what to look at in the screenshots

`design-check` measures geometry and style discipline. These are the judgments it cannot make. Look for them on the `-sheet.png` and the `-marked.png` of every width; report what you found and fixed, not a line-by-line answer sheet.

Compare with the current brief and real product content. Keep actionable issues,
corrections and recheck evidence in the existing brief/run record as described
in `creative-workflow.md`; do not create another checklist document. Review the
first rendered screen before propagating its composition. After edits, inspect
fresh images of the affected screen/state; a zero-error report alone does not
establish visual quality.

## Concept and appeal

- Can you say the concept in one line, and is it visible in color, type and the memorable element?
- Would someone call this pretty, or only tidy? Bland is a defect: push the concept until the page could only belong to this subject.
- Is boldness spent in one place, with everything around it calm?

## Hierarchy (the first three seconds)

- Can you tell what the screen is for and what to do first without reading everything?
- Is there exactly one primary action per view, and does it look like the most important thing?
- Does the reading order follow the task order?

## Composition

- Does the layout match the surface you named? A Monitor with a hero, or a Configure screen with marketing cards, is a composition error: relayout, do not restyle.
- Is there one memorable element with everything else quiet, or does every block shout equally?
- Are related things close and unrelated things apart, grouped by space before boxes?
- Same job, same component, same place, across screens?

## Content

- Does every label use the user's words, sentence case, active voice?
- Do buttons say what happens, and keep that name through the flow?
- Do empty, loading and error states tell the user what to do next?
- Any filler: fake numbers, placeholder testimonials, "Insights / Growth / Scale" labels, decorative icons?
- Can material claims be traced to product evidence? Are sample data, simulated demos and planned capabilities visibly distinguished from working behavior?

## Interaction and motion (when affected)

- Does the interaction explain the product or advance the task? Is the trigger, feedback and end state understandable?
- Is essential content visible without waiting for an animation, and is reduced motion an understandable equivalent?
- Are changing scenes stable in size, and are nonessential loops stopped when hidden? Are keyboard controls, pause/replay and focus usable where relevant?
- Were claimed states and performance actually exercised with the environment and method recorded, rather than inferred from a static screenshot?

## Korean text

- Any line ending in a split word the machine missed (punctuation, parentheses, numbers with units)?
- Do headings balance, with no one- or two-character last line?
- Is the Korean font actually loaded, or is a fallback rendering thinner, wider or mixed?

## Phone (375)

- Is the primary action reachable for the main task without hunting?
- Do fixed headers or footers stack into two bars or hide content behind them?
- Do tables scroll horizontally on purpose, or reflow into something readable?

## Finish

- Focus rings visible; hover and pressed states exist; disabled looks disabled but stays readable.
- Icons from one set, one stroke weight, optically aligned with their text.
- Shadows and radii from the scale, no near-duplicates.
- Before shipping, remove one accessory.
