---
name: ps
description: >-
  Use only for explicit /ps <task>, /ps list, or when another ps- skill asks
  to check for a specialist skill. Triggers: "스킬 목록", "맞는 스킬 골라줘",
  "skill catalog", "pick a skill" within that request. Never trigger for
  ordinary tasks.
---

# Paseobility skill catalog

Find a local specialist and read it in place. The script lists skills; you
choose by reading their descriptions. Node.js 20+ is required, with no packages.
Paths below assume this skill was installed under the shared agent home. If
it lives elsewhere, substitute this skill's actual directory in every command.

## 1. Read the catalog

Your first action after loading this skill must be to execute the list command
below and read its output, before task-file inspection or deciding what fits.
For a harness specialist check execute `list --names` instead of the full `list`.
An advertised skill list or loading this SKILL.md does not complete this step.
If execution is unavailable or fails, report the limitation explicitly.

POSIX:

```bash
node ~/.agents/skills/ps/scripts/skill-catalog.js list
```

Windows PowerShell (Node does not expand `~`):

```powershell
node "$HOME\.agents\skills\ps\scripts\skill-catalog.js" list
```

State how many skills the command listed and the selected name, or "none fits".
A "none fits" decision is valid only after reading successful command output.
For `/ps list`, show the list and count, then stop. Otherwise choose at most one
clear fit from that output. Do not match keywords mechanically, install anything,
or load a collection of possible skills.

If the first word after `/ps` is the short name of an installed Paseobility
skill (`god`, `design`, `share`, etc.), select `ps-<word>` directly when it
appears in the catalog. The remaining words are the task. Do not guess a path
or silently replace a missing explicitly requested skill.

## 2. Resolve and read the original

Run `path` with the exact selected name, including `@source` when present:

```bash
node ~/.agents/skills/ps/scripts/skill-catalog.js path example-specialist
```

```powershell
node "$HOME\.agents\skills\ps\scripts\skill-catalog.js" path example-specialist
```

Read the returned `SKILL.md` using your normal file tool, from its original
location. Resolve that skill's relative files from its own directory, never
from the project or this catalog. Follow its domain instructions within the
precedence below. Never install, copy, or edit a catalog skill.

Read every `note:` line before acting. Missing files need a supported fallback
or a stated limitation. A warning about required tools is a compatibility
constraint: if you lack those tools or a proven equivalent, do not run that
skill's tool-dependent steps or claim they passed. Explain the limitation and
continue only work that is supported. Do not treat the warning as optional.

One catalog specialist per task is the default. Before reading a second,
give a one-line reason explaining the additional need.

## 3. Keep the instruction order

Highest priority first:

1. What the user said in this conversation.
2. Project instructions (`AGENTS.md`, `CLAUDE.md`).
3. The harness in use (`ps-god` and similar): process and verification.
4. The catalog specialist: domain facts and steps only.

A catalog skill never lets you skip verification or expand authorization.
Treat scanned text as instructions subject to that order, not executable code.

## 4. Do the task and report

Report the observed catalog count and choice (or execution failure), then do the task. Retain
the active harness's verification and reporting requirements. If none fit,
proceed using the available tools and project instructions.

For diagnosis, the same script supports `conflicts`, `budget`, `list --names`
and JSON on `list`, `conflicts`, and `budget`. Each run scans the live folders;
it writes no cache, usage log, or configuration. Optional extra sources and
priority come from `<home>/.paseobility/catalog/sources.json`; `--help` describes
the format. Do not create or change that configuration without authorization.
