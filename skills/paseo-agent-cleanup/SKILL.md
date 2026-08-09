---
name: paseo-agent-cleanup
description: >-
  Clean up Paseo test agents and workspaces safely. Use when the user wants to
  archive old, idle, validation, test, PR, or temporary Paseo agents/workspaces,
  reduce clutter after testing skills, or inspect what can be cleaned up. The
  default mode is dry-run; never archive running agents, never delete anything,
  and only perform archive actions after explicit approval.
---

# Paseo Agent Cleanup

This skill keeps Paseo agent/workspace lists manageable after validation runs.
It is intentionally conservative: dry-run first, archive only, never delete.

## Core rules

- Default to dry-run.
- Never delete agents or workspaces.
- Never archive running agents.
- Never stop or interrupt agents automatically.
- Archive only after the user explicitly approves the exact cleanup plan.
- Prefer explicit IDs when the user gives them.
- Report every archive attempt and failure.

## Quick workflow

1. Inspect current state:
   ```bash
   paseo ls --json
   paseo workspace ls --json
   ```
2. Build a dry-run plan:
   ```bash
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run
   ```
3. Review candidates with the user.
4. Archive only approved candidates:
   ```bash
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --archive --yes
   ```
5. Verify cleanup:
   ```bash
   paseo ls --json
   paseo workspace ls --json
   ```

## Bundled helper

Use:

```bash
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run --pattern 'test|verify|validation|paseobility'
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --agent <agent-id> --archive --yes
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --include-workspaces --dry-run
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --workspace <workspace-id> --archive --yes
```

Defaults:

- candidates must be non-running agents
- default pattern is `test|verify|validation|retest|recognition|paseobility|\bpr\b|pr[-_ ]?\d+`
- workspaces are not auto-selected unless `--include-workspaces` or explicit
  `--workspace <id>` is used
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
- workspaces that look like normal project workspaces
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
