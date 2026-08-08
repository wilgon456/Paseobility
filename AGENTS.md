# Paseobility Agent Install Guide

Use this file when a user gives you this repository and asks you to install or
set up Paseobility for their local Paseo environment.

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

1. Confirm the local checkout root.
2. Confirm the repository contains `skills/*/SKILL.md`.
3. Detect the user OS.
4. Before overwriting an existing same-name skill directory, record a backup
   path or ask the user whether to replace it.
5. Create the target skills directory if it does not exist.
6. Copy `skills/*` into the target skills directory.
7. If the user also wants Claude Code support, copy the same `skills/*` into
   the Claude skills directory.
8. Tell the user to start a new agent session or reload integrations if the
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
