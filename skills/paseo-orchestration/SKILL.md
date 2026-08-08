---
name: paseo-orchestration
description: >-
  Structured multi-agent coordination through Paseo. Use when the user wants to
  decompose complex work across multiple agents, fan out work in parallel, build
  task DAGs with dependencies, set up blocking ask/reply between agents, create
  decision gates, run coordinator loops, or when one agent needs to spawn and
  manage several others. Use this when the task is "orchestrate X", "coordinate
  Y across agents", "fan out Z to multiple agents", "decompose this into
  subtasks", or the user wants parallel execution with result synthesis. Use
  `paseo-handoff` when delegating to a single agent. Use `paseo-loop` for
  repetitive worker/verifier cycles. Use `paseo-committee` for root-cause
  analysis by two agents. Use `paseo-advisor` for a single second opinion.
---

# Paseo Orchestration

Paseo orchestration lets one agent coordinate multiple other agents — across
providers, in isolated workspaces, with structured patterns. This skill
teaches the coordination patterns; the base `/paseo` skill teaches the
individual tool surface.

## Prerequisites

Read the **paseo** skill first. Before choosing any provider, read
`~/.paseo/orchestration-preferences.json`. This file has two parts:
- `providers` — maps role categories to provider strings (e.g. `"impl": "codex/gpt-5.5"`).
  Use these exact strings when calling `paseo_create_agent`.
- `preferences` — freeform string array with user guidance (e.g. model preferences,
  style notes). Weave these into the initialPrompt of every agent you create.

If the file is missing, use sensible defaults (e.g. `codex/gpt-5.4` for impl,
`claude/opus` for ui) and tell the user once that preferences are unset.

## Core principles

1. **You are the coordinator, not the worker.** Your job is to decompose,
   dispatch, monitor, and synthesize. Delegate implementation to subagents.
2. **Every subagent starts with zero context.** Its prompt must be a
   self-contained briefing with task, files, constraints, and acceptance
   criteria.
3. **Cross-provider is the superpower.** Use different providers for different
   roles — Codex for implementation, Claude for review, etc. Each catches the
   other's blind spots.
4. **Isolation prevents interference.** When workers modify the same files or
   run conflicting commands, give each its own workspace via
   `paseo_create_workspace`. Pass the returned `workspaceId` when creating
   the agent. Archive workspaces when done.
5. **Don't poll.** Subagents notify you on completion via `notifyOnFinish`,
   which is true by default for agent-scoped calls. Move on to other work.
6. **Prefer asynchronous.** `create_agent` with `notifyOnFinish` (default
   true) so you can continue. Only use `background: false` on
   `send_agent_prompt` when you specifically need a blocking response.

## Tool reference

These are the Paseo MCP tools you use for orchestration. The `/paseo` skill
has full signatures.

| Tool | Use |
|------|-----|
| `paseo_create_agent` | Spawn a new subagent with a task |
| `paseo_send_agent_prompt` | Send a follow-up to an existing agent |
| `paseo_get_agent_status` | Check lifecycle state of an agent |
| `paseo_get_agent_activity` | Read agent timeline entries |
| `paseo_list_agents` | Find agents by status, cwd, or recency |
| `paseo_cancel_agent` | Interrupt a running agent (keep alive) |
| `paseo_kill_agent` | Terminate an agent permanently |
| `paseo_archive_agent` | Soft-delete an agent |
| `paseo_create_workspace` | Create isolated workspace for a task |
| `paseo_create_heartbeat` | Recurring prompt back to same agent |
| `paseo_create_schedule` | Fresh agent on a cron cadence |

`paseo_create_agent` requires: `title`, `provider`, `initialPrompt`.
Optional: `workspaceId` (put worker in a different workspace),
`notifyOnFinish` (default true for agent-scoped calls).

Agent-scoped `paseo_send_agent_prompt` defaults to `background: true` and
`notifyOnFinish: true`. For synchronous follow-ups, pass `background: false`.

## Pattern 1: Fan-out (parallel execution)

Decompose a task into N independent subtasks, launch them simultaneously,
then synthesize results.

```
1. Identify independent subtasks.
2. If subtasks edit the same files or run conflicting commands, create an
   isolated workspace per subtask via paseo_create_workspace.
3. For each subtask, call paseo_create_agent with:
   - title: "[Fan-out] <subtask description>"
   - provider: from preferences (impl for coding)
   - initialPrompt: self-contained briefing
   - workspaceId: isolated workspace if needed, otherwise current
4. All notifications arrive as agents finish.
5. Synthesize results.
   - If a transient failure (test flake, network timeout): bounded retry
     (at most 1 retry, different approach).
   - If a hard failure (permission error, missing dependency, ambiguity):
     escalate to user via Pattern 7. Do not silently retry or reroute.
```

