# Coordination patterns

Read only the pattern required by the requested workflow.

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

Fan out isolated work, collect results, and synthesize them in the coordinator.
Create a separate review agent only when independent review is part of the
requested workflow or needed for a substantive unresolved risk. Keep that
agent analysis-only unless the user explicitly asks it to edit.

## Pattern 4: Decision gate

Create an analysis-only gate agent using an audit/review profile, preferably a
different provider from the worker. Require one of:

```text
PROCEED — acceptance criteria met, with evidence
BLOCK — failed criteria, risks, and the exact decision needed
```

Do not advance on a vague or missing gate result.

## Pattern 5: Coordinator heartbeat

Use completion notifications for agent progress. Use `create_heartbeat` only
when the user requests recurring monitoring or a required external condition
has no completion notification; do not add one merely because workers run.
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

