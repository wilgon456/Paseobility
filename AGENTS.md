# Paseobility Agent Install Guide

Use this file when a user gives you this repository URL and asks you to install
or set up Paseobility for their local Paseo environment.

This repository is designed for an AI-agent install flow: the user gives Codex,
Claude, or a Paseo agent the GitHub URL, and the agent reads this file before
copying the bundled skills into the local skill directory.

## Paseo Share fast path

If the user gives this repository URL and asks to install `paseo-share`, share
files between Paseo computers, or enable mobile artifact viewing, proceed with
the single-skill installation without asking them to choose among the bundled
skills.

Do not confuse the two repositories involved:

- This Paseobility repository is the **skill source** used for installation.
- The user's separate private repository is the **artifact repository** used
  later by `paseo-share`.

Installing the skill does not create the artifact repository. On the first
actual share request, run `status`; when unconfigured, use `onboard`. If GitHub
CLI is missing or unauthenticated, ask the user to install `gh` or run
`gh auth login --hostname github.com`. After authentication, onboarding must
target the authenticated account’s private `<login>/paseo_share` repository,
creating it when absent or reusing it only when empty or already recognized as
a Paseo Share repository. Refuse public, unrelated, or incompletely inspected
same-name repositories. Use explicit `setup <repo-url>` for Forgejo or a custom
remote.

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
/paseo-share 이 파일을 공유해줘.
GitHub 연결이 필요하면 먼저 알려주고, 연결되어 있으면 내 계정의
private paseo_share 저장소를 안전하게 준비해서 사용해줘.
```

Paseobility is a skill document package. Installation means copying every
directory under `skills/` into the user's local skills directory. It does not
require a package build.

## Consolidated skill migration

The package contains seven skills. `paseo-agent-tournament` is comparison mode
in `paseo-orchestration`; `paseo-session-brief` and `paseo-project-bootstrap`
are brief/setup modes in `paseo-project`. `paseo-cua` drives native desktop
apps through the separately installed trycua Cua Driver and is explicit-only;
ordinary web page work stays with `paseo-browser`. No duplicate alias skills
are installed.

For an authorized update, use `--migrate-skills` (PowerShell: `-MigrateSkills`)
to move selected predecessors to backup after installing replacements. This
also handles old `paseo-computer-use` -> `paseo-browser` and retired
`paseo-skill-save` on full migration. Without the flag, old directories remain.
Never delete private skill-library/runtime data. Report the backup path.

## Cua Driver runtime

Selecting `paseo-cua`, or installing the full package, also ensures the trycua
Cua Driver runtime through `scripts/paseobility-cua-driver.sh` (Windows:
`scripts/paseobility-cua-driver.ps1`). A driver counts as present only when
`cua-driver --version` succeeds; an existing working driver is reused and never
auto-upgraded. A candidate that exists but fails `--version` is reported as
broken and left untouched (non-zero exit), never overwritten. Selecting only
other skills has no driver side effects.

- The helper fetches the pinned installer scripts (commit
  `9bbfa7dd3e27ca7f1861ede70aaca390174493f9`, Cua Driver `0.28.2`) and runs
  them from a temp directory. It never edits PATH or registers MCP config, and
  it never starts the daemon: the pinned `install.sh` / `_install-rust.sh` only
  resolve/download a release and stop stale daemons
  (https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/scripts/).
- `--skip-cua-driver` / `-SkipCuaDriver` installs skills only
  (docs-only/offline).
- A custom `--target-home` / `-TargetHome` skips the real-host runtime by
  default and logs why. `--allow-host-runtime` / `-AllowHostRuntime` allows real
  host runtime installation even when the skills `--target-home` is custom; the
  driver still installs at its normal host location (macOS writes
  `/Applications/CuaDriver.app` and `~/.cua-driver`), so it is not a sandbox.
  Do not repurpose `HOME` for tests.
- A runtime failure exits non-zero and states that skills were copied but the
  runtime setup failed (installation may be incomplete). Re-run or pass the skip
  flag.
- macOS Accessibility and Screen Recording grants stay manual. Binary presence
  is not permission readiness.
- A raw `cp -R` / `Copy-Item` copies documents only and cannot install the
  driver; use the installers for the runtime.

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
    `/paseo-project` is recognized, then archive the test agent.
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
The current local compatibility baseline is Paseo 0.9.0-beta.2; see
`docs/compatibility-0.9.0-beta.2.md` for verified layers and limitations. When a CLI is found, run
`paseo --version` and report the detected version; do not downgrade, update, or
restart Paseo as part of skill installation. A future version is not by itself
an install failure, but behavior-sensitive validation should use the tool names
and schemas documented in the installed base `paseo` skill.

Check common locations:

- PATH: `paseo`
- macOS app bundle: `/Applications/Paseo.app/Contents/Resources/bin/paseo`
- Windows app bundle: `C:\Program Files\Paseo\resources\bin\paseo.cmd`
- Windows per-user app bundle:
  `%LOCALAPPDATA%\Programs\Paseo\resources\bin\paseo.cmd`

Do not restart the Paseo daemon unless the user explicitly asks. It can kill
running agents.

## Project bootstrap

For a target project, use `/paseo-project` after installation, or run
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
