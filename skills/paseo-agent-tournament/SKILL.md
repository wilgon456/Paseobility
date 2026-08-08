---
name: paseo-agent-tournament
description: >-
  Run a structured multi-agent tournament across multiple LLM providers or
  models. Use when the user wants GPT/Claude/DeepSeek/Grok/etc. to independently
  solve, review, debate, design, debug, or critique the same task, then have a
  judge compare outputs and pick a winner or merged plan. Triggers include
  "tournament", "compare agents", "GPT vs Claude", "DeepSeek vs Grok",
  "multiple models", "best answer", "debate", "judge", and "pick the winner".
---

# Paseo Agent Tournament

This skill turns Paseo orchestration into a repeatable tournament pattern:
multiple agents independently produce answers, then a judge agent compares the
results and returns a final decision.

Use this when disagreement is useful. Do not use it for simple tasks that one
agent can answer directly.

## Prerequisites

Read the **paseo** skill first. Before choosing providers, read
`~/.paseo/orchestration-preferences.json` if it exists. Use the configured
providers when the user does not name exact models.

If the user explicitly names providers or models, call `paseo_list_providers`
and `paseo_list_models` first. Do not guess provider strings.

## Core pattern

```
Define task and scoring criteria
-> create contestants in parallel
-> collect contestant outputs
-> create judge with all outputs
-> return winner, runner-up, merged plan, and risks
```

## When to use

- architecture decisions
- bug root-cause analysis
- competing implementation strategies
- naming, README, copy, or UX direction comparison
- security/risk review from multiple perspectives
- deliberate pro/con debate
- choosing between multiple model outputs

## When not to use

- straightforward edits or one-off questions
- tasks where latency/cost matters more than disagreement
- destructive actions, account changes, payments, or production operations
- PR creation/push workflows; use a GitHub publish workflow instead

## Tournament modes

### Mode 1: Debate

Use when the user assigns roles such as "GPT argues for, DeepSeek argues
against, Grok summarizes."

```
1. Create one agent per role.
2. Give each role a self-contained briefing and a fixed stance.
3. Do not let role agents edit files unless the user explicitly asks.
4. Collect the outputs.
5. Send the outputs to a judge/synthesis agent.
```

### Mode 2: Competing Plans

Use when the user wants multiple ways to solve the same problem.

```
1. Create 2-4 contestant agents.
2. Each returns a plan with tradeoffs, risks, and acceptance criteria.
3. Judge compares feasibility, blast radius, maintainability, and testability.
4. Return the best plan or a merged plan.
```

### Mode 3: Competing Implementations

Use only when edits are useful and safe.

```
1. Create an isolated worktree workspace for each contestant if files will be edited.
2. Give each contestant the same task and acceptance criteria.
3. Each contestant runs relevant checks before reporting.
4. Judge compares diffs, tests, complexity, and risk.
5. Coordinator applies or asks before applying the selected approach.
```

Never let multiple contestants edit the same checkout in parallel.

## Provider selection

If the user names exact agents, use those names after resolving provider/model
strings through `paseo_list_providers` and `paseo_list_models`.

Common mapping examples:

| User wording | Resolve through |
| --- | --- |
| GPT | `codex` models |
| Claude | `claude` models |
| DeepSeek via OpenCode | `opencode` DeepSeek models |
| Grok | `grok` models |

For the judge:

- Prefer a provider different from the strongest contestant.
- If the user names the judge, follow the user.
- If no judge is named, use the audit/planning preference when available.

## Contestant prompt template

Every contestant starts with zero context. Include:

```text
## Task
<same task for every contestant>

## Role
You are contestant <N>. Your assigned stance or strategy is <role>.

## Context
- Repository/path/URL
- Relevant files or documents
- User goal
- Constraints

## Output
Return:
- Core answer
- Reasoning summary
- Risks
- Verification or evidence
- Recommendation

## Constraints
- Do not edit files unless explicitly instructed.
- Do not create external projects or unrelated workspaces.
- If you are blocked, report the blocker directly.
```

## Judge prompt template

```text
You are the tournament judge.

Compare the contestant outputs below against these criteria:
- correctness
- usefulness
- evidence
- implementation risk
- maintainability
- user fit

Return:
1. Winner
2. Runner-up
3. Best merged answer or plan
4. What each contestant got right
5. What each contestant missed
6. Risks and next steps

Do not edit files.
```

## Scoring criteria

Define criteria before launching contestants. Default:

| Criterion | Meaning |
| --- | --- |
| Correctness | Does it answer the actual user request? |
| Evidence | Does it cite repo facts, files, logs, or commands? |
| Practicality | Can the user act on it now? |
| Risk | Does it avoid unsafe assumptions and overreach? |
| Maintainability | Is the solution easy to keep working? |
| Brevity | Is it clear without burying the answer? |

## Safety

- For analysis-only tournaments, stay in the current workspace.
- For editing tournaments, create isolated workspaces per contestant.
- Archive contestant agents when the tournament is complete if the user asks.
- Do not kill agents the user started independently.
- Do not push, open PRs, or perform external write actions from a tournament
  unless the user explicitly requested that workflow.
- Escalate if contestants disagree because of missing requirements, not just
  different preferences.

## Final response

The coordinator's final response should include:

- which agents/providers were actually used
- the judge used
- final winner or merged answer
- key disagreement
- recommended next action
