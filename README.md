<div align="center">

<h1>Paseobility</h1>

<p><strong>A Paseo slash-skill pack you install by handing the GitHub URL to Codex/Claude</strong></p>

<p>
  <a href="./README.ko.md">한국어</a> · <strong>English</strong>
</p>

<p>
  <img alt="Version" src="https://img.shields.io/badge/version-v2.8.1-111827?style=for-the-badge">
  <a href="https://paseo.sh"><img alt="Paseobility Skill Pack" src="https://img.shields.io/badge/Paseobility-Skill%20Pack-111827?style=for-the-badge"></a>
  <img alt="Browser Automation" src="https://img.shields.io/badge/Browser-Automation-2563eb?style=for-the-badge">
  <img alt="Multi Agent Orchestration" src="https://img.shields.io/badge/Multi--Agent-Orchestration-7c3aed?style=for-the-badge">
  <img alt="Project Bootstrap" src="https://img.shields.io/badge/Project-Bootstrap-059669?style=for-the-badge">
  <img alt="Agent Tournament" src="https://img.shields.io/badge/Agent-Tournament-db2777?style=for-the-badge">
  <img alt="Spyware Check" src="https://img.shields.io/badge/Spyware-Check-dc2626?style=for-the-badge">
  <img alt="Agent Cleanup" src="https://img.shields.io/badge/Agent-Cleanup-475569?style=for-the-badge">
  <img alt="Paseo Share" src="https://img.shields.io/badge/Paseo-Share-0284c7?style=for-the-badge">
</p>

<p>
  Drive a web UI directly with <code>/paseo-browser</code>,<br>
  compare answers from several models with <code>/paseo-orchestration</code>,<br>
  set up new project context with <code>/paseo-project</code>,<br>
  and share artifacts between your computer and mobile with <code>/paseo-share</code>.
</p>

</div>

---

## One-line summary

Paseobility is an **agent-installable Paseo slash-skill pack**: you hand this GitHub repo URL to Codex, Claude, or a Paseo agent and have it install.

Once installed, you can pull frequently used Paseo patterns out like slash commands: browser use (web browser manipulation), multi-agent orchestration, agent tournaments, session briefs, project bootstrap, pre-install repo security checks, archiving inactive subagents, and cross-device artifact sharing.

With base Paseo alone you can combine built-in tools to do similar work. But letting the agent re-decide that combination every time is slow and produces inconsistent results, so the pack bundles frequently used patterns for immediate reuse.

This repo is a **skill package for reproducibly composing Paseo's built-in tools**. It ships a macOS/Linux bootstrap helper and a Windows PowerShell install helper.

---

## v2.8.1 — Windows Cua install fix, read-only doctor, offline tests

v2.8.1 fixes a Windows-only Cua Driver install conflict and adds a read-only
diagnostics helper plus offline tests. It ships no Cua or Paseo binary change.

- **Windows Cua staging fix (code-level).** `scripts/paseobility-cua-driver.ps1`
  stages into a private bin, validates the staged binary, publishes only the
  executable set, and rolls back only the files it created on failure. A fresh
  real-host Windows install was **not** reproduced; the fix is covered offline
  only ([platform validation](docs/cua-platform-validation.md)).
- **Read-only doctor.** `scripts/paseobility-doctor.py` (Python 3 stdlib) with
  thin `.sh`/`.ps1` wrappers reports skill source/install integrity, Paseo
  version/reachability, and Cua version/permissions/daemon as distinct statuses;
  `--json` carries only allow-listed fields and `--target-home` isolates a check.
  `--check-mcp` is explicit-only and reports protocol/tools discovery, not a GUI
  result.
- **Offline tests and CI.** `tests/test_doctor.py`, `tests/test_e2e_assets.py`,
  and native `tests/test_cua_driver_runtime.ps1` run on macOS and Windows CI; the
  installer passes its selected `--target-home` through to the doctor. Both
  doctor wrappers need Python 3, but diagnostics stay optional for installation.
- **E2E assets and recovery reference.** `e2e/` holds a static browser fixture
  plus a foreground fixture server for a **manual** runbook (no automated report
  validator). `skills/paseo-cua/references/recovery.md` documents bounded retry,
  the permission flow, and that `verify_state: unknown` is not a pass.

