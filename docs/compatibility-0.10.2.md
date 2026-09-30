# Paseo 0.10.2 compatibility check

Checked on 2026-09-30, macOS arm64. This is a local compatibility record, not
a claim that every workflow or operating system was exercised. The
[0.9.0-beta.2 record](./compatibility-0.9.0-beta.2.md) is retained as history.

## Runtime and contract evidence

- Installed app: `/Applications/Paseo.app` `0.10.2` (`CFBundleShortVersionString`).
  `~/.local/bin/paseo` symlinks to the app bundle CLI; `paseo --version` ->
  `0.10.2`.
- Latest official release: `getpaseo/paseo` `v0.10.2`, published
  `2026-09-29T23:53:30Z` (the repository's latest release). The installed
  0.10.2 matches it.
- Live daemon: `paseo daemon status --json` reports `daemonVersion:
  0.9.0-beta.2`, `desktopManaged: true`, `startedAt: 2026-09-10`. The app bundle
  is 0.10.2 while the running daemon still serves the 0.9.0-beta.2 contract
  because it has not been restarted. **The daemon was not restarted** for this
  check; restarting Paseo can kill running agents.
- Release-note review for `0.9.1` through `0.10.2`: the changes are app/chat
  features and fixes (OpenCode v2 support, Claude/Opus catalog, conversation
  rendering, relay passwords, provider pickers). No documented MCP tool name,
  required argument, ownership/notification rule, schedule/heartbeat surface,
  browser-tool family, or archive-response shape changed in a way that affects
  the bundled skills.
- Contract spot-check against the live MCP tool declarations and the installed
  base `paseo` skill: `create_agent` uses `provider` plus `settings` (there is
  no `profile` argument) and `list_profiles` supplies launch settings;
  `create_workspace` supports `local`/`worktree` with `branch-off`,
  `checkout-branch`, and `checkout-pr`; heartbeats remain
  `create_heartbeat`/`delete_heartbeat` only while schedules carry
  update/pause/resume/logs/run-once; browser tools remain the `browser_*`
  family over a workspace context; MCP `archive_agent` returns
  `{ success: true }` while the CLI JSON returns
  `{ agentId|workspaceId, status: "archived", archivedAt }`.
- Installed-app source spot-check (this is the 0.10.2 evidence layer, since the
  live daemon is older): the shipped app bundle at
  `/Applications/Paseo.app/Contents/Resources/app.asar` (`0.10.2`, installed
  2026-09-29) contains the MCP `TOOL_SPECS` table, which enumerates **61** tool
  names matching the skills: `create_workspace`, `list_workspaces`,
  `archive_workspace`, `rename_workspace`, `create_agent`, `send_agent_prompt`,
  `get_agent_status`, `list_agents`, `cancel_agent`, `archive_agent`,
  `kill_agent`, `update_agent`, `get_agent_activity`, `set_agent_mode`,
  workspace-script tools, terminal tools, `create_schedule`/`create_heartbeat`/
  `delete_heartbeat` plus the schedule `list`/`inspect`/`pause`/`resume`/
  `delete`/`update`/`logs`/`run_schedule_once` group, `list_providers`,
  `list_models`, `list_profiles`, `inspect_provider`,
  `list_pending_permissions`, `respond_to_permission`, and the full
  `browser_*` family. Its `AGENT_FIELDS` are `title`, `agentId`, `provider`,
  `workspaceId`, `cwd`, `sessionMode`, `modeId`, `background`,
  `notifyOnFinish`, `settings`, `labels` (no `profile`), and the `list_profiles`
  description itself states "there is no `profile` parameter".

## Live checks and limits

- The observed live handshake/contract is the running daemon's
  (0.9.0-beta.2). A freshly started 0.10.2 daemon was **not** run. The 0.10.2
  contract is therefore verified at the release-notes plus installed-app
  (`app.asar` `TOOL_SPECS`) review layer, not by a new 0.10.2 daemon handshake.
- Browser interaction, schedules, heartbeats, and a real agent/workspace
  archive were not executed for this check.
- No Paseo app or daemon restart, no schedule/heartbeat mutation, and no
  user-owned workspace archive were performed.

## Baseline change

- The stated local compatibility baseline moves from `0.9.0-beta.2` to
  `0.10.2` in `AGENTS.md` and `skills/paseo-orchestration/SKILL.md`; older
  baseline references remain only as dated history in the README files and the
  prior compatibility record.
- `paseo-browser` no longer states a Paseo baseline in its default path: its
  default backend is now CloakBrowser, and the Paseo `browser_*` tools are an
  optional backend documented in
  [`skills/paseo-browser/references/paseo.md`](../skills/paseo-browser/references/paseo.md).
  The `0.10.2` contract checks here still apply to that optional Paseo backend
  (same `browser_*` family, `create_agent` without a `profile` argument, and the
  archive shapes).
