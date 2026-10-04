---
version: alpha
name: PROJECT_NAME
description: One sentence on the mood of the interface and the job it must make fast.
colors:
  primary: "#1F2328"
  secondary: "#57606A"
  tertiary: "#0B5CD5"
  neutral: "#FFFFFF"
  surface: "#F6F8FA"
  border: "#D0D7DE"
  on-tertiary: "#FFFFFF"
typography:
  h1:
    fontFamily: Pretendard
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.3
  h2:
    fontFamily: Pretendard
    fontSize: 1.25rem
    fontWeight: 700
    lineHeight: 1.4
  body-md:
    fontFamily: Pretendard
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.7
  body-sm:
    fontFamily: Pretendard
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 6px
  md: 8px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 44px
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-tertiary}"
  card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 16px
  table-head:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    padding: 8px
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
---

## Overview

Who uses this, how often, for how long, and what the screen must make fast. Two or three sentences; no adjective without a reason. Replace every value above with the project's own before writing UI; these are placeholders that pass the linter, not a recommendation.

## Colors

- Primary (#1F2328): text and headlines. Not a fill.
- Secondary (#57606A): supporting text and metadata; 6.4:1 on the neutral background, never below 4.5:1 wherever it sits.
- Tertiary (#0B5CD5): the only interaction color: primary buttons, links, selected states. One primary action per view. 5.9:1 under white text.
- Neutral, surface, border: page, panels, hairlines. No gradients.

## Typography

Pretendard first (a Korean family) for everything; weight and size carry hierarchy. Body 16px at 1.7, 30 to 45 Korean characters per line, `word-break: keep-all; overflow-wrap: break-word` on `body`, no letter-spacing on Korean body text, `text-wrap: balance` on headings.

## Layout

A 4-px scale: xs 4, sm 8, md 16, lg 24, xl 32, xxl 48. One container (max-width plus side padding) for every section. One `gap` per row or column instead of per-item margins. Controls on one row share one height (44px).

## Shapes

Two radii: `sm` on inputs and chips, `md` on buttons and cards. Nothing else.

## Components

- `button-primary`: one per view; the label says what happens.
- `card`: a grouping surface with a hairline border, no shadow, never nested inside another card.
- `table-head`: the only tinted row in a table; body rows stay on the page background.
- `divider`: a 1px hairline in the border color; the way to separate groups before reaching for a card.

## Do's and Don'ts

- Do reuse an existing component before adding one.
- Don't add colors, radii, shadows or font sizes outside this file; extend the file first.
- Don't use gradients, glass, glows, left accent rails, tracked uppercase labels, emoji as icons, or arrows in button text.
- Don't center multi-line paragraphs.
