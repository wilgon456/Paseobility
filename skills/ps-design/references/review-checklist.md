# Review checklist: what to look at in the screenshots

`design-check` measures geometry and style discipline. These are the judgments it cannot make. Look for them on the `-sheet.png` and the `-marked.png` of every width; report what you found and fixed, not a line-by-line answer sheet.

Compare with the current brief and real product content. Keep actionable issues,
corrections and recheck evidence in the existing brief/run record as described
in `creative-workflow.md`; do not create another checklist document. Review the
first rendered screen before propagating its composition. After edits, inspect
fresh images of the affected screen/state; a zero-error report alone does not
establish visual quality.

## Direction and fit

- Does the visual direction fit the audience, task and existing product, with visible choices in density, type and proportions?
- Against the chosen reference or brief, what specifically falls short: column balance, type hierarchy, imagery, spacing rhythm or emphasis? Point to a location rather than assigning a taste score.
- Is expressive treatment purposeful where used, and does a quiet working screen remain clear without forced decoration?

## Hierarchy (the first three seconds)

- Can you tell what the screen is for and what to do first without reading everything?
- Is the next action clear for the current task/state, with secondary and destructive actions appropriately distinguished?
- Does the reading order follow the task order?

## Composition

- Does the layout match the surface you named? A Monitor with a hero, or a Configure screen with marketing cards, is a composition error: relayout, do not restyle.
- Do the dominant content and supporting regions have deliberate proportions, or does every block shout equally?
- Are related things close and unrelated things apart, grouped by space before boxes?
- Same job, same component, same place, across screens?
- Does the whole-page rhythm vary with the content while recurring edges and type roles stay consistent? Are there oversized blank regions or repetitive containers with no purpose?

## Type and assets

- Do headings, body, values and metadata have distinct, consistent roles at actual viewing size? Is supporting text still readable?
- Does imagery demonstrate or express something relevant, with a useful crop at each width? Have placeholders or unrelated assets been mistaken for a finished visual direction?

## Content

- Does every label use the user's words, sentence case, active voice?
- Do buttons say what happens, and keep that name through the flow?
- Does each subtitle or helper sentence add information needed to act? Remove repeated headings and obvious instructions; check that grouping and hierarchy remain clear at every width while preserving input labels, accessible names and necessary guidance.
- Apply the subtraction examples in `design-digest.md`: any repeated status phrases, decorative micro-labels, redundant card wrappers or automatic emphasis/effects? Remove what adds no meaning, then check the updated screen; keep units, time ranges, orientation and recovery cues.
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
- Does the phone composition preserve reading order and useful context, with secondary material still accessible?
- Do fixed headers or footers stack into two bars or hide content behind them?
- Do tables scroll horizontally on purpose, or reflow into something readable?

## Finish

- Focus rings visible; hover and pressed states exist; disabled looks disabled but stays readable.
- Icons from one set, one stroke weight, optically aligned with their text.
- Shadows and radii from the scale, no near-duplicates.
- Remove accessories that add no meaning; retain cues that support understanding or action.
