---
name: paseo-agent-tournament
description: >-
  Run a structured multi-agent tournament across multiple LLM providers or
  models. Use when the user wants GPT, Claude, DeepSeek, Grok, or other agents
  to independently solve, review, debate, design, debug, or critique the same
  task, then have a judge compare outputs and choose or merge the result.
---

# Paseo Agent Tournament

Run multiple independent contestants and a separate judge through Paseo's
current orchestration tools. Read the base **paseo** skill first.

## Paseo 0.6 provider selection

1. Call `list_profiles` and read every profile's `notes` before choosing
   contestants or judge.
2. Use user-named profiles when provided. Otherwise choose profiles whose notes
   fit the tournament roles.
3. Materialize each profile into `create_agent`; there is no `profile` field:
   - `provider/model` becomes `provider`
   - `modeId`, `thinkingOptionId`, and `featureValues` become `settings`
4. If profiles do not cover the requested providers, call `list_providers`,
   `inspect_provider`, and only then `list_models` when exact model or thinking
   IDs are needed. Never guess IDs.
5. Treat `~/.paseo/orchestration-preferences.json`, when present, as additional
   guidance only. Validate any provider string through current discovery.

## Core pattern

```text
define task and scoring criteria
-> create independent contestants
-> collect outputs
-> create judge with all outputs
-> return winner, merged result, disagreements, and risks
```

Use tournaments when disagreement is valuable: architecture, root-cause
analysis, competing plans or implementations, security review, naming, copy,
or deliberate pro/con debate. Avoid them for straightforward edits, urgent
low-cost work, destructive operations, payments, or production changes.

## Modes

### Debate

Give each contestant a fixed stance and the same evidence. Keep contestants
analysis-only unless edits were explicitly requested. The judge compares
arguments instead of merely counting agreement.

### Competing plans

Create two to four contestants. Require plan, tradeoffs, risks, acceptance
criteria, and verification. Judge correctness, feasibility, blast radius,
maintainability, and testability.

### Competing implementations

Create an isolated worktree workspace for every contestant with
`create_workspace { isolation: "worktree", mode: "branch-off", ... }`. Pass
each returned `workspaceId` to its `create_agent` call. Never let contestants
edit the same checkout. Require relevant tests and a concise diff summary.

The coordinator or judge compares implementations; it does not automatically
apply, merge, push, or deploy the winner without user authorization.

## Launch and collection

- Prefer asynchronous `create_agent`; agent-scoped calls notify on completion
  by default. Do not poll status just to watch progress.
- Every contestant starts with zero task context. Include the same task,
  repository/path, relevant evidence, constraints, scoring criteria, and output
  schema in every prompt.
- Use `get_agent_activity` to collect final evidence when the completion result
  alone is insufficient.
- Prefer a judge profile/provider different from the strongest contestant when
  that gives a genuinely independent review. Follow a user-named judge.

## Contestant prompt

```text
## Task
<identical task>

## Role
You are contestant <N>. Your stance or strategy is <role>.

## Context
- repository/path/URL
- relevant files and evidence
- user goal and constraints

## Scoring
- correctness
- evidence
- practicality
- implementation risk
- maintainability
- user fit

## Output
- core answer or implementation summary
- reasoning summary
- evidence and verification
- risks
- recommendation

Do not edit unless explicitly instructed. Do not push, merge, deploy, create
unrelated workspaces, or perform external writes. Report blockers directly.
```

## Judge prompt

```text
You are the tournament judge. Compare every contestant against the stated
criteria. Do not edit files.

Return:
1. Winner and runner-up
2. Best merged answer or plan
3. Score/evidence for each contestant
4. What each got right and missed
5. Key disagreement
6. Risks and recommended next action
```

## Safety and cleanup

- Archive only tournament agents or workspaces created for this run, and only
  when cleanup is requested or agreed as part of the workflow.
- Never kill agents the user started independently.
- `archive_workspace` also archives owned agents and terminals and may remove a
  managed worktree after its final active reference; verify the exact target.
- Do not push, open PRs, merge, deploy, or execute the winning approach unless
  the user authorized that action.
- Escalate missing requirements or materially incomparable outputs instead of
  manufacturing a winner.

## Final response

Report the actual profiles/providers/models used, judge used, winner and
runner-up, merged result, decisive disagreement, verification evidence, and any
agents or workspaces intentionally left active.
