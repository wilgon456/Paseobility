---
name: paseo-orchestration
description: >-
  Coordinate multiple Paseo agents or compare competing answers only when the
  user explicitly requests parallel agents, cross-provider work, a tournament,
  or a debate. Ordinary coding, planning, review, and single-agent delegation
  do not trigger this skill.
---

# Paseo Orchestration

## Choose one mode

- Distinct deliverables, dependencies, or requested monitoring: use
  [coordination patterns](references/coordination.md), reading only the needed pattern.
- Competing answers, plans, or implementations: use
  [comparison mode](references/tournament.md). This replaces `/paseo-agent-tournament`.

Do not load both references by default. Use the smallest set of agents with
useful distinct roles. The coordinator normally synthesizes results itself;
a separate synthesis/gate agent needs a requested role or substantive
independent judgment. Tournaments use the separate judge defined in that mode.
Reuse current discovery and verified task context within a run.

## Launch contract

Read the installed base **paseo** skill for the active tool schemas. The local
compatibility baseline is Paseo 0.9.0-beta.2; discover capabilities instead of
assuming a model, provider, setting, or tool from the version alone.

1. Read `list_profiles` and profile notes. Follow a user-named profile or choose
   one fitting the requested role.
2. Materialize profile fields into `create_agent`: `provider/model` -> `provider`,
   `modeId` -> `settings.modeId`, `thinkingOptionId` -> `settings.thinkingOptionId`,
   `featureValues` -> `settings.features`. There is no `profile` argument.
3. If a profile lacks a model, use `list_models` for that provider. If no profile
   fits, use `list_providers`, then `inspect_provider`; call `list_models` only
   when exact model/thinking IDs are needed. Report the fallback once.
4. Only set features actually advertised by `inspect_provider`. Legacy
   `~/.paseo/orchestration-preferences.json` is additional guidance, not proof of
   available providers or settings.
5. Give each agent its task, relevant evidence/paths, constraints, acceptance
   criteria, and expected output. Agents do not inherit all task context.

## Runtime and safety

- Agent-scoped `create_agent` creates a child in the caller's workspace unless
  `workspaceId` selects another. Placement does not change parentage.
- Read-only workers may share a workspace. Writers whose changes overlap need
  isolated worktrees. Never let multiple writers edit the same checkout.
- Prefer asynchronous creation and completion notifications. Do not poll merely
  for progress or add a heartbeat just because workers are running.
- For recurring monitoring, bound `create_heartbeat` with `maxRuns` or
  `expiresIn`, preferably both; delete it on completion. MCP has no heartbeat
  update: delete/recreate it. Schedules, which start fresh agents, have separate
  update/pause/resume/log/run-once tools.
- Verify reported work against acceptance criteria. Retry transient failures at
  most once with a changed approach; report unresolved blockers.
- `cancel_agent` interrupts a run; `archive_agent` soft-deletes; `kill_agent` is
  permanent. Never terminate unrelated agents. Archive only workflow-owned
  resources when cleanup is authorized.
- `archive_workspace` also archives its agents and terminals and may remove an
  owned worktree after its last active reference. Verify the exact target.
- This skill does not authorize pushes, merges, deployments, permission approval,
  or other external writes beyond the user's request.

Report the actual profiles/providers, deliverables, verification, synthesis or
comparison result, and any workflow resources intentionally left active.
