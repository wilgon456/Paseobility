---
name: paseo-browser
description: >-
  Use Paseo's built-in browser tools to inspect and operate web pages, take
  screenshots, fill forms, click elements, scroll, type text, run JavaScript,
  and interact with web UIs. Use only when the user asks to browse, inspect, or
  operate a website. Do not use for plain HTTP API requests.
---

# Paseo Browser

Paseo 0.9.0-beta.2 exposes browser automation as the `browser_*` tool family. Use the
exact tool names present in the active environment; do not add the old
`paseo_browser_*` prefix.

## Requirements

- The agent must belong to a Paseo workspace. `browser_new_tab` and
  `browser_list_tabs` fail without workspace context.
- A Paseo desktop browser automation host must be connected. A missing host is
  an environment limitation, not a reason to invent a browser ID.
- Browser IDs must come from `browser_new_tab` or `browser_list_tabs`.
- New tabs open in the agent's workspace in the background; they do not switch
  the user's visible tab.
- Navigation accepts HTTP(S) URLs. A scheme-less host is normalized to HTTP by
  current Paseo.

## Quick reference

| Task | Tool chain |
| --- | --- |
| List tabs | `browser_list_tabs` |
| Open a URL | `browser_new_tab` |
| Read a page | `browser_new_tab` -> `browser_snapshot` |
| Click | `browser_snapshot` -> ref -> `browser_click` |
| Fill/type | `browser_snapshot` -> ref -> `browser_fill` or `browser_type` |
| Select | `browser_snapshot` -> ref -> `browser_select` |
| Keyboard | `browser_keypress` |
| Scroll | `browser_scroll` |
| Screenshot | `browser_screenshot` |
| Console/network evidence | `browser_logs` |
| Read-only JavaScript | `browser_evaluate` |
| Hover/drag | `browser_hover`, `browser_drag` |
| Upload workspace files | `browser_upload` |
| Wait for text or URL | `browser_wait` |
| Navigate/history | `browser_navigate`, `browser_back`, `browser_forward`, `browser_reload` |
| Viewport | `browser_resize` |
| Close tab | `browser_close_tab` |

## Core workflow

1. Call `browser_list_tabs` to reuse a relevant tab, or `browser_new_tab` to
   create one.
2. Call `browser_snapshot`. It returns an accessibility snapshot and ephemeral
   refs such as `@e12`.
3. Act with the latest ref and the exact `browserId`.
4. After navigation or state change, wait for text or URL when useful, then take
   a fresh snapshot. Old refs can return `browser_stale_ref`.
5. Verify semantic state with a snapshot and visual state with a screenshot.
6. Close tabs created only for the task when they are no longer needed.

## Navigation and reading

```text
browser_new_tab url="https://example.com"
browser_snapshot browserId="<returned-id>"
browser_navigate browserId="<id>" url="https://example.com/next"
browser_wait browserId="<id>" url="/next" timeoutMs=10000
```

`browser_wait` requires exactly one of `text` or `url`; its host timeout is at
most 30000 ms. Prefer snapshot text for understanding and screenshots for
layout, rendering, or visual proof.

## Forms and keyboard

- `browser_fill { ref, value, browserId }` replaces an input value.
- `browser_type { text, ref?, browserId }` emits typing behavior, useful for
  autocomplete and search-as-you-type. Omit `ref` only for the focused element.
- `browser_keypress { key, ref?, browserId }` handles Enter, Tab, Escape, arrows,
  and shortcuts.
- `browser_select { ref, value, browserId }` selects an option.
- `browser_upload { ref, filePaths, browserId }` accepts files from the
  workspace. Verify exact files before uploading.

Snapshot again after any action that can rerender the page.

## Screenshots, logs, and evaluate

`browser_screenshot` returns PNG output. Set `fullPage: true` only when content
below the fold matters. Use `browser_resize` for responsive checks.

When a screenshot fails with `screenshot_no_frame` or a capture timeout, or a
`fullPage` image shows repeated/duplicated edges, read
[references/screenshots.md](references/screenshots.md) before retrying.

`browser_logs` returns recent console and performance-network entries;
`maxEntries` defaults to 50 and is capped at 200. Logs are evidence, not proof
that a flow succeeded, so confirm page state too.

`browser_evaluate` accepts a JavaScript function and an optional ref. Keep it
read-only and narrow:

```text
browser_evaluate browserId="<id>" function="() => document.title"
browser_evaluate browserId="<id>" ref="@e5" function="el => el.textContent"
```

Never read cookies, localStorage, sessionStorage, auth tokens, API keys, hidden
credential fields, or unrelated page data. Do not remove disabled attributes,
bypass validation, or modify the DOM to evade site controls.

## Recipes

### Read a page

```text
browser_new_tab -> browser_snapshot -> optional browser_evaluate
```

### Submit an authorized form

```text
browser_snapshot -> fill/select/type -> fresh snapshot -> click submit
-> browser_wait -> fresh snapshot/screenshot
```

The user's explicit request to complete the form authorizes ordinary in-scope
typing and clicks. Pause before a payment, purchase, destructive submission,
account/security change, public post, production/admin mutation, or any other
consequential action whose authorization is not already clear.

### Test responsive layout

```text
browser_resize 375x812 -> browser_screenshot
browser_resize 1440x900 -> browser_screenshot
```

### Diagnose a failed UI flow

```text
fresh snapshot -> browser_logs -> narrow read-only evaluate -> screenshot
```

## Errors and recovery

- `browser_no_host`: ask the user to open/connect a compatible Paseo desktop
  browser host, then retry.
- `browser_disabled`: browser tools must be enabled on the host.
- `browser_tab_not_found` or `browser_tab_closed`: list tabs and use a current
  browser ID.
- `browser_stale_ref`: take a new snapshot and retry with the new ref.
- `browser_timeout`: verify host connection and page readiness, then retry once
  with a bounded wait.
- Screenshot failure (`screenshot_no_frame`, capture timeout) or duplicated
  `fullPage` output: read [references/screenshots.md](references/screenshots.md)
  and follow it instead of blindly retrying.
- `browser_unsupported`: report the active app/runtime limitation.

## Safety

- Stay within the sites, accounts, files, and actions the user put in scope.
- Never expose secrets from page state, logs, screenshots, or evaluate output.
- Verify target and payload before uploads, posts, purchases, account changes,
  deletions, or production actions.
- Do not silently accept an unexpected JavaScript dialog; report consequential
  dialogs and verify the resulting page state.
- Read-only exploration does not require an extra confirmation. Do not add
  needless confirmation prompts for reversible steps already authorized by the
  user's browser task.

## When not to use

- Plain HTTP/API requests: use an HTTP or web-fetch tool.
- Local files or terminal work: use filesystem or shell tools.
- A task depending on an existing Chrome session rather than Paseo's workspace
  browser: use the environment's Chrome-control capability when available.
