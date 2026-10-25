# From product evidence to a reviewed screen

Use for a new screen, substantial recomposition or public page. For a small
correction, apply only what changes the decision. Reuse the project's brief,
design rules and run record; these notes do not create another token system.

## Establish what the screen can say

Inspect the product behavior, relevant code and documentation, and evidence the
user supplied before writing benefit claims or designing a demonstration. Keep
each material claim beside its source path or observed behavior in the existing
brief. A short note is enough; a separate facts document is optional.

Distinguish implemented behavior, a planned capability, a simulated example and
an assumption. A local mock must not look like a connected service or a real
customer result. UI copy must keep those distinctions visible. Unsupported
metrics, testimonials, integrations, prices and availability are not filler:
omit them or mark proposed copy as a draft for the missing fact. Do not turn a
developer assertion into an independently verified product claim.

For example, code that exports a CSV supports "Export CSV". It does not support
"Save three hours a week". A sample export preview should identify sample data;
it must not report that a user's file was exported when no export occurred.

## Make the brief decide the composition

Settle who is using the screen, what they need to do, the primary surface and
action, and what they should notice first, second and third. Link the relevant
asset, component and token sources. State the visual direction and how density,
type and proportions express it; the design digest supplies the composition
vocabulary. Identify a signature element only when it serves the brief.

For each affected section or state, connect its purpose to real content and the
next action. Include phone behavior and meaningful empty, loading, success or
error states only where the task needs them. A small screen can fit in a few
lines. `../templates/BRIEF.md` is a starting point for work that benefits from a
durable document, not a list of mandatory deliverables.

Research references to answer unresolved decisions: for example, how a dense
comparison stays readable on a phone, or how an interaction explains a product
capability. Use supplied references first. Inspect screenshots before describing
their appearance; label observations from code or text as such. Record the
specific principle to borrow and what would not suit this product. Stop when
the decision is supported. There is no site quota, automatic research team or
requirement to imitate a reference's branding. If access is unavailable, state
the gap and work from available evidence without claiming a visual inspection.

## Translate the direction into a first screen

Make visual decisions concrete enough to build and critique. "Premium" or
"modern" is not a layout instruction. For example, an editorial product page
might use a broad image beside a short headline, narrow supporting copy and a
quiet purchase area. An operations queue might use compact aligned rows, a
persistent filter bar and a detail pane, with color reserved for exceptions.
These are examples of reasoning, not templates to reuse for every task.

- From each useful reference, extract the relevant relationships: how much
  space goes to content versus navigation, which type role dominates, how
  groups are separated, how imagery is cropped, and what changes on a phone.
  Record the decision it supports. A screenshot's subject, branding and exact
  geometry need not transfer to a product with different content.
- Choose a layout from the actual content. Comparable records often need rows
  or a table; visual browsing may need a grid; sequential work needs ordered
  steps. A card should represent a meaningful group or independently actionable
  object, not surround every heading and paragraph.
- Establish a dominant region and quieter supporting regions through size,
  placement and space before adding color or borders. Give each type role a
  job; avoid making every heading, value and button equally prominent. Use
  smaller gaps within a group than between groups, and align recurring edges.
- Use real headings, realistic record lengths and representative data density
  in the first render. Check long Korean labels, missing content and large
  values where relevant. A short English placeholder is not a layout test for
  the final Korean content.
- When imagery carries the concept, choose the asset and crop early. Prefer
  supplied or existing assets; obtain or generate suitable assets with available
  tools when needed and authorized. Do not substitute unrelated stock imagery,
  emoji or a CSS ornament for missing product evidence. If an essential asset
  is missing, report that limitation rather than judging a placeholder as final.
- Decide what moves, stacks, stays aligned or becomes scrollable on a phone.
  Preserve the task and reading order; shrinking the desktop composition is
  not a responsive strategy. Keep secondary content accessible.

Build one representative screen or coherent section in the project's stack
before spreading the direction. Inspect both its whole-page silhouette and its
actual-size text and controls at desktop and phone widths. Compare with the
brief and any supplied visual target. Correct proportions, density and content
placement before extending the system; tablet and other affected states remain
part of final verification. No mandatory extra concepts or approval stop when
the user has already selected a direction.

