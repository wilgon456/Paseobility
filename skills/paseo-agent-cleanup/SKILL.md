---
name: paseo-agent-cleanup
description: >-
  Clean up Paseo test agents and workspaces safely. Use when the user wants to
  archive old, idle, validation, test, PR, or temporary Paseo agents/workspaces,
  reduce clutter after testing skills, or inspect what can be cleaned up. The
  default mode auto-archives clearly safe non-running test/validation agents;
  never archive running agents, never delete anything, and require explicit
  approval for workspace cleanup or ambiguous targets.
---

# Paseo Agent Cleanup

This skill keeps Paseo agent/workspace lists manageable after validation runs.
It is intentionally conservative: safe agent candidates can be archived
automatically, workspaces require explicit approval, and delete is never used.

## Core rules

- Default to auto-archive only clearly safe non-running test/validation agents.
- Use dry-run when the user asks to preview first.
- Never delete agents or workspaces.
- Never archive running agents.
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
2. Auto-archive safe finished test/validation agents:
   ```bash
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto
   ```
3. Use dry-run when previewing candidates:
   ```bash
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run
   ```
4. Archive explicit workspace or ambiguous targets only after approval:
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

- candidates must be non-running agents
- default pattern is `test|verify|validation|retest|recognition|paseobility|\bpr\b|pr[-_ ]?\d+`
- auto mode archives selected agents only
- workspaces are never auto-archived; use `--include-workspaces --dry-run` to
  preview and explicit `--workspace <id> --archive --yes` to archive
- `--archive` without `--yes` still refuses to modify state

## Candidate policy

Good cleanup candidates:

- idle test agents created for PR validation
- recognition-only agents
- skill validation agents
- fixture or temporary workspaces created only for testing
- agents whose title/name clearly contains `test`, `verify`, `validation`,
  `retest`, `recognition`, `paseobility`, `pr`, or a `pr-123` style marker

Do not clean up automatically:

- running agents
- unclear production/task agents
- agents with active user work
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

Only run archive commands after confirming the ID and status.

## Output expectations

Return:

```text
Cleanup Plan
- agents considered
- candidates selected
- running agents skipped
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
