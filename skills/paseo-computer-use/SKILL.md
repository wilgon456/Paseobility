---
name: paseo-computer-use
description: >-
  Use Paseo's built-in browser tools to inspect and operate web pages, take
  screenshots, fill forms, click elements, scroll, type text, run JavaScript,
  and interact with any web UI. Use ONLY when the user asks to browse a website,
  take a screenshot of a page, fill a web form, click something on a page, read
  a web page, test a web UI, or interact with any web-based interface. Triggers
  include "browse", "screenshot", "open url", "click on", "fill form", "read
  webpage", "web ui", "browser", and "computer use". Do NOT use for HTTP API
  calls — use webfetch for those.
---

# Paseo Computer Use

Paseo ships a complete browser automation surface — open tabs, navigate pages,
take accessibility snapshots, click elements, fill forms, type text, scroll,
run JavaScript, capture screenshots, and wait for conditions. Every tool is
already available; this skill teaches when and how to combine them into
reliable, real-world workflows.

Tools are documented here with their `paseo_browser_*` names as exposed in the
current Paseo MCP context. The canonical MCP schema uses `browser_*` — both
refer to the same tool surface. Use the names your environment provides;
parameter shapes are identical.

## Quick reference

| Task | Tool chain |
|------|-----------|
| Open a URL | `paseo_browser_new_tab` |
| Read a page | `paseo_browser_new_tab` → `paseo_browser_snapshot` |
| Click a button | `paseo_browser_snapshot` → find ref → `paseo_browser_click` |
| Fill a text field | `paseo_browser_snapshot` → find ref → `paseo_browser_fill` |
| Select a dropdown option | `paseo_browser_snapshot` → find ref → `paseo_browser_select` |
| Type into an element | `paseo_browser_type` with ref from snapshot |
| Press a keyboard key | `paseo_browser_keypress` |
| Scroll the page | `paseo_browser_scroll` |
| Take a screenshot | `paseo_browser_screenshot` (fullPage: true for full page) |
| Get console/network logs | `paseo_browser_logs` |
| Run arbitrary JavaScript | `paseo_browser_evaluate` |
| Hover over an element | `paseo_browser_hover` |
| Drag one element onto another | `paseo_browser_drag` |
| Upload workspace files | `paseo_browser_upload` |
| Wait for text or URL | `paseo_browser_wait` |
| Go back / forward | `paseo_browser_back` / `paseo_browser_forward` |
| Reload the page | `paseo_browser_reload` |
| Resize the viewport | `paseo_browser_resize` |
| List open tabs | `paseo_browser_list_tabs` |
| Close a tab | `paseo_browser_close_tab` |

## Core workflow

Every browser interaction follows the same pattern:

1. **Open a tab** with `paseo_browser_new_tab`, or use an existing `browserId`
   from `paseo_browser_list_tabs`.
2. **Read the page** with `paseo_browser_snapshot`. This returns a
   model-readable accessibility tree with `@eNNN` refs for every interactive
   element. Always snapshot before acting — refs expire when the page changes.
3. **Act** with the tool that matches the intent: `paseo_browser_click`,
   `paseo_browser_fill`, `paseo_browser_select`, `paseo_browser_scroll`, etc.
   Most action tools require the `browserId` from step 1 and a `ref` from the
   latest snapshot. Exceptions: `paseo_browser_type` and `paseo_browser_keypress`
   can omit `ref` to target the currently focused element. Tab-level tools
   (`navigate`, `back`, `forward`, `reload`, `resize`, `logs`) use only
   `browserId`, no ref.
4. **Verify** with another `paseo_browser_snapshot` or
   `paseo_browser_screenshot`. Check that the page state matches expectations.

## Navigation and multiple tabs

Open a new tab for each independent site or workflow:

```
paseo_browser_new_tab url="https://example.com"
```

