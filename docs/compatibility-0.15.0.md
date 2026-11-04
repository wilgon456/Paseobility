# Paseo 0.15.0 compatibility check

Checked on 2026-11-04 for Paseobility v2.12.12, on Windows 11 with the
installed Paseo desktop daemon 0.15.0. The daemon was not restarted or
upgraded. This record covers the two plugins (`plugin/` and
`tools/paseo-bot/plugin/`). It is not a runtime certification of the twelve
skills, which install by copying files and do not depend on the plugin range.

## What was wrong

Both manifests capped `requirements.paseo` below 0.14 (`>=0.12.0 <0.14.0` and
`>=0.13.0 <0.14.0`). Paseo enforces the range on load, so a 0.15.0 daemon
reported the installed Paseobility plugin as `failed`:

```text
Plugin "paseobility" requires Paseo >=0.12.0 <0.14.0. Your daemon is 0.15.0.
```

## Release facts used

- `getpaseo/paseo` release notes for `v0.14.0` and `v0.15.0` were read. Plugin
  items are additive: agent tools and session-open MCP servers (0.14),
  `worktree.create.before`, smaller cached client bundles and preserved screens
  across reconnects (0.15). No removal or rename touches the APIs these plugins
  use.
- The published `@getpaseo/plugin` 0.13.0 and 0.15.0 packages were compared
  file by file. Every client and shared declaration is identical. On the server
  side 0.15.0 adds `defineAgentTool`, worktree hook types and a regrouped
  lifecycle type surface; both plugins use only `server.handle` there.

## Checks

| Check | Result |
| --- | --- |
| `plugin/`: `npm run typecheck` with `@getpaseo/plugin` 0.15.0 and with 0.14.0 | pass, pass |
| `plugin/`: `npm test` | 26 pass, 1 skip (POSIX-only link test) |
| `tools/paseo-bot/plugin/`: typecheck with 0.15.0 and with 0.14.0 | pass, pass |
| `tools/paseo-bot/plugin/`: `npm test` | 26 pass |
| `plugin/` installed from the working tree as `paseobility-check` on the 0.15.0 daemon | `running`, logs `Plugin ready`, no daemon errors; removed afterwards |

The manifests now read `>=0.12.0 <0.16.0` and `>=0.13.0 <0.16.0`. The upper
bound stays at the newest release that was checked, as before; raise it after
the same check on the next Paseo minor release. The plugin test that pins the
range was updated with it.

## Not verified

- The plugin screens were not opened in the 0.15 desktop or mobile app; the
  client API is unchanged, but rendering was not observed in this pass.
- No live 0.14 daemon was run; 0.14 is covered by the SDK typecheck and release
  notes only.
- The Paseo bot plugin was typechecked and tested but not loaded, because it
  needs a configured bot runtime.
- macOS and Linux were not exercised for this release.
