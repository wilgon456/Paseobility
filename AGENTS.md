# Paseobility Agent Install Guide

Use this file when a user gives you this repository URL and asks you to install
or set up Paseobility for their local Paseo environment.

This repository is designed for an AI-agent install flow: the user gives Codex,
Claude, or a Paseo agent the GitHub URL, and the agent reads this file before
copying the bundled skills into the local skill directory.

Paseobility is a skill document package. Installation means copying every
directory under `skills/` into the user's local skills directory. It does not
require a package build.

## Supported install target

Install for the Paseo/Codex-style skill path:

- macOS/Linux: `~/.agents/skills`
- Windows: `%USERPROFILE%\.agents\skills`

Optional Claude Code install target:

- macOS/Linux: `~/.claude/skills`
- Windows: `%USERPROFILE%\.claude\skills`

## Agent workflow

1. Clone or check out the repository or PR branch the user provided.
2. Confirm the local checkout root.
3. Confirm the repository contains `skills/*/SKILL.md`.
4. Detect the user OS.
5. Before overwriting an existing same-name skill directory, record a backup
   path or ask the user whether to replace it.
6. Prefer a temporary-home install test first when the user asks for validation.
7. Create the target skills directory if it does not exist.
8. Copy `skills/*` into the target skills directory.
9. If the user also wants Claude Code support, copy the same `skills/*` into
   the Claude skills directory.
10. If Paseo CLI is available, start a fresh read-only test agent to verify that
    `/paseo-session-brief` is recognized, then archive the test agent.
11. Tell the user to start a new agent session or reload integrations if the
   skills do not appear immediately.

## macOS/Linux commands

```bash
mkdir -p "$HOME/.agents/skills"
cp -R skills/* "$HOME/.agents/skills/"
```

Optional Claude Code:

```bash
mkdir -p "$HOME/.claude/skills"
cp -R skills/* "$HOME/.claude/skills/"
```

Convenience installer:

```bash
./scripts/paseobility-init.sh --no-context
./scripts/paseobility-init.sh --with-claude --no-context
```

## Windows PowerShell commands

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.agents\skills" | Out-Null
Copy-Item -Recurse -Force ".\skills\*" "$env:USERPROFILE\.agents\skills\"
```

Optional Claude Code:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills" | Out-Null
Copy-Item -Recurse -Force ".\skills\*" "$env:USERPROFILE\.claude\skills\"
```

Convenience installer:

```powershell
.\scripts\paseobility-install.ps1
.\scripts\paseobility-install.ps1 -WithClaude

# Temp-home install test:
.\scripts\paseobility-install.ps1 -TargetHome $tmp.FullName
```

## Paseo CLI detection

Paseo CLI is useful for diagnosis but not required for copying skills.

Check common locations:

- PATH: `paseo`
- macOS app bundle: `/Applications/Paseo.app/Contents/Resources/bin/paseo`
- Windows app bundle: `C:\Program Files\Paseo\resources\bin\paseo.cmd`

Do not restart the Paseo daemon unless the user explicitly asks. It can kill
running agents.

## Project bootstrap

For a target project, use `/paseo-project-bootstrap` after installation, or run
the bash context helper in Unix-like environments:

```bash
./scripts/paseobility-context.sh --root /path/to/project
```

On Windows native PowerShell, do not claim full context-script support. Instead,
read the same sources directly:

- `README*`
- `docs/**/*.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/**`
- `.github/copilot-instructions.md`
- `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Makefile`

Then summarize install/dev/build/test commands for the user.
