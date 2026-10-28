# Cua Driver workflow

The installed binary is authoritative: read `cua-driver list-tools` and
`cua-driver describe <tool>` for exact names and arguments; the schema changes
between releases.

## Snapshots

Act from the latest snapshot. Several actions may share one snapshot while the
UI stays put; after anything that rerenders (new window, dialog, navigation),
snapshot again — old tokens, indexes, and coordinates are stale.

- Read narrowly: `query` (matching rows plus ancestors), `max_elements`,
  `max_depth`. A read walks a bounded number of nodes and reports `truncated`.
- The default tree is compact Markdown. Row `[N]` becomes `element_token`
  `<snapshot_id>:N`; `tree_format:"elements"` returns the structured array.
- Re-read with `since:"latest"` (or an earlier `snapshot_id`) for only the
  changed rows; the reply carries a new `snapshot_id` for later tokens.

## Choose the target

- Prefer the window-local accessibility tree: `get_window_state(pid, window_id)`
  returns the tree plus a screenshot by default. Use the `element_token`.
- Use pixel coordinates when the tree cannot reach the target, taking them from
  the same snapshot.
- Pick the window from `list_windows` (or the `launch_app` response) by
  `window_id`; check `cua-driver describe list_windows` for field meanings.

For mixed Ego/native work, follow [ego-companion.md](ego-companion.md).
Do not interpret the routes below as permission to attach a second page
controller or bypass Ego user-control stops.

## Routes, cheapest first

Move on when a route does not land; mention which one worked.

0. A non-GUI outcome (API, CLI, `osascript`, filesystem) — read it back.
1. A typed Cua operation (`set_window_frame`, `invoke_menu`, typed browser
   tools, clipboard).
2. Background accessibility action.
3. Background pixel action off the current snapshot.
4. Keyboard shortcuts or `delivery_mode: "foreground"` — takes the user's
   focus, so say so.

## Batch actions

When the installed schema advertises them, `run_steps` runs a list of
`{tool, args}` steps, stops at the first failure and, with `observe:{}`,
returns what changed; `run_script` runs one sandboxed script over the same
tools when the flow needs a loop, branch, or retry. Both still need a
verification checkpoint.

## Persistent state

One-shot calls use `cua-driver <tool> '<json>'`. On Windows, use PowerShell 7 (`pwsh`). Windows PowerShell 5.1 strips the double quotes from a JSON argument (`'{"x":1}'` arrives as `{x:1}`) and pipes ASCII by default; there, set `$OutputEncoding = [Text.UTF8Encoding]::new($false)` and pipe the JSON instead: `'<json>' | cua-driver call <tool>`. Cursor overlays, recording,
browser sessions, and named sessions need one persistent `cua-driver mcp`
connection; a repeated session label does not adopt another process's state.

## Verify and report

Confirm the end result with `verify_state` or an independent read of the tree
or screenshot. Report what was operated and the evidence. Never log secrets.

## Source

Pinned upstream: [`trycua/cua`](https://github.com/trycua/cua) @
[`6d6c734c127025fb39ad5d585a10382808b39dc1`](https://github.com/trycua/cua/tree/6d6c734c127025fb39ad5d585a10382808b39dc1).
Reviewed contract:
[`Skills/cua-driver/SKILL.md`](https://github.com/trycua/cua/blob/6d6c734c127025fb39ad5d585a10382808b39dc1/libs/cua-driver/rust/Skills/cua-driver/SKILL.md)
(0.36.0: actions accept `element_token` = `<snapshot_id>:N`; `element_index`
and `snapshot_id` are not input arguments to actions; `run_steps` /
`run_script` added; `get_window_state` adds `since`, `tree_format`,
`full_output`, `verbose`). Use `capture_id` with pixel input when the
installed action schema advertises it. `get_window_state` with `display_only`
and `include_accessibility_tree:false` provides display pixels only; those
images do not register an action capture or replace the agent snapshot.
Reviewed [BROWSER.md](https://github.com/trycua/cua/blob/6d6c734c127025fb39ad5d585a10382808b39dc1/libs/cua-driver/rust/Skills/cua-driver/BROWSER.md)
for page content. MIT licensed. The last version exercised end-to-end remains
`0.28.2`; `0.36.0` here is an installed/schema-reviewed contract, not a new GUI end-to-end result.
