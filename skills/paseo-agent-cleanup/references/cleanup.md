# Cleanup evidence and manual alternative

The adapter uses the [Paseo 0.11.2 client](https://github.com/getpaseo/paseo/blob/v0.11.2/packages/cli/src/utils/client.ts).
It reads all pages and refuses loops, inconsistent pagination and identity changes.
The [CLI agent list](https://github.com/getpaseo/paseo/blob/v0.11.2/packages/cli/src/commands/agent/ls.ts)
omits workspace and permission fields and does not expose its page cursor; the
[inspect projection](https://github.com/getpaseo/paseo/blob/v0.11.2/packages/cli/src/commands/agent/inspect.ts)
also omits workspaceId. Neither is a substitute for a complete snapshot.

Node process timeouts apply to the helper's own child only. A timed-out archive
may have completed on the daemon. Keep its exact ID, inspect a new complete
snapshot and report the uncertainty; do not repeat the mutation automatically.

The helper snapshots do not call history, resume, provider reload, or daemon
lifecycle operations. It closes only the client connection it opened. It preserves
CLI target selection through the installed client's selectDaemonTarget, including
explicit PASEO_HOST/PASEO_HOME settings, without exposing those values in errors.

For an authorized archive, the adapter admits only an exact agent/workspace ID,
checks the expected server identity and current protection state, and calls the
installed client's archive method. It returns only that target's acknowledgement.
It has no arbitrary RPC route. Requests cross stdin as JSON; no cmd.exe/shell
interpolation or CLI first-page ID resolution is involved. Offline tests cover
refusal and exact-ID dispatch; live archive mutations were not performed during
the validation run.

If the internal client is unavailable, report that blocker. An authorized manual
MCP flow can use the installed base paseo skill: read full list_agents metadata,
resolve exact workspace ownership, reject active/unknown/permission states, archive
one authorized ID, and re-read complete lists. Use only schema-verified tools.
Do not replace this with broad CLI --auto cleanup or reconstruct ownership from cwd.
Workspace archive affects all its agents and terminals and may remove its managed
worktree, as explained in [the workspace guide](https://github.com/getpaseo/paseo/blob/v0.11.2/public-docs/workspaces.md).

The current helper proves child-agent protection; it does not prove a workspace's
terminals are disposable. The user must explicitly authorize that exact workspace
archive. A test-like title alone does not authorize a workspace.