**When to use:** Independent files, no shared state, results can be merged.
**Isolation rule:** If two workers will write to overlapping files, use
separate workspaces. If they only read shared files, same workspace is fine.

## Pattern 2: Task DAG (sequenced execution)

Break work into steps where each depends on the previous. Launch step N+1
only after step N reports success.

```
1. Define the dependency graph: Step1 → Step2 → Step3.
2. Launch Step1 with paseo_create_agent.
3. Wait for notification that Step1 finished.
4. Check paseo_get_agent_activity for Step1's output.
5. Feed Step1's results into Step2's initialPrompt.
6. Launch Step2 with paseo_create_agent.
7. Repeat through the DAG.
```

**When to use:** Sequential dependencies — codegen → review → test → deploy.

## Pattern 3: Hybrid DAG (fan-out with dependencies)

Some steps are parallel, others sequential. Common shape:
```
          ┌→ Worker A (component 1) ─┐
Split ────┤                          ├──→ Merge (synthesize) ──→ Review
          └→ Worker B (component 2) ─┘
```

```
1. Launch Worker A and Worker B simultaneously (Pattern 1).
2. Wait for both to finish.
3. Use paseo_get_agent_activity on both to collect outputs.
4. Create Merge agent with both outputs in its initialPrompt.
5. After Merge finishes, create Review agent with the merged result.
```

**When to use:** Any split-merge workflow — parallel feature branches,
multi-file refactors, or cross-cutting changes.

## Pattern 4: Decision gate

Between steps, pause and evaluate whether to proceed. Create an analysis-only
agent that returns a judgment.

```
1. Worker completes a step.
2. Create a Gate agent:
   - title: "[Gate] Evaluate <step> before proceeding"
   - provider: from audit or planning preferences
   - initialPrompt: "You are a decision gate. Review the following output.
     Determine if we should proceed to the next step or stop. Return your
     decision as PROCEED or BLOCK with specific reasons. DO NOT edit files."
     Include: worker output, acceptance criteria, risk factors.
3. Wait for Gate's judgment.
4. If PROCEED → launch next step. If BLOCK → report to user with reasons.
```

**When to use:** High-risk steps, security-sensitive changes, deployment
gates, or any time you need a second look before proceeding.

## Pattern 5: Coordinator loop

A heartbeat-driven pattern where the coordinator periodically checks on
workers and issues new instructions.

```
1. Create workers with paseo_create_agent.
2. Create a heartbeat with paseo_create_heartbeat:
   - prompt: "Check all workers. If any are done, evaluate their output.
     If all are done, synthesize and report. If any need follow-up, send it.
     Delete this heartbeat when all work is complete."
   - cron: "*/5 * * * *" (every 5 minutes)
   - maxRuns: 12 (safety cap — adjust to your time budget)
   - expiresIn: "2h" (auto-cleanup if not manually deleted)
3. Heartbeat repeats until work is done or limits are hit.
4. Call paseo_delete_heartbeat when complete.
```

**When to use:** Long-running parallel work, CI babysitting, or when you
need to periodically reassess progress across multiple agents.

## Pattern 6: Blocking ask/reply

You need a specific piece of information or judgment from another agent
before you can continue your own work (e.g. a code review before merging).

```
1. Create a query agent:
   - title: "[Ask] <question>"
   - provider: from audit or planning preferences
   - initialPrompt: the specific question with all context needed
2. Wait for the notification that the query agent finished.
3. Check paseo_get_agent_activity to read its response.
4. Feed the response into your next decision or action.
```

For a follow-up to an existing agent that must return synchronously,
use `paseo_send_agent_prompt` with `background: false`. This blocks
until the agent responds. Use sparingly — async is better for anything
that takes more than a few seconds.

**When to use:** Code review before merge, architecture decision needed,
technical question for a specialist.

## Pattern 7: Escalation

When a worker reports an unexpected problem, escalate to the user with
context rather than silently failing.

```
1. Worker reports failure or blocker.
2. Check paseo_get_agent_activity for details.
3. Prepare an escalation message:
   - What was attempted
   - What failed
   - What the worker tried
   - What the user needs to decide
4. Report to the user. Do not silently retry or route around.
```

