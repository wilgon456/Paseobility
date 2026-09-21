---
name: paseo-project
description: >-
  Summarize a repository or prepare its Paseo environment when the user asks
  for a project brief, handoff summary, initial setup, environment repair, or
  .paseobility context generation. Ordinary coding and session resumption do
  not trigger this skill.
---

# Paseo Project

This combines `/paseo-session-brief` and `/paseo-project-bootstrap`. Select the
mode from the requested outcome; do not run both sequentially by default.

- A readable overview, commands, or handoff: [brief mode](references/brief.md).
  This mode is read-only and creates no context files.
- Initial setup, environment repair, skill installation, or generated context:
  [setup mode](references/setup.md). Run only the requested operations.

## Shared context

Confirm the project root and current git state. Reuse the conversation's
verified context or existing `.paseobility/` files, checking freshness before
relying on them. Read only missing or changed material relevant to the request:
README, applicable agent instructions, overview/setup docs, and command manifests.
Do not repeat a repository survey just because a new session began.

Only inspect Paseo runtime when the request concerns its setup or operation.
Use `paseo --version` and `paseo daemon status --json` for the selected host;
`paseo project ls --json` and `paseo workspace ls --json` identify live records.
Do not infer workspace identity solely from `pwd`: aliases/symlinks may differ
from registered paths. If `paseo script ls --cwd <path> --json` reports
`WORKSPACE_NOT_FOUND`, resolve the existing workspace and use
`paseo script ls --workspace <id> --json`. Do not create a duplicate record.
An empty script list is valid; never invent script names.

Prefer the current project. New workspaces, external clones, dependency installs,
servers, and generated files require a reason within the user's requested scope.
Never restart the daemon as part of a brief or skill install. Preserve unrelated
changes, running work, and private state. Report secrets only by redacted metadata.

Return a concise result fitted to the selected mode, with actual evidence and
limitations. A generated context file is not proof that an app works.
