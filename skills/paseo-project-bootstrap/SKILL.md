---
name: paseo-project-bootstrap
description: >-
  Bootstrap a Paseo project workspace on macOS or any local checkout. Use when
  the user wants to set up a project environment, understand a new repo before
  work starts, collect README/docs/AGENTS/CLAUDE/Cursor/Copilot instructions,
  generate working context, inspect build/test/dev commands, or diagnose Paseo
  skill/script setup issues. Triggers include "bootstrap project", "set up
  project", "project environment", "read docs first", "import Claude
  instructions", "paseo setup", "doctor", and "context".
---

# Paseo Project Bootstrap

This skill prepares a project before implementation work starts. It is not a
framework and does not add new Paseo MCP tools. It combines repository
inspection, instruction-file discovery, command detection, and lightweight
bootstrap scripts into a repeatable setup workflow.

## What this skill does

Use this skill to:

- identify the current project root and remote
- check macOS architecture and Paseo CLI availability
- install or update Paseobility skills
- collect project context from README, docs, and agent instruction files
- summarize install/dev/build/test commands
- create `.paseobility/` context artifacts for the current project

## Script reference

Run scripts from the Paseobility repository:

```bash
./scripts/paseobility-doctor.sh
./scripts/paseobility-context.sh
./scripts/paseobility-init.sh
```

| Script | Purpose |
| --- | --- |
| `paseobility-doctor.sh` | Diagnose OS, architecture, git root, Paseo CLI, skill paths, and setup warnings. |
| `paseobility-context.sh` | Generate `.paseobility/context.md`, `commands.md`, `project-map.md`, and `bootstrap-log.md`. |
| `paseobility-init.sh` | Install skills, run doctor, and generate project context in one command. |

## Core workflow

1. Confirm the working root:
   ```bash
   pwd
   git rev-parse --show-toplevel
   git remote -v
   git status --short
   ```
2. Run doctor:
   ```bash
   ./scripts/paseobility-doctor.sh
   ```
3. Generate project context:
   ```bash
   ./scripts/paseobility-context.sh
   ```
4. Read the generated context before doing substantive work:
   ```bash
   sed -n '1,220p' .paseobility/context.md
   sed -n '1,220p' .paseobility/commands.md
   sed -n '1,220p' .paseobility/project-map.md
   ```
5. If the user asked to install the skills, run:
   ```bash
   ./scripts/paseobility-init.sh --with-claude
   ```
   Omit `--with-claude` when only Paseo/Codex-style skill installation is
   wanted.

## Context sources

Prefer structured project files over guessing. Check these sources when they
exist:

| Source | Use |
| --- | --- |
| `README*` | User-facing project overview and setup. |
| `docs/**/*.md` | Design notes, architecture, guides, decisions. |
| `AGENTS.md` | Agent-specific project instructions. |
| `CLAUDE.md` | Claude Code instructions that can inform Paseo work. |
| `.cursor/rules/**` | Cursor rules and coding conventions. |
| `.github/copilot-instructions.md` | Copilot-oriented repository guidance. |
| `package.json` | npm scripts and package manager clues. |
| `pyproject.toml`, `requirements*.txt` | Python commands and dependencies. |
| `Cargo.toml`, `go.mod` | Rust/Go project shape and likely commands. |
| `Makefile`, `justfile`, `Taskfile.yml` | Project command entrypoints. |
| `paseo.json` | Existing Paseo workspace script definitions. |

## macOS setup policy

On macOS:

- detect architecture with `uname -m`
- report Intel (`x86_64`) separately from Apple Silicon (`arm64`)
- look for `paseo` on `PATH`, then the bundled app CLI at
  `/Applications/Paseo.app/Contents/Resources/bin/paseo`
- create skill directories when installing skills
- do not try to restart the Paseo daemon automatically

If `paseo.json` exists, report it. If it does not, suggest commands in
`.paseobility/commands.md` rather than silently inventing app registrations.

## Workspace hygiene

This skill should guide behavior, not block valid work.

- Prefer working inside the current project root.
- Do not create sibling projects, external clones, or new workspaces unless
  the user asks or the task clearly requires it.
- When handing off work to another agent, pass the current workspace whenever
  possible.
- If work happens outside the current project, report the exact path and
  reason.

## Output expectations

After bootstrapping, report:

- detected project root and remote
- macOS architecture and Paseo CLI status
- generated `.paseobility/` files
- likely install/dev/build/test commands
- important project instructions discovered from README, docs, AGENTS, CLAUDE,
  Cursor, or Copilot files
- warnings that need user attention, especially missing Paseo CLI or missing
  project command definitions

## When not to use

- Do not use this for normal feature implementation after the project is
  already understood.
- Do not use this as a replacement for `/paseo-orchestration` when the user
  specifically wants multi-agent coordination.
- Do not use this as a replacement for `/paseo-computer-use` when the task is
  direct browser interaction.
