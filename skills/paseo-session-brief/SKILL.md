---
name: paseo-session-brief
description: >-
  Create a concise working brief for the current project/session before coding.
  Use when starting or resuming work in a repo, when the user asks for project
  context, when handing off to another agent, or when the agent needs to read
  README/docs/AGENTS/CLAUDE/Cursor/Copilot instructions and summarize commands,
  risks, and next steps. Triggers include "session brief", "project brief",
  "understand this repo", "new session", "handoff brief", "summarize context",
  and "where should I start".
---

# Paseo Session Brief

This skill produces a short, actionable context brief for the current repo. It
is meant for the start of a work session, not for deep implementation.

Use `/paseo-project-bootstrap` when the user wants setup scripts or generated
`.paseobility/` files. Use this skill when the user wants a readable brief in
the conversation.

## Goals

- identify the active project and git state
- read the most important docs and agent instructions
- identify likely install/dev/build/test commands
- summarize project shape and risk areas
- give the next agent or human a clean starting point

## Core workflow

1. Confirm root and status:
   ```bash
   pwd
   git rev-parse --show-toplevel
   git remote -v
   git branch --show-current
   git status --short
   ```
2. List files with `rg --files` first.
3. Read available instruction sources:
   - `README*`
   - `AGENTS.md`
   - `CLAUDE.md`
   - `.cursor/rules/**`
   - `.github/copilot-instructions.md`
   - important files under `docs/`
4. Detect project commands from:
   - `package.json`
   - `pyproject.toml`, `requirements*.txt`
   - `Cargo.toml`
   - `go.mod`
   - `Makefile`, `justfile`, `Taskfile.yml`
   - `paseo.json`
5. Produce the brief. Do not edit files unless the user asks.

## Reading strategy

Keep the brief lightweight:

- Read README and explicit instruction files first.
- For `docs/`, list files and read only obviously relevant overview, setup,
  architecture, contributing, or decision documents.
- Do not read every source file unless the repo is tiny or the user asks.
- Prefer command discovery over guessing.
- If generated `.paseobility/context.md` exists, read it and verify it against
  current git state.

## Output format

Return this structure:

```text
Project
- name, root, remote, branch
- one-paragraph purpose

Current State
- git status summary
- notable uncommitted changes

Instructions
- key rules from README/AGENTS/CLAUDE/Cursor/Copilot/docs

Commands
- install
- dev
- build
- test
- lint/typecheck

Project Map
- important directories/files

Risks
- likely footguns, generated files, external services, migrations, auth, etc.

Suggested First Moves
- 3-5 concrete next steps
```

## Handoff mode

When the user asks for a handoff brief, add:

```text
Handoff Prompt
- concise prompt another agent can use
- include root path, current goal, constraints, files to inspect, commands to run
```

The handoff prompt must be self-contained.

## Workspace hygiene

- Prefer working inside the current project root.
- Do not create sibling projects, external clones, or new workspaces unless the
  user asks or the task clearly requires it.
- If work happens outside the current project, report the exact path and
  reason.

## Safety

- Do not modify files unless the user explicitly asks.
- Do not install dependencies or run long-running dev servers for a brief.
- Do not run destructive commands.
- If a repo has private or secret-looking files, do not print secrets. Mention
  that sensitive-looking files exist without exposing values.

## Good brief qualities

- short enough to scan
- specific enough to act on
- grounded in files and commands actually found
- clear about uncertainty
- avoids pretending generated or stale context is current
