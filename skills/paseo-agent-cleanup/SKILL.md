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

Archive agents the user selected or that are clearly disposable. Agent archive
is a soft delete: the record stays in Paseo (`paseo agent ls -a`). Run the
bundled helper by its absolute path:

```bash
node "<skill-dir>/scripts/agent-cleanup.js" --json                  # preview (default)
node "<skill-dir>/scripts/agent-cleanup.js" --agent <full-id> --archive
node "<skill-dir>/scripts/agent-cleanup.js" --pattern '<regex>' --archive
node "<skill-dir>/scripts/agent-cleanup.js" --auto                  # disposable markers only
node "<skill-dir>/scripts/agent-cleanup.js" --workspace <full-id> --archive --yes
```

When the user names the agents or the pattern, archive directly; preview only
when the selection is unclear. `--auto` picks agents with test, fixture,
validation, temp or similar markers in their name, cwd or project.

## Guards (enforced by the helper)

- Only `idle`, `error` or `closed` agents can be archived. Running,
  initializing and unknown states stay protected, even with an exact ID.
- Pending permissions or unfinished attention block archive.
- Idle alone never selects an agent; ordinary idle agents stay resumable.
- Workspaces need an exact ID and `--yes`: archive takes their agents and
  terminals and may remove the managed worktree. Any active or
  permission-pending child blocks it. A test-like title alone does not
  authorize a workspace.
- Ambiguous short IDs are refused; use full IDs.
- Never use delete, stop, kill, restart, history, timeline or resume for cleanup.

Each archive gets a fresh precheck and a postcheck against a complete paginated
snapshot from the installed Paseo client. An unacknowledged or unverified
archive halts the rest; inspect fresh state instead of retrying blindly. The
checks narrow but do not close the read-to-archive race, so do not call them
atomic.

## Runtime and fallback

Needs Node and an installed Paseo desktop app or npm CLI. For a custom install,
set both `PASEO_CLEANUP_CLIENT_MODULE` and `PASEO_CLEANUP_NODE`. If the client
cannot be loaded, use the MCP flow in [references/cleanup.md](references/cleanup.md)
with the same guards.

## Report

What was archived (with acknowledgement and postcheck), what was skipped and
why, and any partial or unverified effect.
