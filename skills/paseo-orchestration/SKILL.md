---
name: paseo-orchestration
description: >-
  Structured multi-agent coordination through Paseo. Use when the user wants to
  decompose complex work across multiple agents, fan out work in parallel, build
  task DAGs with dependencies, set up blocking ask/reply between agents, create
  decision gates, run coordinator loops, or coordinate work across providers
  and isolated workspaces.
---

# Paseo Orchestration

Use Paseo's current agent, profile, workspace, schedule, and heartbeat tools to
coordinate multiple agents. Read the base **paseo** skill first; it is the
authority for exact tool schemas in the active installation.

## Paseo 0.6 launch discovery

Do not guess provider, model, mode, thinking, or feature IDs.

1. Call `list_profiles` before creating agents and read every profile's `notes`.
2. If the user names a profile, use it. Otherwise choose the profile whose notes
   best match the delegated role.
3. There is no `profile` field on `create_agent`. Materialize the profile:
   - combine `provider` and `model` as `create_agent.provider`
   - copy `modeId` to `settings.modeId`
   - copy `thinkingOptionId` to `settings.thinkingOptionId`
   - copy `featureValues` to `settings.features`
4. If no profile fits, call `list_providers`, then `inspect_provider`. Call
   `list_models` only when model or thinking IDs are needed; the result can be
   large. Tell the user when no configured profile fits.
5. Only pass feature IDs returned by `inspect_provider`. For example, enable
   Codex fast mode only when `fast_mode` is advertised.

If `~/.paseo/orchestration-preferences.json` exists, treat its free-form
preferences as additional user guidance. Do not treat provider strings in that
legacy file as current capability truth; validate them through the discovery
tools above.

## Core principles

1. Give every agent a self-contained prompt with task, context, paths,
   constraints, acceptance criteria, and expected output.
2. Use different providers when their strengths or an independent review are
   useful; do not force cross-provider work when one profile clearly fits.
3. Read-only workers may share a workspace. Writers that can overlap must use
   separate worktree workspaces.
4. Agent parentage and workspace placement are separate. A child created in a
   different workspace remains the caller's subagent.
5. Prefer asynchronous creation. Agent-scoped `create_agent` defaults
   `notifyOnFinish` to true; continue useful work and wait for the notification.
   Do not poll `list_agents` or `get_agent_status` merely to check progress.
6. Archive only agents and workspaces created for the workflow, and only when
   cleanup is part of the user's request or the workflow contract.

## Current tool reference

| Area | Tools |
| --- | --- |
| Agent lifecycle | `create_agent`, `send_agent_prompt`, `get_agent_status`, `get_agent_activity`, `list_agents`, `update_agent`, `set_agent_mode`, `cancel_agent`, `archive_agent`, `kill_agent` |
| Discovery | `list_profiles`, `list_providers`, `inspect_provider`, `list_models` |
| Workspaces | `create_workspace`, `list_workspaces`, `rename_workspace`, `archive_workspace` |
| Workspace scripts | `list_workspace_scripts`, `start_workspace_script`, `stop_workspace_script` |
| Heartbeats | `create_heartbeat`, `delete_heartbeat` |
| Schedules | `create_schedule`, `list_schedules`, `inspect_schedule`, `update_schedule`, `pause_schedule`, `resume_schedule`, `run_schedule_once`, `schedule_logs`, `delete_schedule` |

`create_agent` requires `title`, `provider`, and `initialPrompt`. Optional launch
configuration belongs under `settings`; optional placement is `workspaceId`.
Agent-scoped `send_agent_prompt` defaults to background delivery. Use
`background: false` only when a short synchronous reply is genuinely required.

## Pattern 1: Fan-out

Use for independent subtasks.

1. Define non-overlapping deliverables and acceptance criteria.
2. Create a worktree workspace per writer when changes may overlap:
   `create_workspace { isolation: "worktree", mode: "branch-off", ... }`.
3. Create all agents with the selected profiles materialized into their launch
   calls. Pass the returned `workspaceId` when isolation is needed.
4. Let completion notifications arrive; collect final evidence with
   `get_agent_activity` when needed.
5. Synthesize results. Retry a transient failure at most once with a changed
   approach; escalate permission, requirement, or destructive-action blockers.

Never let multiple agents edit the same checkout concurrently.

## Pattern 2: Task DAG

Use when each step depends on the previous result.

```text
Step 1 implementation -> Step 2 test -> Step 3 review -> decision
```

Launch only ready nodes. Include the predecessor's output and evidence in the
next agent's prompt. A completion notification is not proof of success: compare
the reported output with the node's acceptance criteria before advancing.

## Pattern 3: Hybrid split/merge

```text
             -> Worker A -\
Split work                  -> synthesis -> independent review
             -> Worker B -/
```

Fan out isolated work, collect results, then create a synthesis or review agent
with all relevant outputs and diffs. Keep the review agent analysis-only unless
the user explicitly asks it to edit.

## Pattern 4: Decision gate

Create an analysis-only gate agent using an audit/review profile, preferably a
different provider from the worker. Require one of:

```text
PROCEED — acceptance criteria met, with evidence
BLOCK — failed criteria, risks, and the exact decision needed
```

Do not advance on a vague or missing gate result.

## Pattern 5: Coordinator heartbeat

Use `create_heartbeat` when periodic checks should return to this same agent.
Always set `maxRuns` or `expiresIn`, preferably both. When complete, call
`delete_heartbeat`.

MCP intentionally has no heartbeat update tool. Delete and recreate a heartbeat
when its cadence or prompt changes. Use `create_schedule` instead when each run
should start a fresh agent; schedules have update, pause, resume, run-once, log,
and delete operations.

## Pattern 6: Blocking ask/reply

For a new specialist, create an asynchronous query agent and use its completion
notification. For a short follow-up to an existing agent, call
`send_agent_prompt` with `background: false`. Do not use blocking mode for work
that may take minutes.

## Pattern 7: Workspace script verification

When a repository defines supervised scripts in `paseo.json`:

1. Call `list_workspace_scripts` for the exact workspace.
2. Start only the script required by the task with `start_workspace_script`.
3. Use returned lifecycle, port, proxy URL, health, exit code, and terminal ID as
   evidence.
4. Stop scripts started for the workflow with `stop_workspace_script` when the
   task is finished.

Do not invent script names or start every service by default.

## Escalation and safety

- `cancel_agent` interrupts the current run but keeps the agent. Use it for an
  in-scope course correction.
- `archive_agent` soft-deletes. `kill_agent` is permanent; use it only for an
  agent created by this workflow and only when permanent termination is clearly
  required.
- `archive_workspace` archives the workspace, its agents, and terminals. Paseo
  may remove an owned worktree when its final active reference is archived;
  verify the target before calling it.
- Do not push, merge, deploy, approve permissions, or perform another external
  write unless the user authorized that action.
- For permission errors, missing dependencies, ambiguous requirements, or
  destructive choices, report what failed and the exact decision needed.

## Final response

Report the profiles/providers actually used, workspace isolation, completed and
failed nodes, verification evidence, synthesis or gate decision, and any active
agents, schedules, heartbeats, scripts, or workspaces intentionally left behind.