**When to use:** Permission needed, ambiguous requirements, conflicts the
coordinator can't resolve.

## Putting it together: a full orchestrated workflow

"Implement a new API endpoint with tests, then review it"

```
1. Decompose:
   - Worker A: Implement the endpoint (pref: impl)
   - Worker B: Write tests (pref: impl)
   These are independent → fan-out.

2. Create Worker A:
   paseo_create_agent
     title: "[Fan-out] Implement /api/foo endpoint"
     provider: <impl provider from preferences>
     initialPrompt: |
       ## Task
       Implement a new GET /api/foo endpoint in src/routes/foo.ts.
       ## Context
       Part of the orchestrated workflow. Worker B is writing tests.
       ## Acceptance
       - Endpoint returns JSON with { status, data }
       - Follows existing route patterns in src/routes/
       - TypeScript strict, no anys
       - Run the linter before reporting done.

3. Create Worker B:
   paseo_create_agent
     title: "[Fan-out] Write tests for /api/foo"
     provider: <impl provider from preferences>
     initialPrompt: |
       ## Task
       Write tests for the new GET /api/foo endpoint (Worker A is building it).
       ## Context
       Tests go in src/routes/__tests__/foo.test.ts.
       Follow patterns in existing route tests.
       ## Acceptance
       - Cover success, error, and edge cases
       - Tests pass (npm test)
       - Expect endpoint at GET /api/foo returns { status, data }

4. Both finish → collect output via paseo_get_agent_activity.

5. Decision gate:
   paseo_create_agent
     title: "[Gate] Review implementation before merge"
     provider: <audit provider from preferences — must differ from worker>
     initialPrompt: |
       You are a decision gate. Review the implementation and test outputs
       below. Determine PROCEED or BLOCK.
       ## Worker A output: [paste output]
       ## Worker B output: [paste output]
       ## Criteria: all tests pass, endpoint follows conventions,
       TypeScript strict, no anys.
       Return PROCEED or BLOCK with reasons. DO NOT edit files.

6. If PROCEED → report synthesis to user. If BLOCK → escalate with reasons.
```

## When NOT to use orchestration

- **Single task delegation** → use `paseo-handoff`.
- **Simple retry loops** → use `paseo-loop`.
- **Second opinion on one thing** → use `paseo-advisor`.
- **Root cause analysis** → use `paseo-committee`.
- **Native subagents** → if the task fits within one provider's native
  subagent system, use that. Paseo orchestration is for cross-provider work.

## Provider selection

Always read `~/.paseo/orchestration-preferences.json` before choosing.
The file maps role categories to provider strings. If missing, use defaults
and tell the user once. Role mapping:

| Role | Pref key | Use for |
|------|----------|---------|
| Implementation | `impl` | Writing code, fixing bugs |
| UI/Styling | `ui` | Visual design, CSS, UX copy |
| Research | `research` | Investigation, search, reading |
| Planning | `planning` | Architecture, decomposition |
| Audit/Review | `audit` | Code review, decision gates |

For decision gates and reviews, use a different provider from the worker —
cross-provider review catches blind spots. When reading the preferences file,
also check the `preferences` array — weave those notes into every agent's
initialPrompt as contextual guidance.

## Safety constraints

### Workspace isolation
- When two or more workers will write to overlapping files, create separate
  workspaces via `paseo_create_workspace` with `isolation: "worktree"`.
- Archive workspaces with `paseo_archive_workspace` when done.

### Destructive lifecycle operations
- `paseo_kill_agent` permanently terminates an agent. Only use it on agents
  you created. Never kill agents the user started independently.
- `paseo_cancel_agent` interrupts a running agent but keeps it alive. Use
  this for actions you want the agent to reconsider, not as punishment.
- `paseo_archive_agent` soft-deletes. Prefer this over kill for cleanup.

### Bounded execution
- Every coordinator loop (Pattern 5) must have `maxRuns` and `expiresIn`.
- Every heartbeat must include `maxRuns` or `expiresIn`. Unbounded recurring
  prompts are runaways waiting to happen.
- For schedules (`paseo_create_schedule`), always set `maxRuns`.

### Escalation vs retry
- **Transient failures** (network timeout, test flake, race condition): one
  bounded retry with a different approach.
- **Hard failures** (permission error, missing dependency, ambiguous
  requirements, destructive action): escalate to the user (Pattern 7).
  Do NOT silently retry, reroute, or guess.