To navigate an existing tab to a new URL use `paseo_browser_navigate`. To go
back or forward within a tab's history use `paseo_browser_back` /
`paseo_browser_forward`.

List all open tabs with `paseo_browser_list_tabs`. Close tabs you no longer
need with `paseo_browser_close_tab` to keep the workspace clean.

The returned `browserId` is a stable identifier you use across all tab-scoped
tools. Store it and reuse it for every action on that tab.

## Reading pages — the snapshot model

`paseo_browser_snapshot` returns a structured representation of visible
elements. Each interactive element gets a `@eNNN` ref. Use these refs to
target actions:

```
paseo_browser_snapshot browserId="abc..."
  → refs: @e1 (heading), @e2 (search input), @e3 (submit button)
paseo_browser_fill ref="@e2" value="search term" browserId="abc..."
paseo_browser_click ref="@e3" browserId="abc..."
```

Refs are ephemeral — they change after any page interaction or navigation.
Always take a fresh snapshot before acting.

## Form filling

Fill text inputs with `paseo_browser_fill`, select dropdown options with
`paseo_browser_select`, and upload files with `paseo_browser_upload` (file
paths must be within the workspace).

For text that requires individual keystrokes (search-as-you-type, autocomplete
triggers), use `paseo_browser_type` instead of fill.

For keyboard shortcuts or navigation keys (Enter, Tab, Escape, arrow keys),
use `paseo_browser_keypress`. Pass `ref` to dispatch to a specific element;
omit it to dispatch to the focused element.

## Scrolling

`paseo_browser_scroll` accepts deltaX and deltaY in CSS pixels. Positive
deltaY scrolls down. An optional `ref` centers the scroll over a specific
element.

```
paseo_browser_scroll deltaX=0 deltaY=500 browserId="abc..."
```

## Screenshots

`paseo_browser_screenshot` returns a PNG image. Set `fullPage: true` to
capture the entire page, or omit for viewport-only.

```
paseo_browser_screenshot browserId="abc..." fullPage=true
```

## Waiting for conditions

Use `paseo_browser_wait` to pause until the page contains specific text or
reaches a URL fragment. Default timeout is 5 seconds; raise it with
`timeoutMs` up to 30000.

```
paseo_browser_wait text="Dashboard" browserId="abc..."
paseo_browser_wait url="/dashboard" timeoutMs=10000 browserId="abc..."
```

## Running JavaScript

`paseo_browser_evaluate` runs a JavaScript function in the page context. When
`ref` is provided, the resolved element is passed as the first argument.

```
paseo_browser_evaluate function="el => el.textContent" ref="@e5" browserId="abc..."
paseo_browser_evaluate function="() => document.title" browserId="abc..."
```

## Resizing the viewport

`paseo_browser_resize` changes the viewport to test responsive layouts or fit
a specific screen size:

```
paseo_browser_resize width=375 height=812 browserId="abc..."
```

## Debugging — console logs and network

`paseo_browser_logs` returns recent console messages and network entries. Pass
`maxEntries` to control how many (default 50, up to 200):

```
paseo_browser_logs browserId="abc..." maxEntries=50
```

## Real-world recipes

### Read and extract content from a page

```
1. paseo_browser_new_tab url="https://docs.example.com"
2. paseo_browser_snapshot (read the structure)
3. paseo_browser_evaluate function="() => document.querySelector('article').innerText"
```

### Log into a site

```
1. paseo_browser_new_tab url="https://app.example.com/login"
2. paseo_browser_snapshot → find @e2 (email), @e4 (password), @e6 (submit)
3. paseo_browser_fill ref="@e2" value="user@example.com"
4. paseo_browser_fill ref="@e4" value="..."
5. paseo_browser_click ref="@e6"
6. paseo_browser_wait text="Welcome"
```

### Search and scrape results

