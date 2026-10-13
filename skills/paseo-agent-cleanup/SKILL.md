---
name: paseo-agent-cleanup
description: >-
  Safely inspect and archive explicitly selected or clearly disposable Paseo
  agents and test workspaces. Use when the user asks to preview cleanup
  candidates, reduce agent-list clutter, or archive explicit test, validation,
  fixture, or temporary sessions. Ordinary idle agents are resumable and are
  never auto-archived based on status alone. Bare invocation is dry-run; active
  agents and unapproved workspaces remain protected, and delete, stop, kill,
  restart, history, timeline, and resume are never used for cleanup.
---

# Paseo Agent Cleanup

Preview first; archive only user-selected inactive agents or clearly disposable
sessions. Ordinary idle agents remain resumable. A bare invocation changes nothing.
Run the bundled helper from this skill's installed directory, or use its absolute
path from another project:

```bash
node "<skill-dir>/scripts/agent-cleanup.js" --json
node "<skill-dir>/scripts/agent-cleanup.js" --dry-run --pattern 'cleanup-validation|fixture'
node "<skill-dir>/scripts/agent-cleanup.js" --agent <full-id> --archive --yes
node "<skill-dir>/scripts/agent-cleanup.js" --auto --pattern 'cleanup-validation|fixture'
node "<skill-dir>/scripts/agent-cleanup.js" --workspace <full-id> --archive --yes
```

## Guards

- Only confirmed `idle`, `error` or `closed` states can be selected. Running,
  initializing, missing and unknown states stay protected, even with an exact ID.
- Pending permissions, unknown permission counts and unfinished attention block
  cleanup. `finished` attention alone does not block a deliberately selected
  inactive agent.
- `--auto` selects only exact IDs, a user-supplied pattern, or clear disposable
  markers. It never selects agents merely because they are idle.
- A workspace needs an exact ID and `--archive --yes`. Its active/unknown or
  permission-pending children block archive. Ownership comes from `workspaceId`,
  never cwd. A workspace-only request does not select unrelated agents.
- Ambiguous short IDs are refused; use full IDs.
- Never use delete, stop, kill, restart, history, timeline or resume for cleanup.

## Complete state before and after

The helper reads complete, paginated snapshots from the installed Paseo client,
including ownership and permission metadata. CLI `ls --json` is a display
projection and is insufficient for these guards. No SDK package is downloaded.
The current adapter contract is Paseo 0.11.2; a changed/missing internal client,
invalid page, repeated cursor, timeout or changed daemon identity fails closed.

Every archive gets a fresh precheck and immediate postcheck. Success requires
an acknowledgement for the full ID with `status: "archived"` and `archivedAt`,
plus removal from a new complete snapshot. A failed acknowledgement or uncertain
postcondition stops the remaining mutations and reports partial effects. Never
retry an uncertain archive blindly.

Archive dispatch uses the same installed client with a full ID and repeats the
protection/identity checks inside that connection. It avoids CLI list-prefix
resolution and Windows command-shell dispatch. No arbitrary client operation
is admitted by this adapter.

The server does not expose an atomic inactive-only archive condition. These
checks reduce the read-to-action gap; they cannot lock out a concurrent new run.
Do not describe the guard as an atomic guarantee.

## Runtime and report

Require Node and an installed Paseo desktop/CLI client. Bundled Electron is used
for app ASAR modules. A standalone npm CLI can also be discovered. For a trusted
custom installation, set both `PASEO_CLEANUP_CLIENT_MODULE` and
`PASEO_CLEANUP_NODE` to its actual files; do not guess an alternate SDK.
macOS live read-only snapshots were verified. Windows runtime discovery and
the JSON dispatch path have fixture/source coverage; a fresh Windows live run remains
unverified. Preserve unrelated agents, workspaces and private state.

Report selection sources, skipped protection reasons, each command/acknowledgement/
postcheck result, partial effects and remaining unverified work. Use JSON for
machine-readable evidence. For limitations and an MCP/manual alternative, read
[references/cleanup.md](references/cleanup.md).
