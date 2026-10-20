# Paseo 0.12.0 compatibility check

Checked on 2026-10-20, macOS arm64, against Paseobility v2.10.0. This is a
**static** compatibility record: no Paseo 0.12 daemon was run. The
[0.10.2 record](./compatibility-0.10.2.md) remains the package baseline.

## Runtime and contract evidence

- Installed app: `/Applications/Paseo.app` `0.11.4`; `~/.local/bin/paseo`
  symlinks to the bundle CLI. `paseo daemon status --json` reports
  `daemonVersion: 0.11.4`, `desktopManaged: true`. The app and daemon were
  **not upgraded or restarted** for this check.
- Latest official release: `getpaseo/paseo` `v0.12.0`, published
  `2026-10-19T07:07:47Z` (after `v0.12.0-beta.1`–`beta.3`, which followed
  `v0.11.4`).
- Release notes reviewed for `0.12.0`. They name three upgrade-relevant
  changes: `paseo run --background` deprecated in favor of `--no-wait`;
  `paseo permit allow`/`deny` exit non-zero when the daemon does not confirm
  within 15 seconds; agent-to-agent messages (CLI or MCP) steer a running turn
  instead of interrupting it. They also add background workspaces.
- Source diff: shallow clones of tags `v0.11.4` and `v0.12.0` were compared,
  read only (nothing installed or built). Files compared:
  `packages/server/src/server/agent/tools/paseo-tools.ts` (MCP tools),
  `packages/server/src/server/browser-tools/`, `packages/client/src/daemon-client.ts`,
  `packages/protocol/src/{messages,agent-types}.ts`, `packages/cli/src/`, the
  desktop packaging (`electron-builder.yml`, `src/daemon/`), and the bundled
  base `skills/paseo/SKILL.md`.
- Published CLI: `@getpaseo/cli@0.12.0` was installed with `--ignore-scripts`
  into a throwaway prefix and only run for `--version` and `--help`, with
  `PASEO_HOME`/`PASEO_HOST` pointed at unused temporary values. The package
  contains `dist/utils/client.js` (exports `connectToDaemon`) and
  `dist/utils/daemon-target.js` (exports `selectDaemonTarget`), the two modules
  the bundled adapters import.

## What stayed the same

- MCP tool names: the 62 tool names registered in `v0.11.4` and `v0.12.0`
  (42 Paseo tools including `speak`, 20 browser tools) are identical, including the whole `browser_*` family, `create_heartbeat`/
  `delete_heartbeat`, and the schedule group. `archive_agent`,
  `archive_workspace` and `list_agents` output schemas are unchanged.
- Agent status values and the attention fields (`status`, `requiresAttention`,
  `attentionReason`, `pendingPermissions`) are unchanged in the protocol, so the
  cleanup/multi guards (`idle`/`error`/`closed` inactive) still match.
- Client methods the adapters call (`getDaemonStatus`, `fetchAgents`,
  `fetchWorkspaces` with `page`/`entries`/`pageInfo`, `archiveAgent`,
  `archiveWorkspace`, `listTerminals`, `createTerminal`, `captureTerminal`,
  `killTerminal`, `restartServer`) have the same signatures.
  `cli/src/utils/client.ts` and `daemon-target.ts` are byte-identical between
  the tags. Desktop packaging still ships `app.asar/node_modules/@getpaseo/cli`
  and `app.asar.unpacked/dist/daemon/node-entrypoint-runner.js` (`node-script`).
- CLI commands used by the skills and doctor (`paseo --version`,
  `paseo daemon status --json`, `paseo workspace ls --json`, `paseo ls --json`,
  `paseo agent ls -a`, `paseo archive <id> --json`,
  `paseo workspace archive <id> --json`) still exist with the same flags.
  `agent ls -a` now also includes background agents and implies `--global`.
- `god-run.mjs`, `paseo-share`, `paseo-spyware-check`, `paseo-design` and
  `paseo-browser` (CloakBrowser default) do not depend on the daemon API.

## Findings

