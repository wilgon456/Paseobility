# Paseo 0.9.0-beta.2 compatibility check

Checked on 2026-09-21, macOS arm64. This is a local compatibility record, not
a claim that every workflow or operating system was exercised.

## Runtime and contract evidence

- Installed CLI: `paseo --version` -> `0.9.0-beta.2`.
- Same-machine desktop-managed daemon: `paseo daemon status --json` ->
  `daemonVersion: 0.9.0-beta.2`, `localDaemon: running`, reachable.
- Compared the injected MCP declarations with the skill instructions:
  `create_agent` uses `provider` and `settings` (not a `profile` argument);
  `list_profiles` provides launch settings. `create_workspace` supports local
  and worktree isolation, branch-off, checkout-branch, and checkout-pr modes.
- `create_heartbeat`/`delete_heartbeat` remain the MCP heartbeat surface.
  Updating/pausing/resuming/logging applies to schedules, not heartbeats.
- Browser tools use `browser_*`, current-tab snapshot refs, and workspace
  context. `browser_wait` takes exactly one of text or URL; uploads use
  workspace file paths. See the current [MCP reference](https://paseo.sh/docs/mcp.md)
  and [browser tool reference](https://paseo.sh/docs/browser-tools.md).
- Inspected the installed app's `@getpaseo/cli/dist/commands/agent/archive.js`
  and `commands/workspace/archive.js` within `app.asar`. CLI JSON still returns
  `{ agentId|workspaceId, status: "archived", archivedAt }`. The cleanup helper's
  acknowledgement check remains compatible. MCP `archive_agent` instead returns
  `{ success: true }`; do not feed that response into the CLI parser.

## Live checks and limits

- `paseo project ls --json` and `paseo workspace ls --json` both succeed.
  The registered project uses a `paseo_slash` alias path, while the canonical
  checkout path is the `paseobility` directory.
  `paseo script ls --cwd <canonical-path>` returns `WORKSPACE_NOT_FOUND`.
  Resolve the workspace from the live listing and use `--workspace <id>`;
  that command returned `[]` successfully. Do not create a duplicate workspace
  merely to fix a path alias.
- Cleanup helper dry-run: succeeded, 14 agents and 3 workspaces inspected,
  zero selected, no validation errors, no lifecycle mutations.
- Browser `browser_list_tabs`: `browser_timeout` after 15 seconds on both the
  initial call and one retry. Tool schema
  compatibility is confirmed; actual browser interaction is **not verified**.
  No app/daemon restart or browser-host setting change was made.
- Sharing and security scanning use local helpers rather than Paseo MCP.
  Their automated tests do not prove a real GitHub publication or dynamic
  malware behavior.
- No schedule, heartbeat, production operation, real artifact publication,
  or user-owned workspace archive was executed for this check.
- PowerShell runtime is unavailable on this macOS host. Windows installer
  migration is source-reviewed, not runtime-tested.

## Consolidation and installation

- `paseo-agent-tournament` -> `paseo-orchestration`, comparison mode.
- `paseo-session-brief` and `paseo-project-bootstrap` -> `paseo-project`,
  read-only brief and setup modes. Mode-specific references load on demand.
- Browser, cleanup, sharing, and spyware inspection remain separate because
  their capabilities and authorization boundaries differ.
- `--migrate-skills` / `-MigrateSkills` archive selected predecessor directories
  after installing replacements. Retired directories are backed up even when
  ordinary overwrite backups are disabled. Private skill-library state is not
  part of migration. Without this flag, older installations are preserved.

## Validation record

- Six skill entrypoints pass the skill validator. Package version `2.7.0`,
  manifest entries, and consolidated reference links agree.
- A fresh Paseo/Codex session recognized `paseo-project` and `paseo-browser`;
  the three merged predecessor names were absent. Orchestration was omitted
  from automatic discovery and its explicit-only policy file was confirmed.
  Read-only scenario evaluation chose no project skill for ordinary coding,
  brief mode for a summary, setup mode for requested context generation, and
  comparison mode for an explicit tournament request. These are routing checks,
  not execution of those workflows. The disposable test agent was archived.
- Seven isolated Unix installer tests pass: complete migration, selected-skill
  scope, opt-in behavior, repeated migration, backup preservation with
  `--no-backup`, unknown ownership rejection, and symlink rejection.
- Existing helper tests pass: 26 Node tests (cleanup/share), 13 Python scanner
  tests, and 2 shell scanner tests. Total: 48 automated test cases/checks.
- Both real `.agents/skills` and `.claude/skills` installations contain byte-
  identical copies of the six source skill trees. The five retired names are
  absent from these active roots. The three newly retired skill backups match
  their pre-consolidation content digests.
- Backups for this installation: `~/.agents/skills-backups/` and
  `~/.claude/skills-backups/`, each under
  `Paseobility-2.7.0-20260921T134915Z-2078/`.
- The four merged `SKILL.md` entrypoints contained 25,192 characters before
  consolidation; the two replacements contain 5,956. Conditional references
  are excluded from those counts. This is not a measured token-cost reduction.