## Give interaction and motion a job

Add a signature interaction only when it helps the user's task or explains the
product. A mascot, game or animated showcase is not a default requirement.
Describe its trigger, state change, visible feedback and end state before
choosing animation technology. Keep demos truthful about simulated behavior.

- Prefer transform and opacity for movement; measure an alternative when its
  effect is needed. Reserve space for changing content to avoid layout jumps.
- Keep essential content available if an animation does not start. Do not leave
  a large blank placeholder waiting for a reveal. Provide an understandable
  static state or direct transition for reduced motion, retaining the action
  and feedback. No-JavaScript support follows the project's requirements.
- Pause nonessential loops when offscreen or the document is hidden. Long or
  repeated demonstrations should offer pause/replay when useful; preserve
  keyboard access and a visible focus state.
- Choose performance checks for the affected interaction and any stated target.
  Report browser/device, headless or visible mode, viewport, throttling, metric
  and sampling method. An uncapped headless `requestAnimationFrame` rate is
  scheduling evidence, not proof of displayed FPS on a user's device. Neither
  120 FPS nor a Lighthouse score is a universal acceptance criterion.

## Review the rendered result and carry corrections forward

Review the first useful rendered screen before spreading its composition.
Compare actual content, hierarchy, density, primary action and direction with the
brief. Use `review-checklist.md` to inspect the images. Measured errors and
creative judgment have separate evidence: a clean report cannot decide whether
the composition is appropriate, convincing or memorable.

Start with the largest visible mismatch. Use the following as diagnosis aids,
not a checklist that every screen must fail:

| Observed symptom | Investigate and correct first |
| --- | --- |
| Everything competes for attention | Rank the content; reduce secondary type/emphasis and give the primary region more space before adding accents. |
| The page feels like repeated generic cards | Reconsider the content model: rows, shared groups, editorial flow or a comparison structure; remove redundant containers. |
| The page feels empty despite useful content | Rebalance content width, density and section spacing; do not fill the gap with invented stats or oversized headings. |
| The style misses the chosen reference | Compare proportions, type hierarchy, image treatment and rhythm at comparable widths; a palette swap alone rarely resolves it. |
| The page feels busy or over-explained | Remove duplicated copy and competing decorations; strengthen grouping while retaining labels and necessary guidance. |
| Desktop works but phone loses the task | Reorder the composition, adapt controls and preserve comparison/context rather than only reducing font sizes. |
| The screen looks polished but does not fit the product | Revisit the surface, real content and task flow before refining shadows or animation. |

Prioritize task/composition, then hierarchy/type/assets, then fine spacing and
effects. In each revision, name the visible problem and expected improvement;
compare before and after and retain only changes that help. Do not manufacture
issues to satisfy a round count. A restrained settings page can be finished
without an illustration, a hero or a unique visual motif.

For meaningful issues, append a concise row to the existing brief or run record:

| Issue and screen/state | Intended correction | Recheck evidence | Status |
| --- | --- | --- | --- |
| Example: phone export preview competes with the primary action | Reduce preview emphasis and bring the action into reading order | New phone screenshot plus keyboard check; paths/results recorded after execution | Open until rechecked |

Describe a concrete defect and intended effect, not "make it premium". Preserve
chosen and rejected directions so another pass does not restore a rejected
layout. If the user changes direction, update the brief before continuing.

Fix related issues together, then render the affected screens, widths and states
again. Keep the required phone/tablet/desktop coverage. Check other affected
themes, locales, interactions and reduced motion using the project's checks or
the browser workflow; a default screenshot does not exercise these states.
Do not rerun unchanged checks without a reason. If iterations stop improving the
same issue, reconsider the composition or identify the missing input rather
than applying endless cosmetic variations. Do not weaken criteria or hide real
failures with exclusions. Explain any genuine false-positive exclusion.

Conclude with current artifacts, measured findings, visual issues fixed/open
and unverified states. If images could not be opened, say visual review remains
unverified. Do not call the design complete while a required check or material
visual issue remains unresolved. This procedure does not itself ship the result.
