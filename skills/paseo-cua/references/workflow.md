# Cua Driver workflow

Load for actual GUI work. The installed binary is authoritative: read
`cua-driver list-tools` and `cua-driver describe <tool>` for exact names and
arguments instead of assuming a schema, which changes between releases.

## Snapshot invariant

Every action starts from a fresh state read and is verified afterward. Do not
act on a cached tree, index, or coordinate after the UI changes.

## Choose the target

- Prefer the window-local accessibility tree: `get_window_state(pid, window_id)`
  returns the tree plus a screenshot by default. Use the opaque `element_token`.
- Use pixel coordinates only when the tree cannot reach the target, taking the
  pixel from the same snapshot response.
- Select the exact window from `list_windows` (or the `launch_app` response) by
  `window_id`, and confirm field semantics with `cua-driver describe list_windows`
  rather than assuming a stacking convention.

## Escalation ladder

Work from the narrowest route outward, and continue only when evidence says the
previous route did not land:

0. A headless/background non-GUI outcome (API, CLI, filesystem) — read it back.
1. A typed Cua operation (`set_window_frame`, `invoke_menu`, typed browser
   tools, clipboard), verified with a structural read.
2. Background accessibility action.
3. Background pixel action off the current snapshot.
4. `delivery_mode: "foreground"` — a reaction to a verified no-op, allowed only
   within the user's authorization, never a prediction.

## Persistent state

One-shot calls use `cua-driver <tool> '<json>'`. Cursor overlays, recording,
browser sessions, and named sessions need one persistent `cua-driver mcp`
connection; a repeated session label does not adopt another process's state.

## Verify and report

Confirm the postcondition with `verify_state`; treat `unknown` as not success.
Report what was operated, the evidence, and any refusal. Never log secrets.

## Source

Pinned upstream: [`trycua/cua`](https://github.com/trycua/cua) @
[`9bbfa7dd3e27ca7f1861ede70aaca390174493f9`](https://github.com/trycua/cua/tree/9bbfa7dd3e27ca7f1861ede70aaca390174493f9).
Reviewed contract:
[`Skills/cua-driver/SKILL.md`](https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/rust/Skills/cua-driver/SKILL.md)
(0.28.2), with [BROWSER.md](https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/rust/Skills/cua-driver/BROWSER.md)
for page content. MIT licensed.
