---
name: paseo-project
description: >-
  Summarize a repository or prepare its development environment when the user
  asks for a project brief, what a repo is or how to run it, initial repository
  setup, repository environment repair, or .paseobility context generation.
  Handing work to another Paseo agent belongs to paseo-handoff, and Paseo
  product setup or troubleshooting belongs to paseo-help. Ordinary coding and
  session resumption do not trigger this skill.
---

# Paseo Project

This combines `/paseo-session-brief` and `/paseo-project-bootstrap`. Pick the
mode from the requested outcome.

- A readable overview, commands, or a written handoff brief:
  [brief mode](references/brief.md).
- Initial repository setup, environment repair, skill installation, or
  generated context: [setup mode](references/setup.md).

## Shared context

Confirm the project root and git state. Reuse the conversation's verified
context and existing `.paseobility/` files after a freshness check (compare
their date with recent commits and changed manifests). Read only missing or
changed material: README, applicable agent instructions, overview/setup docs,
command manifests. Do not resurvey a repository just because a session began.

Keep `.paseobility/` context current: when it is missing or stale and you have
just learned the project, write or refresh it so the next session can reuse it
instead of resurveying. It is local state; if the repository does not already
ignore `.paseobility/`, add it to the local exclude file resolved by
`git rev-parse --git-path info/exclude` rather than `.gitignore`; `.git` can be
a file in a worktree.
Generated context is a snapshot and never overrides current `AGENTS.md`
instructions, including nested ones for selected modules.

A Git root, monorepo package and registered Paseo workspace can differ; record
which one each command targets.

Inspect Paseo runtime only when the request concerns it: `paseo --version`,
`paseo daemon status --json`, `paseo project ls --json`,
`paseo workspace ls --json` (0.12+ hides background workspaces unless
`--background` is added; 0.11 rejects that flag). Do not infer workspace identity from `pwd` alone;
aliases/symlinks may differ. If `paseo script ls --cwd <path> --json` reports
`WORKSPACE_NOT_FOUND`, resolve the existing workspace and use
`--workspace <id>`; do not create a duplicate record. An empty script list is
valid; never invent script names.

Never restart the Paseo daemon (other agents depend on it). Preserve unrelated
changes, running work and private state. Report secrets only as redacted
metadata.

Return a concise result with actual evidence and limitations. A context file is
not proof that the app works.
