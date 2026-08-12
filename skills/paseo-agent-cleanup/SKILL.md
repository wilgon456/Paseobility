---
name: paseo-agent-cleanup
description: >-
  Clean up inactive Paseo agents and test workspaces safely. Use when the user
  wants to archive old, idle, completed, stopped, validation, test, PR, or
  temporary Paseo agents/workspaces, reduce clutter, or inspect what can be
  cleaned up. The default mode auto-archives every non-active agent without
  asking first; never archive active agents, never delete anything, and require
  explicit approval for workspace cleanup. Inactive subagents follow the same
  no-confirmation archive rule.
---

# Paseo Agent Cleanup

This skill keeps Paseo agent/workspace lists manageable. Inactive agents are
archived automatically without confirmation, workspaces require explicit
approval, and delete is never used.

## Core rules

- Default to auto-archive every non-active agent, including subagents, without
  asking for approval again.
- Use dry-run when the user asks to preview first.
- Never delete agents or workspaces.
- Never archive active agents, including `running`, `working`, `active`,
  `starting`, `queued`, `pending`, `busy`, `executing`, or `in-progress`
  states.
- Never stop or interrupt agents automatically.
- Archive workspaces only after the user explicitly approves the exact cleanup
  plan or provides explicit workspace IDs.
- Prefer explicit IDs when the user gives them.
- Report every archive attempt and failure.

## Quick workflow

1. Inspect current state:
   ```bash
   paseo ls --json
   paseo workspace ls --json
   ```
2. Auto-archive all inactive agents without asking first:
   ```bash
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto
   ```
3. Use dry-run when previewing candidates:
   ```bash
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run
   ```
4. Archive an explicit workspace only after approval:
   ```bash
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --workspace <workspace-id> --archive --yes
   ```
5. Verify cleanup:
   ```bash
   paseo ls --json
   paseo workspace ls --json
   ```

## Bundled helper

Use:

```bash
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run --pattern 'test|verify|validation|paseobility'
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --agent <agent-id> --archive --yes
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --include-workspaces --dry-run
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --workspace <workspace-id> --archive --yes
```

Defaults:

- every non-active agent is a candidate, regardless of its name or purpose
- `--pattern <regex>` optionally narrows candidates by names/titles/cwd/provider/id
- auto mode archives selected inactive agents only, without confirmation
- workspaces are never auto-archived; use `--include-workspaces --dry-run` to
  preview and explicit `--workspace <id> --archive --yes` to archive
- `--archive` without `--yes` still refuses to modify state

## Candidate policy

Good cleanup candidates:

- any agent whose status is inactive, including `idle`, completed, or stopped
- idle test agents created for PR validation
- recognition-only agents
- skill validation agents
- fixture or temporary workspaces created only for testing

Do not clean up automatically:

- agents in an active state
- workspaces, unless explicitly specified with `--workspace <id> --archive --yes`
- anything requiring delete rather than archive

## Manual fallback

If Node is unavailable:

```bash
paseo ls --json
paseo archive <agent-id> --json
paseo workspace ls --json
paseo workspace archive <workspace-id> --json
```

On Windows PowerShell:

```powershell
paseo ls --json
paseo archive <agent-id> --json
paseo workspace ls --json
paseo workspace archive <workspace-id> --json
```

For agents, verify the ID and status, then archive inactive entries without
asking the user. Continue to require explicit approval for workspaces.

## Output expectations

Return:

```text
Cleanup Plan
- agents considered
- candidates selected
- active agents skipped
- workspaces considered

Actions
- dry-run only / archived
- IDs archived
- failures and reasons

Remaining
- anything still active
- suggested next cleanup, if any
```

## Safety notes

- `archive` is the only supported cleanup action.
- `delete` is out of scope for this skill.
- If the user asks to delete, ask for a separate explicit confirmation and use
  native Paseo commands carefully.
