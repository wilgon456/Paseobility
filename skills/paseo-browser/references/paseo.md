# Paseo `browser_*` backend (optional)

Backend label: **Paseo `browser_*`**. This is an optional compatibility backend,
not the default — the default `paseo-browser` backend is CloakBrowser
([cloakbrowser.md](cloakbrowser.md)). Load this only when the user explicitly
wants their live Paseo workspace browser/tabs or asks for this backend. Pick it
before a flow and do not silently switch to/from it.

## Requirements

- The agent must belong to a Paseo workspace. `browser_new_tab` and
  `browser_list_tabs` fail without workspace context.
- A Paseo desktop browser automation host must be connected. A missing host is
  an environment limitation; for a public/local in-scope task with no host, state
  the backend choice and use CloakBrowser or the Playwright CLI instead — never
  pretend a fresh session shares the user's Paseo login/tab state.
- Browser IDs must come from `browser_new_tab` or `browser_list_tabs`.
- New tabs open in the agent's workspace in the background; they do not switch
  the user's visible tab.
- Navigation accepts HTTP(S) URLs; a scheme-less host is normalized to HTTP.

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
   refs such as `@e12` — a separate namespace from Playwright's `e12`.
3. Act with the latest ref and the exact `browserId`.
4. After navigation or a state change, wait for text or URL when useful, then take
   a fresh snapshot. Work from the most recent snapshot and refresh it after
   navigation or a DOM change; old refs can return `browser_stale_ref`.
5. Verify semantic state with a snapshot and visual state with a screenshot.
6. Close tabs you created for the task when they are no longer needed
   (`browser_close_tab`). Do not close unrelated tabs.

## Forms and keyboard

- `browser_fill { ref, value, browserId }` replaces an input value.
- `browser_type { text, ref?, browserId }` emits typing behavior.
- `browser_keypress { key, ref?, browserId }` handles Enter, Tab, Escape, arrows.
- `browser_select { ref, value, browserId }` selects an option.
- `browser_upload { ref, filePaths, browserId }` accepts workspace files; verify
  exact files before uploading.

Snapshot again after any action that can rerender the page.

## Screenshots, logs, and evaluate

- `browser_screenshot` returns PNG output; set `fullPage: true` only when content
  below the fold matters. Use `browser_resize` for responsive checks.
- When a screenshot fails (`screenshot_no_frame`) or a `fullPage` image shows
  repeated edges, read [screenshots.md](screenshots.md) before retrying.
- `browser_logs` returns recent console and performance-network entries;
  `maxEntries` defaults to 50, capped at 200. Logs are evidence, not proof.
- `browser_evaluate` accepts a JS function and an optional ref. Keep it read-only
  and narrow; never read cookies, localStorage, tokens, keys, or hidden fields.

## Errors and recovery

- `browser_no_host`: state the backend choice, then either ask the user to
  connect a Paseo desktop browser host and retry, or (public/local, in-scope) use
  CloakBrowser/Playwright CLI as a fresh backend. No silent switch.
- `browser_disabled`: browser tools must be enabled on the host.
- `browser_tab_not_found` / `browser_tab_closed`: list tabs and use a current ID.
- `browser_stale_ref`: take a new snapshot and retry with the new ref.
- `browser_timeout`: verify host connection and page readiness, then retry once
  with a bounded wait.
- Screenshot failures: read [screenshots.md](screenshots.md).
- `browser_unsupported`: report the active app/runtime limitation.

## Safety

- Stay within the user's sites, accounts, files, and actions.
- Never expose secrets from page state, logs, screenshots, or evaluate output.
- Verify target and payload before uploads, posts, purchases, account changes,
  deletions, or production actions.
- Do not silently accept an unexpected JavaScript dialog; report consequential
  dialogs and verify the resulting page state.
- Read-only exploration does not require an extra confirmation; do not add
  needless prompts for reversible steps the current browser task authorizes.
