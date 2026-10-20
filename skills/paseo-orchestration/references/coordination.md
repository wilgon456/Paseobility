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
5. Synthesize results. Retry failures with a changed approach or another
   profile; escalate only requirement gaps or actions on the ask-first floor.

## Integrate an isolated writer

Confirm its workspace directory, branch and base commit. Integrate only the
reviewed task commits or patch, not a whole branch with unrelated commits.
Preserve target-side edits and resolve conflicts using both sides' intent. Test
the integrated tree; a worker's isolated tests do not prove the combination.

Keep a worktree that has uncommitted/unique work or active agents. Worktrees
share objects and branch refs: no force updates or forced removal. Stop only
scripts this workflow started.

## Pattern 2: Task DAG

Use when each step depends on the previous result.

```text
Step 1 implementation -> Step 2 test -> Step 3 review -> decision
```

Launch every ready node at once. Include the predecessor's output and evidence
in the next prompt. Check each node's output against its criteria before
advancing; a completion notification is not proof.

## Pattern 3: Hybrid split/merge

```text
             -> Worker A -\
Split work                  -> synthesis -> independent review
             -> Worker B -/
```

Fan out isolated work, collect results, and synthesize them in the coordinator.
Add a review agent only when review is requested or a substantive risk remains;
keep it analysis-only by default so its judgment stays independent.

## Pattern 4: Decision gate

Create an analysis-only gate agent using an audit/review profile, preferably a
different provider from the worker. Require one of:

```text
PROCEED — acceptance criteria met, with evidence
BLOCK — failed criteria, risks, and the exact decision needed
```

Do not advance on a vague or missing gate result.

## Pattern 5: Coordinator heartbeat

Use `create_heartbeat` only for requested recurring monitoring or an external
condition with no completion notification. Always set `maxRuns` or
`expiresIn`, preferably both, and `delete_heartbeat` when complete.

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

