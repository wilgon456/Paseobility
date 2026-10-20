# Cua Driver workflow

The installed binary is authoritative: read `cua-driver list-tools` and
`cua-driver describe <tool>` for exact names and arguments; the schema changes
between releases.

## Snapshots

Act from the latest snapshot. Several actions may share one snapshot while the
UI stays put; after anything that rerenders (new window, dialog, navigation),
snapshot again — old tokens, indexes, and coordinates are stale.

## Choose the target

- Prefer the window-local accessibility tree: `get_window_state(pid, window_id)`
  returns the tree plus a screenshot by default. Use the opaque `element_token`.
- Use pixel coordinates when the tree cannot reach the target, taking them from
  the same snapshot.
- Pick the window from `list_windows` (or the `launch_app` response) by
  `window_id`; check `cua-driver describe list_windows` for field meanings.

## Routes, cheapest first

Move on when a route does not land; mention which one worked.

0. A non-GUI outcome (API, CLI, `osascript`, filesystem) — read it back.
1. A typed Cua operation (`set_window_frame`, `invoke_menu`, typed browser
   tools, clipboard).
2. Background accessibility action.
3. Background pixel action off the current snapshot.
4. Keyboard shortcuts or `delivery_mode: "foreground"` — takes the user's
   focus, so say so.

## Persistent state

One-shot calls use `cua-driver <tool> '<json>'`. Cursor overlays, recording,
browser sessions, and named sessions need one persistent `cua-driver mcp`
connection; a repeated session label does not adopt another process's state.

## Verify and report

Confirm the end result with `verify_state` or an independent read of the tree
or screenshot. Report what was operated and the evidence. Never log secrets.

## Source

Pinned upstream: [`trycua/cua`](https://github.com/trycua/cua) @
[`0c69d9a2c8abbb5051a2df4a23f0fa166d5385dc`](https://github.com/trycua/cua/tree/0c69d9a2c8abbb5051a2df4a23f0fa166d5385dc).
Reviewed contract:
[`Skills/cua-driver/SKILL.md`](https://github.com/trycua/cua/blob/0c69d9a2c8abbb5051a2df4a23f0fa166d5385dc/libs/cua-driver/rust/Skills/cua-driver/SKILL.md)
(0.34.1: actions accept `element_token`; `element_index` and `snapshot_id`
are no longer input arguments). Use `capture_id` with pixel input when the
installed action schema advertises it. `get_window_state` with `display_only`
and `include_accessibility_tree:false` provides display pixels only; those
images do not register an action capture or replace the agent snapshot.
Reviewed [BROWSER.md](https://github.com/trycua/cua/blob/0c69d9a2c8abbb5051a2df4a23f0fa166d5385dc/libs/cua-driver/rust/Skills/cua-driver/BROWSER.md)
for page content. MIT licensed. The last version exercised end-to-end remains
`0.28.2`; `0.34.1` here is an installed/schema-reviewed contract, not a new GUI end-to-end result.
