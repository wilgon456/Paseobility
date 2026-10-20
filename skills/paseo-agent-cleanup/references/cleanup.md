# Cleanup evidence and MCP fallback

The helper reads complete snapshots through the installed
[Paseo client](https://github.com/getpaseo/paseo/blob/v0.11.2/packages/cli/src/utils/client.ts)
(adapter contract: Paseo 0.11.2). The
[CLI agent list](https://github.com/getpaseo/paseo/blob/v0.11.2/packages/cli/src/commands/agent/ls.ts)
omits workspace and permission fields and its page cursor, and
[inspect](https://github.com/getpaseo/paseo/blob/v0.11.2/packages/cli/src/commands/agent/inspect.ts)
omits workspaceId, so neither replaces a complete snapshot. A changed or missing
client, invalid page, repeated cursor, timeout or changed daemon identity makes
the helper refuse.

Archive dispatch goes through the same client with the exact ID (no CLI prefix
resolution, no shell) and repeats the protection and daemon-identity checks
inside that connection. The helper honors `PASEO_HOST`/`PASEO_HOME` via the
client's daemon-target selection without printing them.

A timed-out archive may still have completed on the daemon. Keep its exact ID,
read a fresh snapshot and report the uncertainty instead of repeating it.

## MCP fallback

If the installed client cannot be loaded, use the base `paseo` skill's MCP
tools: read full `list_agents` metadata, resolve workspace ownership from
`workspaceId` (never cwd), skip active/unknown/permission-pending agents,
archive each selected ID with `archive_agent`, and re-read the list to confirm.
Workspace archive affects all its agents and terminals and may remove its
managed worktree ([workspace guide](https://github.com/getpaseo/paseo/blob/v0.11.2/public-docs/workspaces.md));
archive only a workspace the user named.