| Area | 0.12 change | Affected file | Action taken |
| --- | --- | --- | --- |
| MCP `create_agent` | `background` argument removed; strict schemas reject it (`Unrecognized key`). Always returns after creation | `skills/paseo-orchestration/SKILL.md` | Launch contract says not to pass `background` on 0.12+. No skill passed it |
| MCP `send_agent_prompt` | `background` removed (now ignored), so there is no blocking mode. Returns after dispatch with `disposition` | `skills/paseo-orchestration/references/coordination.md` (Pattern 6) | Replaced the `background: false` instruction with waiting for the finish notification (`get_agent_status` for top-level callers). Kept a 0.11.x note |
| Agent-to-agent messages | Agent callers default to `activeTurnBehavior: "steer"` (MCP) and `--behavior steer` (CLI) instead of interrupting | `coordination.md`, `paseo-orchestration/SKILL.md` | Documented steering and `activeTurnBehavior: "interrupt"` for replacing a turn. 0.11 ignores the extra key (passthrough schema) |
| Background workspaces (client) | `fetchAgents`/`fetchWorkspaces` hide background workspaces and their agents unless `includeBackground`. A 0.12 client throws if the flag reaches a host without the feature | `skills/paseo-multi/scripts/rpc.mjs` | Sends `includeBackground` only when `client.supportsBackgroundWorkspaces()` is true. With an older client on a 0.12+ host, `restart` defers (or `--force` reports `unknown`) and `agents` warns. Tests in `test_hosts.py` |
| Background workspaces (client) | Same | `skills/paseo-agent-cleanup/scripts/snapshot.mjs`, `agent-cleanup.js` | Same gating. Workspace rows carry `background`. The snapshot reports `backgroundCovered`, and the summary/validation errors say when background records are invisible. Tests in `snapshot.test.mjs` and `agent-cleanup.test.js` |
| Background workspaces (MCP/CLI) | `list_agents`/`list_workspaces` need `includeBackground: true`. `paseo ls`/`workspace ls` need `--background` (0.11 rejects that flag). A workspace created from a background workspace inherits the flag | `paseo-orchestration/SKILL.md`, `paseo-agent-cleanup/references/cleanup.md`, `paseo-multi/SKILL.md`, `paseo-project/SKILL.md` | Added one-line notes. No script passes `--background` |
| `paseo run --background` | Deprecated alias of `--no-wait` (still accepted, warns) | none | No use in skills, scripts, AGENTS or READMEs |
| `paseo permit allow/deny` | Exit non-zero after a 15 s unconfirmed response | none | Not used by any skill or script |
| Schedules/heartbeats | Cron, time zone and `expiresIn` validated at the tool boundary. `PaseoToolInputError` for bad arguments | none | Guidance already requires bounded `maxRuns`/`expiresIn`. No change |
| `send_terminal_keys` | Key tokens now encoded (arrows, modifiers) | none | Adapters use `createTerminal` with a command, not key input |
| Doctor | `paseo --version` / `daemon status --json` unchanged | `scripts/paseobility-doctor.py` | No change |

## Backward compatibility

- On 0.11.x clients `supportsBackgroundWorkspaces` does not exist (confirmed
  absent from the installed 0.11.4 `app.asar`), so no new flag is sent. A host
  reporting a version below 0.12 is treated as fully covered.
- A read-only cleanup dry-run (`agent-cleanup.js --json`) against the live
  0.11.4 daemon completed with `completeSnapshots: true` and
  `backgroundCovered: true`. That is the only live run in this check.
- The new orchestration guidance keeps the 0.11.x behavior (`background: false`
  blocks, sends interrupt) as an explicit note.

## Not verified

- No 0.12.0 daemon handshake. The 0.12 MCP schemas, steering, background
  filtering, and the `supportsBackgroundWorkspaces()` gate are verified only at
  the source-diff and published-package layer.
- `paseo-multi` against a real 0.12 remote host, with a 0.12 controller or a
  mixed 0.11/0.12 pair.
- Browser tools, schedules, heartbeats and a real archive on 0.12.
- Windows and Linux 0.12 packaging paths (the macOS bundle layout is the same
  in source; Windows paths were not inspected beyond `electron-builder.yml`).
- `skills/paseo-cua` and the Cua driver scripts were out of scope for this pass.