See [Doctor and tests](#doctor-and-tests) and
[Current release testing](#current-release-testing-v281--separate-from-the-device-rows-above).

---

## v2.8.0 — Added the Cua Driver skill

v2.8.0 adds `paseo-cua`. It is used only when the user **explicitly asks to drive a native desktop app with the trycua Cua Driver**; ordinary web UIs belong to `paseo-browser`, and ordinary coding/shell work belongs to the other skills. The package installer auto-ensures the driver for `paseo-cua` or the full package. The skill itself performs no installation: if it is copied manually without the runtime, it reports the prerequisite and a recovery instruction rather than promising an install.

### Cua Driver runtime auto-install

Selecting `paseo-cua`, or installing the full package, also prepares the trycua Cua Driver runtime. If a working driver already exists, the installer reuses it and never auto-upgrades it.

- Pinned source: trycua/cua commit `9bbfa7dd3e27ca7f1861ede70aaca390174493f9`, Cua Driver version `0.28.2`.
- The installer downloads the upstream install scripts at the pinned commit and runs them from a temporary directory (never `curl | bash`). The pinned `_install-rust.sh` and `_install-common.sh` are fetched too, so the delegated script cannot silently fall back to a rolling URL.
- `--skip-cua-driver` / `-SkipCuaDriver`: skip the runtime and copy skills only (docs-only / offline).
- A custom `--target-home` / `-TargetHome` skips the real-host runtime by default and logs why. `--allow-host-runtime` / `-AllowHostRuntime` instead allows real host runtime installation even when the skills `--target-home` is custom. The driver is always installed at its normal host location; on macOS that still writes `/Applications/CuaDriver.app` and `~/.cua-driver`, so this is not a sandbox.
- The driver step verifies the code signature on macOS, does not modify PATH (`--no-modify-path` / `-NoPathUpdate`), and never touches shell rc or MCP config. The pinned installer only resolves/downloads a release and stops stale daemons; it never starts a daemon ([`install.sh`](https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/scripts/install.sh), [`_install-rust.sh`](https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/scripts/_install-rust.sh)).
- If the runtime step fails, the installer exits non-zero and reports that skills were copied but the runtime setup failed (installation may be incomplete).
- macOS Accessibility and Screen Recording permissions are granted by the human. A binary being installed is not the same as permissions being ready.
- The Cua Driver ships product telemetry **enabled by default** (the installer does not change it). You can inspect or disable it yourself with `cua-driver telemetry status` / `cua-driver telemetry disable`; Paseobility never changes that setting. Collection details were not independently audited — see the [platform validation status](docs/cua-platform-validation.md).
- A manual `cp -R` / `Copy-Item` copies documents only and cannot auto-install the Cua Driver runtime.

The package now has **7 skills**. CLI/MCP tool-schema compatibility was checked for the prior six skills at v2.7.0 and is recorded in the linked [compatibility report](docs/compatibility-0.9.0-beta.2.md), which does **not** cover `paseo-cua` — the six-skill record must not be read as covering all seven. `paseo-cua` is **preview / limited validation**, not broad stable Mac and Windows support. Its only directly verified boundary is a single Apple Silicon macOS 26.6.2 host on 2026-09-21 with Cua Driver 0.28.2; separate **user-reported** passes on Intel macOS and Windows, plus an isolated upstream PR build, are recorded with a dated matrix in the [Cua platform validation status](docs/cua-platform-validation.md). See [Verification status](#verification-status) below for the compact 2026-09-22 summary.

| Skill | Scope |
| --- | --- |
| `/paseo-orchestration` | Explicitly requested multi-agent coordination or compare/tournament |
| `/paseo-project` | Requested project summary/handoff or initial setup/environment changes |
| `/paseo-browser` | Web UI manipulation/verification in the Paseo browser |
| `/paseo-cua` | Explicitly requested native app GUI driven by the trycua Cua Driver |
| `/paseo-agent-cleanup` | Cleaning up selected test agents/workspaces |
| `/paseo-share` | Artifact sharing between personal devices |
| `/paseo-spyware-check` | Pre-install static security inspection of a repo |

Orchestration keeps `allow_implicit_invocation: false`. The project skill does not run for ordinary coding or session resume alone. Only the reference for the selected mode is read for compare/coordinator and summary/setup details.

| Former skill | Merged into |
| --- | --- |
| `paseo-agent-tournament` | `paseo-orchestration` comparison mode |
| `paseo-session-brief` | `paseo-project` read-only brief mode |
| `paseo-project-bootstrap` | `paseo-project` setup mode |
| `paseo-computer-use` | `paseo-browser` |
| `paseo-skill-save` | Removed; personal library data preserved |

When updating an existing install, the following command moves pre-consolidation skills to backup. Use `--with-claude` / `-WithClaude` only when you also want to update the Claude install.

```bash
./scripts/paseobility-init.sh --migrate-skills --no-context
```

```powershell
.\scripts\paseobility-install.ps1 -MigrateSkills
```

An ordinary copy/install does not remove old names. A selected install moves only that skill's predecessor names. Backups of predecessor names are kept even with `--no-backup` / `-NoBackup`. Unrelated skills and private runtime are untouched, and installation aborts if a predecessor directory's name/ownership cannot be confirmed or if it is a link.

---

## v2.6.0 update — Paseo 0.6.1 compatibility

v2.6.0 re-checked 8 features against the then-current Paseo 0.6.1 CLI and built-in tool schemas, and updated the features that connect directly to the Paseo runtime.

- orchestration/tournament dropped the legacy `paseo_*` tool names and now prefer `list_profiles`, use profile materialization, and follow `settings.modeId`, `settings.thinkingOptionId`, and `settings.features`.
- It does not guess provider/model; it confirms with `list_providers`, `inspect_provider`, and `list_models` only when needed.
- Worktree workspaces, supervised workspace scripts, agent notifications, the full schedule lifecycle, and heartbeat delete/recreate semantics were reflected.
- paseo-browser reflects the canonical `browser_*` tool names, workspace prerequisites, the connected desktop browser host, and the latest stale-ref/error recovery flow.
- The old `/paseo-computer-use` could be mistaken for full OS control, so it was renamed `/paseo-browser`. The installer does not auto-remove the old installed name, so an existing `paseo-computer-use` directory must be removed separately after an update.
- agent-cleanup validates the latest archive JSON `{ agentId|workspaceId, status: "archived", archivedAt }`. It no longer requires the removed `providerRelease` field, so it does not misread a valid archive as a partial failure, and it protects `initializing` agents as active.
- project-bootstrap/session-brief read Paseo version/daemon/project/workspace and `paseo.json` workspace script state read-only.
- share/spyware-check state their compatibility boundary as local helpers independent of the daemon/MCP. The spyware receipt preserves external API and credential names declared in document-style skills as capabilities distinct from executable code, keeping the review gate.

Compatibility references: [Paseo CLI](https://paseo.sh/docs/cli), [MCP tools](https://paseo.sh/docs/mcp), [workspaces/worktrees](https://paseo.sh/docs/worktrees), [schedules](https://paseo.sh/docs/schedules), and local Paseo 0.6.1.

---

## v2.5.2 update

v2.5.2 fixes a safety problem where `/paseo-agent-cleanup` archived healthy idle Codex sessions based on status alone.

- A run with no arguments is now a dry-run and does not use the default select-everything `.*`.
- Unfiltered `--auto` now targets only inactive agents with clear disposable/test/validation markers. Ordinary idle sessions are preserved as healthy sessions that can still be used.
- Scope can be limited with an explicit `--agent <id>` or a user-specified `--pattern`, and active agents and unapproved workspaces remain protected.
- After archiving, it verifies both the latest JSON acknowledgement and that the Paseo record disappeared from the active list.
- During verification it never opens history/timeline/resume, and never performs delete, stop, kill, lock-file deletion, or daemon restart.

## v2.5.1 update

v2.5.1 fixes an agent UX regression in `/paseo-share`.

- `/paseo-share`: top-level `help` and `--help` print usage and exit 0 with no configuration, Git, GitHub, or filesystem side effects. Unknown commands remain non-zero as before.

## v2.4.1 update

v2.4.1 fixes a bug where the `/paseo-spyware-check` macOS/Linux helper exited successfully when it could not create the report directory or required output files. Required I/O failures now exit non-zero immediately, while optional external scanner failures are recorded in `tools.log` and the remaining checks plus the fallback static scan continue.

## v2.4.0 update

v2.4.0 had `/paseo-share` safely auto-prepare the authenticated account's private `paseo_share` repository. At that time `/paseo-agent-cleanup` auto-archived every inactive agent, but this behavior was replaced in v2.5.2 by the safer dry-run/explicit-selection policy.

| Feature added/reinforced | Role |
| --- | --- |
| `/paseo-share` | Publish files to the private `paseo_share` and return a share ID plus preview/download links. Other computers fetch after verification |
| `/paseo-spyware-check` | Before installing a GitHub URL or local repo, read-only inspection for malicious install scripts, secret access, remote code execution, exfiltration, and supply-chain risk signals |
| `/paseo-agent-cleanup` | Preserve ordinary idle sessions and archive only explicitly selected or disposable-marked inactive agents. Workspaces are cleaned archive-only after approval |
| Installer backup | Automatically back up an existing same-name skill directory under `skills-backups/` before overwriting |
| Report summary | Add `High / Medium / Info` counts and a verdict hint to the spyware helper report |

`/paseo-spyware-check` calls external open-source scanner CLIs installed locally. Paseobility does not bundle or redistribute those scanners' binaries or rule sets.

`/paseo-agent-cleanup` is a dry-run by default and only shows candidates. It preserves ordinary idle sessions and archives only inactive agents selected by an explicit ID, a user-specified pattern, or a clear disposable/test/validation marker. Active agents such as running ones are never touched, and workspace cleanup is archive-only after approval.

`/paseo-share` checks GitHub CLI authentication on the first real share request and prepares `<login>/paseo_share` as a private repository. Onboarding from another computer with the same GitHub account reuses the existing repository after a safety check. Forgejo or another repository can be connected with an explicit `setup <repo-url>`. Uploaded files can be previewed directly on mobile via a link, and Paseo on another computer fetches them automatically using the share ID.

---

## How to use

The primary user of this project is not someone installing from a shell directly, but **someone who gives an AI agent the GitHub URL and delegates installation and verification**.

To install only `paseo-share`, send the following sentence verbatim to Codex or Claude.

```text
https://github.com/wilgon456/Paseobility

Read the instructions in this repository, install only paseo-share on this computer, and verify it.
Back up any existing install and do not restart the Paseo daemon.
When it is done, tell me how to start a new session/reload and how to make the first share request.
```

```text
https://github.com/wilgon456/Paseobility

Read this repo and install into my local Paseo skills directory following AGENTS.md.
First test the install with a temporary --target-home/-TargetHome path, and install into the real skills directory once it passes.
After installation, also check that /paseo-project is recognized in a new Paseo session.
```

The agent reads [AGENTS.md](./AGENTS.md) in Codex/Paseo and [CLAUDE.md](./CLAUDE.md) in Claude Code, then follows the OS-specific paths and install procedure. This Paseobility repository is the install source. Actual shared artifacts live in the private `paseo_share` repository of the authenticated account; installing never creates a repository by itself.

When you explicitly request these tasks, you can use the following capabilities:

- Open, read, click, type into, and verify web pages with screenshots.
- Split work across multiple agents and synthesize the results.
- Compare answers from several models such as GPT/Claude/DeepSeek/Grok and pick a winner or a merged plan.
- Before installing a GitHub URL or local repo, read-only inspection of spyware/supply-chain risk signals.
- Archive inactive agents with test-only markers after confirming scope, preserve ordinary idle sessions, and archive workspaces after approval.
- Publish work artifacts to a private Git share and open or fetch them from another computer or mobile.
- On request, summarize repo context, commands, instructions, and risks on one page.
- When initial setup is requested, gather README, docs, Claude/Codex/Cursor-style instructions to build working context.
- Design cross-provider collaboration such as implementing with Codex and reviewing with Claude.
- Put clear guardrails on infinite loops, dangerous submissions, and account changes.

---

## Included skills

| Skill | Role | Strong at requests like |
| --- | --- | --- |
| `/paseo-browser` | Browser manipulation workflow | Filling login forms, reading search results, clicking UI, responsive screenshots, checking web app state |
| `/paseo-cua` | Native desktop GUI driving | App window manipulation/snapshot/verification with the trycua Cua Driver, only on explicit request |
| `/paseo-orchestration` | Multi-agent coordination and comparison | Explicitly requested coordination or tournament, mode-specific guidance |
| `/paseo-project` | Project summary and setup | Requested read-only brief or environment/context setup |
| `/paseo-share` | Computer/mobile artifact sharing | Auto-prepare private `paseo_share`, clickable preview/download links, share-ID-based verification and fetch |
| `/paseo-spyware-check` | Pre-install security/spyware static check | Checking GitHub URLs, local repos, install scripts, secrets, exfiltration, supply-chain risk |
| `/paseo-agent-cleanup` | Inactive agent/workspace cleanup | Dry-run by default, preserve ordinary idle, archive only explicit/test-marked candidates, protect active agents, archive workspaces after approval |

---

## Install

The recommended install method is to give an AI agent this repository URL and let it install.

```text
https://github.com/wilgon456/Paseobility
Read this repo and install into my local Paseo skills directory.
Copy skills/* for my Windows/Mac environment and tell me how to reload afterward.
```

The agent checks the Mac/Windows skills paths based on [AGENTS.md](./AGENTS.md) in Codex/Paseo and [CLAUDE.md](./CLAUDE.md) in Claude Code. A `paseo-share` request installs only that skill instead of the full pack.

You can also install manually.

```bash
git clone https://github.com/wilgon456/Paseobility.git
cd Paseobility

# Install the Paseo / Codex skills only
./scripts/paseobility-init.sh --no-context

# Update just one skill
./scripts/paseobility-init.sh --skill paseo-agent-cleanup --no-context
./scripts/paseobility-init.sh --skill paseo-spyware-check --no-context
./scripts/paseobility-init.sh --skill paseo-share --no-context

# Also install for Claude Code
./scripts/paseobility-init.sh --with-claude --no-context

# Bootstrap a specific project right away
./scripts/paseobility-init.sh --root /path/to/your/project
```

On Windows PowerShell:

```powershell
git clone https://github.com/wilgon456/Paseobility.git
cd Paseobility

# Install the Paseo / Codex skills
.\scripts\paseobility-install.ps1

# Update just one skill
.\scripts\paseobility-install.ps1 -Skill paseo-agent-cleanup
.\scripts\paseobility-install.ps1 -Skill paseo-spyware-check
.\scripts\paseobility-install.ps1 -Skill paseo-share

# Test-install into a temporary home first
.\scripts\paseobility-install.ps1 -TargetHome $tmp.FullName

# Also install for Claude Code
.\scripts\paseobility-install.ps1 -WithClaude
```

### Cua Driver runtime

Selecting `paseo-cua`, or installing the full package, also ensures the trycua Cua Driver runtime. Other skill selections have no driver side effects. The runtime step is idempotent: an existing working driver is reused and never auto-upgraded.

```bash
# paseo-cua selected -> driver auto-ensured
./scripts/paseobility-init.sh --skill paseo-cua --no-context

# Skills only, no runtime (docs-only / offline)
./scripts/paseobility-init.sh --skill paseo-cua --skip-cua-driver --no-context

# Custom target homes skip the real-host runtime by default and log why
./scripts/paseobility-init.sh --target-home "$tmp" --no-context

# Explicitly allow real host runtime install with a custom target-home
./scripts/paseobility-init.sh --skill paseo-cua --target-home "$tmp" \
  --allow-host-runtime --no-context
```

```powershell
.\scripts\paseobility-install.ps1 -Skill paseo-cua
.\scripts\paseobility-install.ps1 -Skill paseo-cua -SkipCuaDriver
.\scripts\paseobility-install.ps1 -TargetHome $tmp.FullName
.\scripts\paseobility-install.ps1 -Skill paseo-cua -TargetHome $tmp.FullName -AllowHostRuntime
```

The driver helper can also be run directly:

```bash
./scripts/paseobility-cua-driver.sh --check       # presence only (exit 3 when missing)
./scripts/paseobility-cua-driver.sh --dry-run     # print the plan, execute nothing
./scripts/paseobility-cua-driver.sh               # ensure the pinned driver
```

If the runtime step fails, the installer exits non-zero and reports that skills were copied but the runtime setup failed (installation may be incomplete); re-run or pass `--skip-cua-driver` / `-SkipCuaDriver` to install skills only.

### Doctor and tests

The doctor is read-only, bounded, and cross-platform (Python 3 stdlib). Text mode
is for a human; `--json` is the shareable artifact carrying only allow-listed
fields (statuses, counts, validated skill names, sanitized semantic versions) —
never raw command output. Exit code 0 means "a report was generated", not
"everything is ready". `--source-root` overrides the skill pack; `--target-home`
points at an isolated install root.

```bash
python3 scripts/paseobility-doctor.py --root /path/to/project
python3 scripts/paseobility-doctor.py --root /path/to/project --json
# Explicit-only MCP protocol/tools discovery (needs a running daemon; not a GUI test):
python3 scripts/paseobility-doctor.py --root /path/to/project --check-mcp
# Isolated install check against a temporary home:
python3 scripts/paseobility-doctor.py --target-home /tmp/isolated-home --json
# Thin wrapper with the same passthrough:
./scripts/paseobility-doctor.sh --root /path/to/project
```

```powershell
.\scripts\paseobility-doctor.ps1 -Root .
# Same flags as the Python helper (-SourceRoot/-TargetHome/-CuaBin/-CuaBinDir):
.\scripts\paseobility-doctor.ps1 -SourceRoot . -TargetHome $tmp.FullName -Json
```

Offline test suites:

```bash
# macOS/Linux
python3 -m unittest discover -s tests -p "test_*.py" -v
```

```powershell
# Windows (no network, injected fixture installer)
pwsh -NoProfile -File tests/test_cua_driver_runtime.ps1
```

The installer backs up an existing same-name skill before overwriting.

| OS | Backup path |
| --- | --- |
| macOS/Linux | `~/.agents/skills-backups/Paseobility-<version>-<timestamp>/` |
| Windows | `%USERPROFILE%\.agents\skills-backups\Paseobility-<version>-<timestamp>\` |

If you must force-replace without a backup, macOS/Linux uses `--no-backup` and Windows uses `-NoBackup`.

After installation, start a new agent in the Paseo app, or reload integrations/skills in Settings.

If you prefer a manual copy (documents only — it cannot auto-install the Cua Driver runtime):

```bash
mkdir -p ~/.agents/skills
cp -R skills/* ~/.agents/skills/
```

Windows manual install:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.agents\skills" | Out-Null
Copy-Item -Recurse -Force ".\skills\*" "$env:USERPROFILE\.agents\skills\"
```

---

## Requirements

- [Paseo](https://paseo.sh) desktop app
- Paseo Settings -> Agents -> **Enable Paseo tools** enabled
- One or more AI providers
  - e.g. Codex, Claude Code, etc.
- `/paseo-share` needs Node.js and Git. Default GitHub auto-onboarding needs an authenticated GitHub CLI (`gh`); Forgejo and custom remotes connect with an explicit repository URL. GitHub Actions is not used.
- `/paseo-cua` needs the trycua Cua Driver. The installer auto-ensures it for `paseo-cua` or the full package; macOS Accessibility and Screen Recording grants stay manual.
- Orchestration prefers Paseo's `list_profiles`. The legacy `~/.paseo/orchestration-preferences.json` is read only as optional extra guidance.
- Install target skills path
  - macOS/Linux: `~/.agents/skills`
  - Windows: `%USERPROFILE%\.agents\skills`
- The bootstrap context script targets macOS/Linux shell environments
  - On Windows, `scripts/paseobility-install.ps1` only assists with skill installation.

---

## Verification status

The CLI/MCP compatibility record for the existing six skills is the v2.7.0
[compatibility report](docs/compatibility-0.9.0-beta.2.md), which **does not cover `paseo-cua`**.
The six-skill record must not be read as covering all seven skills.

`paseo-cua` is **preview / limited validation** — not broad stable Mac and Windows support.
Current dated status (**2026-09-22**):

| Environment | Native GUI (Cua) | Browser result and limits |
| --- | --- | --- |
| Apple Silicon macOS 26.6.2 · Cua 0.28.2 · direct local | Calculator input/read-back + PNG pass; `verify_state` unknown | viewport pass; built-in `fullPage` fails |
| Intel Mac mini 16 GiB · macOS 15.8 · Paseo 0.8.0 · Cua 0.28.2 | user-reported: native GUI + PNG pass; `verify_state` unknown | browser input/viewport pass; built-in `fullPage` fails; same-tab scroll+stitch whole-PNG passed for two DPR-1 fixtures only (not a general helper) |
| Intel MacBook 8 GiB · macOS 15.7.9 · Paseo 0.7.2 · Cua 0.17.0 (reused) | user-reported prior E2E: native GUI/PNG pass; `verify_state` unknown | browser input/viewport pass; built-in `fullPage` fails; installed 0.9.0-beta.2 left unchanged and not revalidated |
| MacBook follow-up · isolated upstream PR `#3197` build (reported 0.3.1) | — | user-reported: real MCP `browser_screenshot(fullPage:true)` passed 2573px/3511px at DPR 2 twice each, repeat SHA identical |
| Windows 11 25H2 · Paseo 0.9.0-beta.2 · Cua 0.28.2 | user-reported: MCP 57 tools + Calculator input/AX/PNG/`verify_state` pass | viewport/full-page PNG failed (`screenshot_no_frame` then 15s timeout, no image); DOM-fixture input/click/scroll pass; localhost HTTP failed; physical browser host unknown |

Notes:

- Only the Apple Silicon row was directly verified in this review; the Intel Mac and Windows rows are **user-reported** and were not independently reproduced. The MacBook follow-up used the isolated upstream PR build without additional product edits and is **not** a fix released or installed by Paseobility — the 0.9 backport was aborted on conflicts, and a 0.3.1 downgrade is not recommended.
- Native passes cover narrow tested flows, not blanket platform support. The 8 GiB sample is not a RAM minimum or guarantee, and memory was not measured at peak.
- Windows automatic runtime installation had a code-level conflict: the shared non-junction `.local/bin` was pre-created before the pinned upstream installer, which refuses an existing non-junction directory. v2.8.1 installs into a private staging bin and publishes only the executable set, and `tests/test_cua_driver_runtime.ps1` covers the conflict, rollback, and shared-bin preservation offline. A real-host fresh Windows install was **not** reproduced for this release, so the earlier manual hardlink recovery remains the last real-host evidence. Two explicit-only skills remain unconfirmed in the Windows catalog.
- Test counts are as reported and were **not** re-run for this README update: 41 automated tests on the Intel Mac mini (cleanup 11 + share 15 + scanner 13 + shell 2); Windows 63 passed / 2 failed / 1 skipped, unchanged.
- The PowerShell wrappers were source-reviewed only on macOS (`pwsh` unavailable); the supplied Windows report confirms skill migration and manual runtime recovery. Isolated-path install/migration and helper regression tests were confirmed.
- The v2.7 six-skill compatibility doc does **not** prove all seven skills at runtime. This documentation update does not modify the Paseo app or capture engine. Do not read binary presence as permission readiness. Other macOS versions and Linux remain **unverified**.

### Current release testing (v2.8.1) — separate from the device rows above

The rows above are older device evidence. The v2.8.1 release ran its offline
suites on macOS and Windows CI; [CI run
35708474356](https://github.com/wilgon456/Paseobility/actions/runs/35708474356)
(head `9932ea7590ef137552d8b2b4e065e7fbb1792254`) is **SUCCESS** for both the
macOS and Windows jobs. Exact scope:

- **macOS:** 49 Python tests discovered, **49 pass, 0 skip** (Cua Driver runtime
  18, doctor 21, E2E assets 3, skill migration 7), plus Node cleanup **11**, Node
  share **15**, Python scanner **13**, and shell **2** — **90 automated tests
  total**.
- **Windows shared Python suite:** 49 discovered, of which **14 pass** and the
  other **35 are POSIX-only skips**. The Windows job also runs Node cleanup
  **11**, Node share **15**, and Python scanner **13**, all passing.
- **Native PowerShell fixture suite:** runs under **both** `pwsh` and Windows
  PowerShell 5.1, each reporting **109 assertions, 0 fail, 0 skip**. This counts
  *assertions*, not 109 test cases, and it is a fixture suite — not a real
  downloaded-Cua GUI test.
- **Still unverified:** a fresh native Windows Cua install from the official
  download path was **not** reproduced. The fixture suite proves the staged
  install / shared-bin preservation / rollback / skill-migration contract, not a
  live download.
- `./scripts/paseobility-doctor.sh --root .` was run in text and `--json` modes
  against this checkout; the JSON is deterministic, carries only allow-listed
  fields, and reports the live host as Cua 0.28.2 (permissions granted, daemon
  running) and Paseo 0.9.0-beta.2 reachable.
- With an explicit `--check-mcp`, the live Cua 0.28.2 MCP probe was observed
  negotiating the protocol and listing **56 tools** on one connection. The probe
  spawns its own stdio server child, and the **56 tools** come from that
  parent-run probe. This is a protocol/tools check only, never a GUI result, and
  it does **not** prove a Paseo agent client's MCP config or tool discovery.
- **GUI end-to-end is blocked, not passed.** A manual attempt to drive the
  `e2e/` browser fixture on this host failed: `browser_new_tab http://127.0.0.1:<port>`
  timed out waiting for tab registration, no connected tab appeared, and the
  fixture server was terminated with no listener left on the port. The current
  browser host could not register the tab, so no GUI pass is claimed. The
  historical device rows above are unchanged.
- The updated `paseo-cua` skill was installed locally for this release into both
  the Codex/Paseo and Claude skill directories, with backups; all seven source
  trees match, the other twelve installed trees were untouched, and the Cua
  runtime stayed at 0.28.2.

### Rollback

- These changes are scripts, tests, docs, and E2E assets; no Cua or Paseo binary
  is modified. To restore the previous helper behavior, the v2.8.0 tree is
  referenced but is **not a guaranteed tag**; the safest option is to check out
  the previous `main` commit `970ea8cab7c3fef757d2bd13f58c8389758aad1d` in a
  **separate clone**, preserving your existing work. Skill rollback uses the
  installer backups.
- There is **no automatic runtime rollback.** Paseobility never auto-upgrades the
  installed Cua Driver, so a driver that already worked is left as it was.
- Diagnostics need Python 3, but installation never does: both
  `paseobility-doctor.sh` and `paseobility-doctor.ps1` require Python 3 and exit
  non-zero with a clear message when it is absent, and the installer treats that
  as "diagnostics unavailable" and still completes. Without Python 3, skip
  diagnostics.

Details, including the optional Playwright fallback and per-host probes, are in the
[Cua platform validation status](docs/cua-platform-validation.md) and the
[compatibility report](docs/compatibility-0.9.0-beta.2.md). The entries below are prior-version records and are not evidence for the current version.

### Past verification record — separate from this consolidation

| Environment | Status | What was checked |
| --- | --- | --- |
| Paseo 0.6.1 on Windows | Tested locally | CLI/daemon 0.6.1 agreement, agent/workspace/provider JSON, worktree/schedule/heartbeat/archive CLI schema, cross-check against current MCP/profile/browser sources, PowerShell temporary install |
| Apple Silicon macOS | Tested | Paseo CLI 0.2.5 detected `Darwin/arm64`, temporary HOME install, real `~/.agents/skills` install, context generation, package script detection, `/paseo-session-brief` recognized by a new Paseo agent |
| Intel macOS | Tested | Paseo CLI 0.2.5 detected `Darwin/x86_64`, temporary HOME install, real `~/.agents/skills` install, context generation, package script detection, `/paseo-session-brief` recognized by a new Paseo agent |
| Windows | Tested | Windows 11 x64, Windows PowerShell 5.1, Paseo CLI 0.2.5: PowerShell installer, `-TargetHome` temporary install, real `%USERPROFILE%\.agents\skills` install, `/paseo-session-brief` recognized by a new Paseo agent. Native bash context script not verified |
| `/paseo-spyware-check` on Apple Silicon macOS | Tested | On Paseo 0.3.0: temp HOME install, helper script run, fixture risk-pattern detection, recognition by a new Paseo agent, scanner dry-run. Required report I/O fail-closed and optional scanner failure continuation regression tests passed |
| `/paseo-spyware-check` on Intel macOS | Tested | On Darwin x86_64 / Paseo 0.3.0: install, helper script run, fixture risk-pattern detection, recognition by a new Paseo agent, Gitleaks secret scan no finding |
| `/paseo-spyware-check` on Windows | Tested | On Windows 11 x64 / PowerShell 5.1 / Paseo 0.3.0: native PowerShell static-search workflow regex compile, fixture risk-pattern detection, recognition by a new Paseo agent. Bash helper not verified on native Windows |
| `/paseo-agent-cleanup` helper | Tested locally | Node regression tests covering bare dry-run, ordinary idle preservation, disposable marker/explicit ID/user-pattern restriction, running/initializing protection, Paseo 0.6 archive acknowledgement and post-archive list verification, workspace approval gate, no dangerous command execution |
| `/paseo-agent-cleanup` on Windows | Previous install verified | On Windows 10.0.26200 x64 / Node v24.14.0 / Paseo 0.3.0: `%USERPROFILE%\.agents\skills` install and dry-run JSON. v2.5.2 policy regression verified by cross-platform Node unit tests |
| `/paseo-share` on Apple Silicon macOS | Tested | Official skill validator, Node security/onboarding/help and `--help` regression tests, private repo create/reuse and public/irrelevant repo rejection, real private GitHub publish/read/auto-fetch/original SHA-256 comparison, isolated Codex/Claude install |
| `/paseo-share` on Windows | Tested | Windows private checkout, PowerShell install, private GitHub connection, real TXT publish and remote file read, mobile GitHub preview |

Intel Mac testing observed no install failure, agent recognition failure, or Intel-specific error.
Windows testing passed the PowerShell installer, `-TargetHome` temporary home install, and real skill recognition. Temporary home installs isolate on `-TargetHome` or `$env:USERPROFILE` instead of `$HOME`.

---

## Quick usage examples

### Sharing artifacts with another computer and mobile

On the first share request, GitHub connectivity is checked and the authenticated
account's private `paseo_share` repository is prepared automatically.

```text
/paseo-share Share this report so I can view it on my phone.
```

If GitHub authentication is missing, it first guides you to
`gh auth login --hostname github.com`. To use Forgejo or a separate repository,
use `setup <repo-url>` explicitly.

Then publish or fetch in natural language.

```text
/paseo-share Share this report so I can view it on my phone.
/paseo-share Show me the file I just shared from another computer.
/paseo-share Fetch the latest shared file into the current project and summarize it.
```

The publish result includes a share ID and clickable preview/download links. Private repository links require GitHub/Forgejo login in the mobile browser.

### Driving a web UI directly

```text
/paseo-browser
Open the login page at https://example.com, inspect the form structure,
then verify with a screenshot whether a test account logs in.
```

A possible workflow:

```text
Open a new tab -> page snapshot -> find input fields -> enter values
-> click the button -> wait -> verify again with snapshot/screenshot
```

### Commanding several agents

```text
/paseo-orchestration
Split this feature into implementation, testing, and review, run them in parallel,
and have a review agent decide pass/fail at the end.
```

A possible workflow:

```text
Decompose task -> create worker agents -> run in parallel
-> collect results -> review gate -> pass/block decision
```

### Comparing answers from several models

```text
/paseo-orchestration
On this README direction, have GPT argue for it, OpenCode DeepSeek against it,
and Grok compare the two and produce a final judgment.
```

A possible workflow:

```text
Define participant roles -> run agents in parallel
-> collect results -> create a judge agent
-> produce winner / merged plan / risks
```

### Making a session brief

```text
/paseo-project
Assume I'm seeing this project for the first time and produce a brief I can work from.
```

Output scope:

```text
Project -> Current State -> Instructions -> Commands
-> Project Map -> Risks -> Suggested First Moves
```

### Setting up new project context

```text
/paseo-project
Assume I'm seeing this repo for the first time; read docs, CLAUDE.md, AGENTS.md,
and package scripts to build working context.
```

You can also prepare the same thing with shell scripts first.

```bash
./scripts/paseobility-doctor.sh
./scripts/paseobility-context.sh
```

Generated files:

```text
.paseobility/
├── context.md        # summary of README/docs/instruction files
├── commands.md       # candidate install/dev/build/test commands
├── project-map.md    # map of key files/directories
└── bootstrap-log.md  # OS, arch, Paseo state, warnings
```

### Pre-install spyware check

```text
/paseo-spyware-check
Is it safe to install https://github.com/owner/repo?
Focus on install scripts, secret access, remote code execution, and data exfiltration risk.
```

Core principles:

- It reads the repo read-only and does not execute its code.
- On macOS/Linux it uses the bundled helper, if present, to make a static report after a temp clone.
- On Windows it can make a native static report with the bundled PowerShell helper.
- If `gitleaks`, `trufflehog`, `semgrep`, `osv-scanner`, `trivy`, `shellcheck`, or `yara` are installed it uses them; otherwise it falls back to `rg`-based heuristics.
- If no scanner is present, the bundled helper first shows the install command, and can install via Homebrew after approval.
- Results are classified by severity as `High`, `Medium`, and `Info`, and self-references inside scanner docs/regex are marked `Info`.
- The helper report includes a `Finding Summary` that first shows `High / Medium / Info` counts and a verdict hint.
- Results are summarized with a `Low / Medium / High / Critical` verdict plus file/line evidence.

### Cleaning up test agents

```text
/paseo-agent-cleanup
First show a dry-run of inactive agents with disposable/test markers and test workspace candidates.
Preserve ordinary idle sessions and do not archive agents outside the IDs or patterns I specify.
Do not touch running agents, and only show workspace candidates before approval.
```

Core principles:

- The default run is a dry-run and does not archive ordinary idle agents based on status alone.
- `--auto` is allowed only for inactive agents with an explicit ID, a user-specified pattern, or a clear disposable/test/validation marker.
- It never deletes, only archives, and always protects active agents.
- Workspace archive proceeds only with user approval and an explicit ID.
- It confirms the target ID and status in the archive response and re-queries that the agent disappeared from the active list.

---

## `/paseo-share`

Publishes small documents, code, PDFs, and images as immutable artifacts to a dedicated private Git repository. Without GitHub Actions or a background daemon, each computer only runs local `git fetch`, `rebase`, `commit`, and `push`.

- `onboard`: check GitHub authentication, then create `<login>/paseo_share` private repo or safely reuse it
- `setup`: configure the per-machine name and the same remote repository
- `publish`: return a share ID, preview URL, and download URL
- `list` / `latest`: view another computer's artifacts after remote sync
- `fetch`: verify and copy a share ID or `latest` to the current computer

Artifacts are stored under `artifacts/<machine>/<year>/<month>/<artifact-id>/`. Only ordinary documents, code, PDFs, and images at 50 MiB or less are allowed, and secret-looking file names and representative text token patterns are blocked. Fetching checks the metadata schema, path containment, symlinks, file size, and SHA-256, and safely handles Windows CRLF and macOS/Linux LF conversion.

The supported model is **one user trusting their own private repository across their own devices**. Multi-tenant exchange where untrusted multiple users share one repository is not supported. Sensitive information inside binaries is not inspected, and Git deletion still leaves history, so sensitive files must not be published.

Auto-onboarding aborts without attempting to change visibility, rename, delete, or overwrite when a same-name repository is public or is not a Paseo Share structure.

---

## `/paseo-orchestration` comparison mode

This skill gives the same problem independently to several agents, then a separate judge compares them and picks the final answer.

| Mode | Purpose |
| --- | --- |
| Debate | One model argues for, another against, and a judge synthesizes |
| Competing Plans | Compare several design/modification plans |
| Competing Implementations | Compare implementation candidates in isolated workspaces |

Key rules:

- First read the notes from `list_profiles` and materialize the profile into `create_agent` arguments. If no profile fits, confirm with `list_providers`, `inspect_provider`, and, if needed, `list_models`.
- Analysis-only work may use the same workspace.
- A tournament that modifies files uses a separate workspace per participant.
- The judge preferably uses a different provider from the participants.
- Results are summarized as winner, runner-up, best merged plan, and risks.

---

## `/paseo-project`

Selects project summary and environment setup from a single entry point.

- **Summary mode:** read-only summary of the requested repo overview, commands, and handoff only.
- **Setup mode:** performs only the requested initial setup, environment change, or context generation.
- Reuses information already confirmed and does not re-investigate the same documents in full.
- Queries version/daemon/workspace only when the Paseo runtime is relevant. If a `--cwd` lookup fails due to a path alias, it uses the existing workspace ID.
- If you asked only for a summary with no install/create work, it creates no files.

The procedure for the mode you need is in the [skill](skills/paseo-project/SKILL.md) and its linked references.

---

## `/paseo-spyware-check`

Before installing a GitHub URL or local repo, statically inspects for spyware, malicious install scripts, secret theft, remote code execution, and supply-chain risk signals.

What it checks:

- `preinstall`, `install`, `postinstall`, `prepare` in `package.json`
- remote download/execute, hidden processes, and persistence in shell/PowerShell scripts
- access to `.ssh`, `.aws`, `.npmrc`, browser profiles, keychain, and API tokens
- obfuscation/execution patterns such as `eval`, `Function`, `base64`, `EncodedCommand`, `child_process`
- GitHub Actions risks: `pull_request_target`, unpinned actions, secret exposure
- optional scanner results: `gitleaks`, `trufflehog`, `semgrep`, `osv-scanner`, `trivy`, `shellcheck`, `PSScriptAnalyzer`, `yara`
- the helper report severity classes: `High`, `Medium`, `Info`
- the helper report `Finding Summary` count and verdict hint
- self-reference patterns inside scanner docs/scripts

Key rules:

- It does not execute the code of the repo under inspection.
- It does not run dependency install/build/test.
- It does not print sensitive values; it redacts around file/line/key names.
- Even a clean result is phrased as "no high-risk signals in the static scan", not "absolutely safe".
- Self-references caught in scanner documentation or regex descriptions are not hidden but classified as `Info`.

Third-party scanner note:

- `/paseo-spyware-check` calls external open-source scanner CLIs installed locally.
- Paseobility does not bundle or redistribute those scanners' binaries or rule sets.

Bundled helpers:

```bash
# Cross-platform JSON security receipt
python skills/paseo-spyware-check/scripts/spyware-check.py https://github.com/owner/repo --json
```

```bash
# macOS/Linux
skills/paseo-spyware-check/scripts/spyware-check.sh --target https://github.com/owner/repo
skills/paseo-spyware-check/scripts/install-scanners.sh --dry-run
```

```powershell
# Windows PowerShell
.\skills\paseo-spyware-check\scripts\spyware-check.ps1 -Target https://github.com/owner/repo
.\skills\paseo-spyware-check\scripts\install-scanners.ps1 -DryRun
```

---

## `/paseo-agent-cleanup`

Safely cleans up Paseo's inactive agents and test workspaces.

What it checks:

- the agent list from `paseo ls --json`
- the workspace list from `paseo workspace ls --json`
- inactive agents limited by an explicit ID, a user-specified `--pattern`, or a disposable/test/validation marker
- ordinary idle agents to preserve and active agents that are protected
- explicitly specified agent/workspace IDs

Key rules:

- The default run is a dry-run and does not archive ordinary idle agents based on status alone.
- `--auto` archives only inactive agents with an explicit ID, a user-specified pattern, or a clear disposable/test/validation marker.
- Agents in running, initializing, working, active, starting, queued, pending, busy, executing, or in-progress states are not archived.
- It does not use delete/stop/kill/restart or history/timeline/resume verification.
- After archiving it verifies the Paseo CLI JSON acknowledgement and removal from the active list.
- Workspace archive runs only after an explicit ID and `--archive --yes` or clear user approval.

Bundled helper:

```bash
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --dry-run --pattern 'cleanup-validation|fixture'
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto --agent <agent-id>
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --auto --pattern 'cleanup-validation|fixture'
node skills/paseo-agent-cleanup/scripts/agent-cleanup.js --workspace <workspace-id> --archive --yes
```

---

## `/paseo-browser`

Provides a workflow that actually manipulates the browser, not just "views" it.

| To do | Flow to use |
| --- | --- |
| Read a page | `browser_new_tab` -> `browser_snapshot` |
| Click a button | `browser_snapshot` -> find ref -> `browser_click` |
| Fill a form | `browser_snapshot` -> find ref -> `browser_fill` / `browser_type` |
| Select a dropdown | `browser_snapshot` -> find ref -> `browser_select` |
| Verify a screen | `browser_screenshot` / `browser_snapshot` |
| Check responsiveness | `browser_resize` -> `browser_screenshot` |
| Debug | `browser_logs` / `browser_evaluate` |

Key rules:

- Always take a fresh snapshot before an action. When the page changes, refs change too.
- The canonical tool names are `browser_*`, and the agent must belong to a Paseo workspace with a connected desktop browser automation host.
- Use snapshots to understand text and screenshots for visual verification.
- Take user confirmation first for hard-to-reverse actions such as payment, submission, or account changes.
- Do not read sensitive information such as cookies, tokens, or localStorage with `evaluate`.

---

## `/paseo-cua`

Drives a native desktop GUI through the trycua Cua Driver (`cua-driver` CLI or MCP), explicitly only. **Preview / limited validation** — see the [Cua platform validation status](docs/cua-platform-validation.md).

- Preconditions: `cua-driver --version` must be present. If missing, report the prerequisite and stop; the skill installs nothing.
- Read the installed contract first: `cua-driver list-tools`, `cua-driver describe <tool>`.
- `cua-driver mcp-config --client opencode` only prints a config snippet; it does not register a server.
- Core loop: inspect -> snapshot -> one snapshot-bound action -> verify.
- Escalate to `delivery_mode: "foreground"` only after a verified background no-op and only within the user's authorization.

---

## `/paseo-orchestration`

A pattern collection where one agent creates several agents, splits roles, and synthesizes results.

| Pattern | Purpose |
| --- | --- |
| Fan-out | Give independent work to several agents at once |
| Task DAG | Step 1 -> Step 2 -> Step 3 sequential execution |
| Hybrid DAG | Mixed flow such as parallel work then synthesis then review |
| Decision Gate | A review agent decides pass/block before the next step |
| Coordinator Loop | Periodically check long work with a heartbeat |
| Blocking Ask/Reply | Proceed after receiving another agent's answer |
| Escalation | Clearly report permissions, ambiguity, and hard failures to the user |

Recommended composition:

```text
Codex       -> implementation / refactoring / test writing
Claude      -> review / UX copy / risk check
Coordinator -> decomposition / progress management / final synthesis
```

Safety rules:

- If several workers may modify the same file, create a separate workspace.
- Read the notes from `list_profiles` first, then materialize the chosen profile into provider/settings. Do not reuse stale provider strings verbatim.
- Set `maxRuns` or `expiresIn` on heartbeats and schedules.
- Retry transient failures such as network timeouts at most once.
- Escalate insufficient permissions, ambiguous requirements, and destructive operations to the user instead of guessing.

---

## Optional extra guidance

In Paseo 0.6, the agent profiles configured in the app are the basis for provider/model/mode/thinking/feature selection. The legacy file below can be used to pass extra user guidance, not as a provider source.

`~/.paseo/orchestration-preferences.json` example:

```json
{
  "preferences": [
    "Write task instructions as a self-contained briefing.",
    "Prefer a different provider for review agents than the implementing agent.",
    "Do not silently bypass hard failures; report them to the user."
  ]
}
```

---

## Repository layout

```text
skills/
├── paseo-agent-cleanup/       # SKILL.md + CLI helper/tests
├── paseo-browser/            # SKILL.md
├── paseo-cua/                # SKILL.md + explicit-only policy
│   └── references/           # setup.md, workflow.md, recovery.md
├── paseo-orchestration/      # SKILL.md + explicit-only policy
│   └── references/           # coordination.md, tournament.md
├── paseo-project/            # SKILL.md
│   └── references/           # brief.md, setup.md
├── paseo-share/              # SKILL.md + CLI helper/tests
└── paseo-spyware-check/      # SKILL.md + scanners/tests
scripts/                     # installers, doctor (.sh/.ps1/.py), context, cua-driver helpers
tests/                       # test_doctor.py, test_e2e_assets.py, test_cua_driver_runtime.py/.ps1, test_skill_migration.py
e2e/                         # browser fixture, fixture server, runbook, report template
.github/workflows/ci.yml     # macOS + Windows offline suites
docs/compatibility-0.9.0-beta.2.md
docs/cua-platform-validation.md
AGENTS.md
CLAUDE.md
VERSION
paseobility.json
```

---

## License

[MIT License](./LICENSE).

---

<div align="center">

<strong>Use the browser like a hand, and run agents like a team.</strong>

</div>
