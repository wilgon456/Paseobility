# Paseobility Agent Install Guide

Use this file when a user gives you this repository URL and asks you to install
or set up Paseobility for their local Paseo environment.

This repository is designed for an AI-agent install flow: the user gives Codex,
Claude, or a Paseo agent the GitHub URL, and the agent reads this file before
copying the bundled skills into the local skill directory.

## Paseo Skill Save fast path

When the user asks to install or test `/paseo-skill-save`, install both the
`paseo-skill-save` and `paseo-spyware-check` skill directories. On first use,
the save wrapper automatically fetches and commit/tree-verifies its pinned
public skillNload engine under the user's `.paseo` directory. Do not ask the
user to install or invoke skillNload separately. Paseobility does not bundle
the manager source or any user-saved third-party skills.

The save wrapper must run its bundled Python spyware gate before manager
bootstrap or registration. Do not bypass it by calling skillNload directly.
Never execute the target repository's code during inspection or registration.
High/Critical findings block registration. Medium findings require showing the
receipt and explicit user approval before `--approve-medium` may be used.
Default saves use the manager's private `paseo_skill_save` synchronization.
Use a temporary home and skillNload state directory for tests; pass
`--local-only`, mock GitHub onboarding, or use a local bare Git remote, and
never create or modify a real GitHub repository. A successful test must
prove that the exact scanned commit and checksum were registered,
checksum-verified, found by search, and selected by a natural-language match
while no permanent target-skill installation was made.
For an `instructions-only` fixture, require a `select` decision with no
confirmation and available bounded skill body evidence. Executable skills must
retain their confirmation gate.

## Paseo Share fast path

If the user gives this repository URL and asks to install `paseo-share`, share
files between Paseo computers, or enable mobile artifact viewing, proceed with
the single-skill installation without asking them to choose among the bundled
skills.

Do not confuse the two repositories involved:

- This Paseobility repository is the **skill source** used for installation.
- The user's separate private repository is the **artifact repository** used
  later by `paseo-share`.

Installing the skill does not require the artifact repository. If the user has
not supplied one, finish installation first and then tell them that initial
`/paseo-share` setup will ask for a dedicated private GitHub or Forgejo URL.

Use the convenience installer so an existing installation is backed up:

```bash
./scripts/paseobility-init.sh --skill paseo-share --no-context
```

On Windows PowerShell:

```powershell
.\scripts\paseobility-install.ps1 -Skill paseo-share
```

When running under Claude Code or when the user requests Claude support, also
install the same skill into the Claude directory:

```bash
./scripts/paseobility-init.sh --skill paseo-share --with-claude --no-context
```

```powershell
.\scripts\paseobility-install.ps1 -Skill paseo-share -WithClaude
```

After installation, verify the installed `SKILL.md` and
`scripts/paseo-share.js` exist. When Node.js is available, run the installed
`paseo-share.test.js`. Do not restart the Paseo daemon. Tell the user to open a
new agent session or reload integrations, and give this first-use prompt:

```text
/paseo-share 전용 private 저장소를 이 컴퓨터에 연결해줘.
저장소: <private artifact repository URL>
컴퓨터 이름: <friendly machine name>
```

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
5. Before overwriting an existing same-name skill directory, record the backup
   path. The convenience installers back up by default.
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
./scripts/paseobility-init.sh --skill paseo-agent-cleanup --no-context
./scripts/paseobility-init.sh --skill paseo-skill-save --skill paseo-spyware-check --no-context
```

Existing same-name skills are backed up to
`~/.agents/skills-backups/Paseobility-<version>-<timestamp>/` unless
`--no-backup` is passed.

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
.\scripts\paseobility-install.ps1 -Skill paseo-agent-cleanup
.\scripts\paseobility-install.ps1 -Skill paseo-share
.\scripts\paseobility-install.ps1 -Skill paseo-skill-save,paseo-spyware-check

# Temp-home install test:
.\scripts\paseobility-install.ps1 -TargetHome $tmp.FullName
```

Use `-Skill <name>` when the user asks to update or validate one bundled skill
without touching the other installed skills.

Existing same-name skills are backed up to
`%USERPROFILE%\.agents\skills-backups\Paseobility-<version>-<timestamp>\`
unless `-NoBackup` is passed.

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
