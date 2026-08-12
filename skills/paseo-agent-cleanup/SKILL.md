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

This skill reduces Paseo list clutter without treating a normal idle session as
disposable. A bare invocation only previews. Agent archive is limited to an
explicit ID, a user-supplied pattern, or a clear disposable/test/validation
marker. Workspace archive always requires an explicit workspace ID and
`--archive --yes`.

## Core rules

- Treat `idle` as a normal resumable state, not as permission to archive.
- Default to dry-run. Never archive every inactive agent by default.
- `--auto` may archive only inactive agents selected by one of these signals:
  - explicit `--agent <id>`
  - a user-supplied `--pattern <regex>`
  - a clear disposable, fixture, smoke, temp, test, or validation marker
- Never archive active agents, including `running`, `working`, `active`,
  `starting`, `queued`, `pending`, `busy`, `executing`, or `in-progress`.
- Never delete, stop, interrupt, or kill agents or workspaces. Never remove lock
  files or restart the Paseo daemon as part of cleanup.
- Archive workspaces only after the user explicitly approves the exact cleanup
  plan or supplies explicit workspace IDs with `--archive --yes`.
- After every archive attempt, re-run `paseo ls --json` (or `paseo workspace ls
  --json`) and verify the archived record is no longer in the active listing.
- Do not open timeline/history or resume an archived agent to verify cleanup.
  Those operations can acquire a native provider writer lock.
- Exit code 0 from `paseo archive` proves only that the command returned
  successfully. It does not by itself prove that the native provider runtime
  released its writer or lock.
- Report an unconfirmed native release as `providerRelease: unknown`, a
  provider failure, a command failure, or a record-removal verification failure
  as partial/failed cleanup, and return non-zero.

## Quick workflow

1. Preview the safe default candidates. This makes no changes:

   ```bash
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js
   ```

2. Review `paseo ls --json` and choose an explicit agent ID or a bounded
   pattern whenever possible:

   ```bash
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run --pattern 'cleanup-validation|fixture'
   ```

3. Archive only the approved inactive selection:

   ```bash
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto --agent <agent-id>
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto --pattern 'cleanup-validation|fixture'
   ```

4. Archive an explicit workspace only after approval:

   ```bash
   node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --workspace <workspace-id> --archive --yes
   ```

5. Use the helper's post-archive listing verification. If checking manually,
   inspect only the active listings:

   ```bash
   paseo ls --json
   paseo workspace ls --json
   ```

   Do not use history, timeline, or resume as an archive verification method.

## Bundled helper

Use:

```bash
# Safe default: dry-run, with only clearly disposable agents marked SELECTED
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --json

# Preview a user-bounded selection
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run --pattern 'test|verify|validation|paseobility'
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --include-workspaces --dry-run

# Agent archive: explicit ID, user pattern, or clear disposable marker only
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto --agent <agent-id>
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto --pattern 'cleanup-validation|fixture'
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --agent <agent-id> --archive --yes

# Workspace archive: exact ID and explicit approval only
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --workspace <workspace-id> --archive --yes
```

Defaults:

- bare invocation is dry-run
- there is no implicit `.*` pattern
- ordinary idle, completed, or stopped status alone does not select an agent
- without an ID or user pattern, only clear disposable/test/validation markers
  are selected for preview or `--auto`
- explicit agent IDs take precedence over pattern/marker discovery
- `--archive` requires `--yes` and an explicit agent/workspace ID or a
  user-supplied pattern
- workspaces are never auto-archived; `--include-workspaces` is preview-only
- all archive attempts are verified by listing records again, never by opening
  archived history or resuming a provider thread
- unknown native provider release is not reported as complete success

## Candidate policy

Good agent cleanup candidates:

- an inactive agent whose exact ID the user supplied
- an inactive agent matched by a bounded pattern the user supplied
- an inactive agent with a clear disposable, fixture, smoke, temp, test, or
  validation marker in its name, title, project, or working path
- recognition or validation agents only when their ID, user pattern, or naming
  clearly marks them as disposable

Do not clean up automatically:

- a normal idle agent with no explicit selection or disposable marker
- completed or stopped agents based only on status
- any active agent, even when explicitly named
- workspaces, unless explicitly specified with `--workspace <id> --archive
  --yes`
- anything requiring delete, stop, kill, lock-file removal, daemon restart,
  history/timeline inspection, or resume

## Verification and failures

For each archive action, distinguish three separate facts:

1. `commandExitCode`: whether the Paseo archive command returned successfully.
2. `paseoRecordRemoved`: whether a fresh active-list query no longer contains
   the record.
3. `providerRelease`: whether the archive response explicitly confirms native
   provider release. When it does not, report `unknown`.

Command success with a remaining Paseo record is `verification-failed`.
Verified Paseo record removal with an unknown provider release is
`provider-release-unknown`, not full success. Partial failures and verification
failures must be visible in both JSON and human output and return non-zero.

## Manual fallback

If Node is unavailable, do not reproduce broad auto-cleanup manually. Use exact
IDs, inspect only active lists, and do not open history or resume threads:

```bash
paseo ls --json
paseo archive <explicit-agent-id> --json
paseo ls --json
paseo workspace ls --json
paseo workspace archive <approved-workspace-id> --json
paseo workspace ls --json
```

On Windows PowerShell, use the same Paseo commands. If provider release is not
explicitly present in the archive result, report it as unknown. Never infer
native release from exit code 0.

## Output expectations

Return:

```text
Cleanup Plan
- dry-run / auto / explicit archive mode
- candidates and their selection source
- ordinary idle and active agents skipped
- workspaces considered and approval state

Actions
- command exit code
- Paseo record-removal verification
- provider release: confirmed / failed / unknown
- outcome: success / partial-failure / failed

Remaining
- anything still active or unverifiable
- no history/timeline/resume verification performed
```

## Safety notes

- `archive` is the only supported cleanup mutation.
- `delete`, `stop`, `kill`, lock-file removal, and daemon restart are out of
  scope and must not be run automatically.
- Session data may still exist after archive. Do not probe it through
  history/resume during cleanup; escalate native-provider release problems to
  Paseo core instead.
