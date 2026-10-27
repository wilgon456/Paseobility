# Paseo 0.13.0 compatibility check

Checked on 2026-10-24, macOS arm64, for Paseobility v2.12.1. Unlike the
[0.12.0 record](./compatibility-0.12.0.md), this pass ran real daemons: the
published `@getpaseo/cli@0.13.0` and `@getpaseo/cli@0.12.0` packages, each
started from a throwaway `--home` on its own loopback port. The user's desktop
app and daemon (0.12.0) were not upgraded, restarted or reconfigured.

## Release facts used

- `getpaseo/paseo` `v0.13.0`, published 2026-10-24 (after `v0.13.0-beta.1`
  and `beta.2`). Release notes and a source comparison of tags `v0.12.0` and
  `v0.13.0` were read.
- Plugins: `requirements.paseo` is enforced by `assertPluginCompatibility`
  on both daemon and app; a host outside the range marks the plugin failed.
  New client APIs: `addAgentPanel`, `addFilePanel`, `useTabState`, runtime
  translations (`defineTranslations`, `client.i18n`), `Markdown` in
  `@getpaseo/plugin/client/ui`, inline SVG/component icons. There is still no
  public draft-editing API. The composer `message-input-root` layout
  (`packages/app/src/composer/input/input.tsx`) did not change between the tags.
- Connected hosts: `paseo host add|ls|inspect|update|enable|disable|rm`, MCP
  `list_hosts`, and `serverId` on `create_workspace`, `list_workspaces`,
  `create_agent`, `send_agent_prompt`, `get_agent_status`,
  `get_agent_activity` and `list_agents`.
- A child's report and its finish notification now reach the parent as one
  message. Turn-ended plugin hooks send an empty `timeline`.
- MCP tool names: the `registerTool` names extracted from both source trees
  differ only by the new `list_hosts`.
- CLI surface: recorded from both CLIs with `scripts/paseo-cli-surface.py`.
  0.13.0 is a strict superset of 0.12.0 (only the `host` group is new, no
  command or flag was removed). `docs/paseo-cli-surface.json` now holds the
  0.13.0 surface.
- Internal client modules used by the cleanup and multi adapters:
  `dist/utils/client.js` still exports `connectToDaemon({target, timeout})`
  and `dist/utils/daemon-target.js` still exports `selectDaemonTarget`.
  `DaemonClient.supportsBackgroundWorkspaces()` still exists.

## Live results

| Check | 0.12.0 daemon | 0.13.0 daemon |
| --- | --- | --- |
| v2.12.0 plugin (`<0.13.0`) install | (running locally) | **rejected**: `requires Paseo >=0.12.0 <0.13.0. Your daemon is 0.13.0` |
| v2.12.1 plugin (`>=0.12.0 <0.14.0`) install, build, status | `running` | `running`, logs `Plugin ready` |
| Cleanup snapshot (`agent-cleanup.js --dry-run --json`) | n/a in this pass | `completeSnapshots: true`, `backgroundCovered: true`, 1 workspace seen |
| Cleanup workspace archive (`--workspace ID --archive --yes`) | n/a | `success`, record removed, pre-archive recheck 1 |
| Multi `status`, `agents`, `cli -- workspace ls --json` | n/a | identity matched, version `0.13.0` |
| Multi `exec` (bash) with `--workspace`, then `close` | n/a | exit 0, output captured, terminal closed |
| Multi `restart` (no agents) and reconnect | n/a | `restart_requested`, new worker PID, version `0.13.0` |

The 0.12.0 rows for skills were already covered by a live read-only cleanup
dry-run against the user's 0.12.0 daemon on 2026-10-24.

### Plugin client bundle

The client entry was compiled with each daemon's own plugin compiler and
evaluated with a recording fake client context, once with the 0.13 client
runtime and once without the 0.13-only exports (as a 0.12 app provides them):

- Both register the screen, sidebar item, `+` menu attachment source, the new
  Command Center item and composer pills.
- 0.12: labels are the Korean strings. 0.13: labels are translation messages
  that resolve to `Open Paseobility` (en, and ja by fallback) and
  `Paseobility 열기` (ko) through `PluginTranslationRuntime`.
- A throwing `addComposerPill` is logged and isolated; the other contributions
  stay registered.

## Changes made for 0.13

| Area | Change |
| --- | --- |
| Plugin manifest | `requirements.paseo` `>=0.12.0 <0.14.0` |
| Plugin SDK | dev dependency `@getpaseo/plugin` `0.11.4` -> `0.13.0`; strict typecheck passes |
| Plugin client | Feature-detected translations; Command Center entry; composer pill failures no longer break the plugin; the picker explains the `+` menu when the private editor adapter cannot bind |
| Plugin server | The CLI path falls back to `paseo` on PATH when the macOS app bundle CLI is absent |
| `paseo-multi` | Native connected hosts section; adapter kept for exec, capture, restart, update and registry-only hosts; explicit error when the client interface changes |
| `paseo-orchestration` | One combined report/finish message on 0.13+; remote children via `serverId` |
| `paseo-agent-cleanup` | Explicit `Installed Paseo client interface changed: missing <name>` error; 0.13 archive fixes noted |
| CI | `tests/test_cli_references.py` checks every documented or scripted `paseo` command, subcommand and flag against the recorded surface |

## Not verified

- The real desktop or mobile app on 0.13.0, including the private composer
  adapter and the native `+` menu picker. The app layout is unchanged in
  source only.
- Native connected hosts end to end (no second machine was added).
- `paseo-multi` from a Windows controller, and Linux.
- Browser tools, schedules and heartbeats on 0.13.
- The updater replacing a real installed release (v2.12.1 is not published).

Offline regression audit (2026-10-27): multi preserves its bot-facing API and
accepts Windows UTF-8 BOM registries/exports; explicit terminal close rejects
failed listing and refused closure. Cleanup recognizes Windows path separators.
Share handles Unicode Git paths and rejects metadata filename collisions. Scanner
regressions cover path/name exemption bypasses, quoted-secret redaction and
partial installer failures. These checks add no new live Windows or daemon
compatibility evidence.