```
1. paseo_browser_new_tab url="https://search.example.com"
2. paseo_browser_snapshot → find search input, e.g. @e3
3. paseo_browser_fill ref="@e3" value="query"
4. paseo_browser_keypress key="Enter"
5. paseo_browser_wait text="results"
6. paseo_browser_snapshot → read results
7. paseo_browser_screenshot fullPage=false (optional visual check)
```

### Test a responsive layout

```
1. paseo_browser_new_tab url="https://myapp.local"
2. paseo_browser_resize width=375 height=812 (mobile)
3. paseo_browser_screenshot
4. paseo_browser_resize width=1440 height=900 (desktop)
5. paseo_browser_screenshot
```

### Monitor a dashboard

```
1. paseo_browser_new_tab url="https://dash.example.com"
2. paseo_browser_wait text="Ready" timeoutMs=15000
3. Loop every N seconds:
   a. paseo_browser_snapshot → check key values
   b. paseo_browser_screenshot (for visual record)
   c. paseo_browser_reload (refresh the page)
```

### Fill and submit a multi-field form

```
1. paseo_browser_new_tab url="https://forms.example.com"
2. paseo_browser_snapshot → find @e2 (name), @e4 (email), @e5 (country), @e7 (zip), @e12 (agree), @e14 (submit)
3. paseo_browser_fill ref="@e2" value="..."
4. paseo_browser_fill ref="@e4" value="..."
5. paseo_browser_select ref="@e5" value="KR"
6. paseo_browser_type ref="@e7" text="12345"
7. paseo_browser_scroll deltaY=300 (scroll to checkbox)
8. paseo_browser_snapshot → confirm refs are still valid
9. paseo_browser_click ref="@e12"
10. paseo_browser_click ref="@e14"
11. paseo_browser_wait text="Thank you"
```

## Tips

- **Always snapshot before acting.** Refs from an old snapshot point to stale
  or no-longer-visible elements.
- **Wait after navigation.** Use `paseo_browser_wait` to confirm the page is
  ready before interacting.
- **Prefer snapshot over screenshot for reading.** Screenshots are images;
  snapshots are machine-readable text. Use snapshots for understanding,
  screenshots for visual verification.
- **Close tabs you no longer need.** Open tabs consume memory on the browser
  host.
- **Use evaluate for data extraction.** Running `document.querySelector(...)`
  is faster than parsing a snapshot for structured data.
- **Set fullPage: true on screenshots** when you need to capture content below
  the fold.

## Safety

Browser automation carries real risk — forms can be submitted, state can
change, and sensitive data can be exposed. Before any state-changing action,
get explicit user confirmation.

**Require user confirmation before:**
- Submitting forms, placing orders, or triggering payments
- Changing account settings or deleting data
- Uploading files to external sites
- Any action on production/admin dashboards
- Posting content (comments, PRs, issues)

**JavaScript evaluation guardrails (`paseo_browser_evaluate`):**
- Never read `document.cookie`, `localStorage`, or `sessionStorage`.
- Never extract auth tokens, API keys, or session data.
- Never modify the DOM in ways that bypass site controls (e.g. removing
  disabled attributes, overriding validation).
- Prefer read-only expressions: `document.title`, `el.textContent`,
  `el.getAttribute('href')`.
- When `ref` targets a specific element, interact only with that element's
  subtree.

**Additional guards:**
- Check `paseo_browser_list_tabs` first — if no browser host is connected,
  browser tools will fail.
- Read-only exploration (snapshot, screenshot, logs, evaluate) does not need
  confirmation. State-changing actions do.
- If a page prompts for credentials you do not have permission to use, stop
  and ask the user.

## When NOT to use browser tools

- **HTTP API calls** — use `webfetch` or `bash curl` instead.
- **Local file reading** — use `read` or `glob`.
- **Terminal operations** — use `bash`.
- **Paseo browser tools run inside Orca or Paseo desktop app browser hosts.**
  If no browser automation host is connected (check `paseo_browser_list_tabs`),
  browser tools will fail.
