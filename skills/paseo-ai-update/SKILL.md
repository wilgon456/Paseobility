---
name: paseo-ai-update
description: >-
  Check and safely update AI/provider CLIs such as Codex, Claude Code, Grok
  Build, and Google Antigravity (agy). Use when the user asks to update AI
  CLIs, provider tools, Codex/Claude/Grok/agy versions, or wants an update
  helper. The default mode is read-only: detect installed tools, versions,
  install source, latest/check status when available, and propose conservative
  update commands. Only run updates after explicit user approval.
---

# Paseo AI Update

This skill is a conservative update helper for local AI coding CLIs. It does
not update models directly. It checks and optionally updates the command-line
tools that connect to those models.

Supported first-pass targets:

- `codex`
- `claude`
- `grok`
- `agy`

## Core rule

Default to read-only diagnosis. Never update anything until the user explicitly
approves the exact tools or confirms an all-tools update prompt.

## Goals

- detect installed AI CLIs
- report current versions
- infer install source when possible
- check latest version or update availability when a safe check exists
- propose conservative update commands
- ask whether to update all eligible tools
- update only approved tools
- re-check versions after update
- explain failures and give manual commands

## Do Not

- Do not run updates during the first diagnostic pass.
- Do not run `sudo`.
- Do not run `brew upgrade` without a package/cask name.
- Do not run `winget upgrade --all`.
- Do not run `npm update -g`.
- Do not uninstall/reinstall a tool unless the user explicitly asks.
- Do not log out, delete auth, rotate credentials, or reset config.
- Do not restart daemons or kill active agents.
- Do not claim an update succeeded without re-checking the version.

## Detection

### macOS/Linux

Run:

```bash
for c in codex claude grok agy; do
  command -v "$c" || true
done
```

Then version checks:

```bash
codex --version
claude --version
grok --version
agy --version
```

Use `2>&1` and tolerate missing commands or nonzero exits.

### Windows PowerShell

Run:

```powershell
Get-Command codex, claude, grok, agy -ErrorAction SilentlyContinue
codex --version
claude --version
grok --version
agy --version
```

Use `try`/`catch` or per-command error handling. Missing tools are not failures.

## Install Source Hints

Use these as evidence, not certainty.

### macOS/Linux

- Homebrew:
  ```bash
  brew list --cask --versions codex claude-code claude-code@latest 2>/dev/null
  brew list --versions 2>/dev/null | grep -E 'codex|claude|grok|agy'
  ```
- npm global:
  ```bash
  npm list -g --depth=0 2>/dev/null | grep -E '@openai/codex|@anthropic-ai/claude-code|@xai-official/grok'
  ```
- binary path:
  ```bash
  ls -l "$(command -v codex)" "$(command -v claude)" "$(command -v grok)" "$(command -v agy)" 2>/dev/null
  ```

### Windows

- WinGet:
  ```powershell
  winget list Codex
  winget list Anthropic.ClaudeCode
  winget list Grok
  winget list Antigravity
  ```
- npm global:
  ```powershell
  npm list -g --depth=0
  ```
- binary path:
  ```powershell
  Get-Command codex, claude, grok, agy -ErrorAction SilentlyContinue |
    Select-Object Name, Source
  ```

## Latest / Update Availability

Prefer safe, read-only checks:

```bash
grok update --check --json
npm view @anthropic-ai/claude-code version
npm view @openai/codex version
```

For `codex` and `agy`, if there is no read-only check in the local CLI help,
mark update availability as `unknown until approved update command runs`.

Before relying on a command, inspect help:

```bash
codex update --help
grok update --help
agy update --help
```

PowerShell equivalents should use the same commands.

## Conservative Update Commands

Choose the command that best matches the detected install source. If the source
is unclear, propose commands but do not run them without asking.

### Codex

Preferred:

```bash
codex update
```

If Homebrew cask install is clearly detected:

```bash
brew upgrade --cask codex
```

If npm global install is clearly detected:

```bash
npm install -g @openai/codex@latest
```

### Claude Code

If npm global install is detected:

```bash
npm install -g @anthropic-ai/claude-code@latest
```

If Homebrew cask install is detected:

```bash
brew upgrade --cask claude-code
```

or:

```bash
brew upgrade --cask claude-code@latest
```

If WinGet install is detected:

```powershell
winget upgrade Anthropic.ClaudeCode
```

Native Claude Code installs can auto-update. If the local install appears
native and no package manager source is detected, report that and ask before
running any installer command.

### Grok Build

Check first:

```bash
grok update --check --json
```

If update is available and the user approves:

```bash
grok update
```

### Antigravity CLI (`agy`)

`agy update` exists in current CLI builds, but a read-only check may not.
Confirm help first:

```bash
agy update --help
```

If the user approves:

```bash
agy update
```

## Approval Prompt

After diagnosis, produce a table and ask:

```text
업데이트 가능한 항목:
- <tool> <current> -> <latest/status>

실행 예정:
1. <command>
2. <command>

모두 일괄 업데이트할까요?
승인하면 위 명령만 실행하고, 실패하면 이유와 수동 명령을 정리하겠습니다.
```

Do not proceed unless the user approves clearly, for example:

- "응"
- "모두 업데이트"
- "codex랑 claude만"
- "apply"

If approval is ambiguous, ask again.

## Failure Handling

For each failed command, report:

- command
- exit code when available
- short failure reason
- likely cause
- safe manual command or next step

Common causes:

- permission error
- network blocked
- package manager missing
- install source unclear
- active binary cannot be replaced
- auth or subscription requirement

Do not retry destructive commands. Retry only simple network/package metadata
checks once if it is clearly transient.

## Final Output

Return:

```text
AI CLI Update Summary

Checked
- tool, path, current, latest/status, install source

Updated
- tool, old -> new, command

Skipped
- tool, reason

Failed
- tool, command, reason, manual next step

Notes
- active sessions were not killed
- no sudo/global package-manager all-upgrade was used
```
