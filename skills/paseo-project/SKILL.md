---
name: paseo-project
description: >-
  Summarize a repository or prepare its Paseo environment when the user asks
  for a project brief, what a repo is or how to run it, a handoff summary,
  initial setup, environment repair, or .paseobility context generation.
  Ordinary coding and session resumption do not trigger this skill.
---

# Paseo Project

This combines `/paseo-session-brief` and `/paseo-project-bootstrap`. Pick the
mode from the requested outcome.

- A readable overview, commands, or handoff: [brief mode](references/brief.md).
- Initial setup, environment repair, skill installation, or generated context:
  [setup mode](references/setup.md).

## Shared context

Confirm the project root and git state. Reuse the conversation's verified
context and existing `.paseobility/` files after a freshness check (compare
their date with recent commits and changed manifests). Read only missing or
changed material: README, applicable agent instructions, overview/setup docs,
command manifests. Do not resurvey a repository just because a session began.

Keep `.paseobility/` context current: when it is missing or stale and you have
just learned the project, write or refresh it so the next session can reuse it
instead of resurveying. It is local state; if the repository does not already
ignore `.paseobility/`, add it to `.git/info/exclude` rather than `.gitignore`.
Generated context is a snapshot and never overrides current `AGENTS.md`
instructions, including nested ones for selected modules.

A Git root, monorepo package and registered Paseo workspace can differ; record
which one each command targets.

Inspect Paseo runtime only when the request concerns it: `paseo --version`,
`paseo daemon status --json`, `paseo project ls --json`,
`paseo workspace ls --json`. Do not infer workspace identity from `pwd` alone;
aliases/symlinks may differ. If `paseo script ls --cwd <path> --json` reports
`WORKSPACE_NOT_FOUND`, resolve the existing workspace and use
`--workspace <id>`; do not create a duplicate record. An empty script list is
valid; never invent script names.

Never restart the Paseo daemon (other agents depend on it). Preserve unrelated
changes, running work and private state. Report secrets only as redacted
metadata.

Return a concise result with actual evidence and limitations. A context file is
not proof that the app works.
