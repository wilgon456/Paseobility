---
name: paseo-spyware-check
description: >-
  Perform a read-only spyware/malware/supply-chain risk check on a GitHub URL
  or local repository before installing, building, or running it. Use when the
  user asks whether a repo is safe, suspicious, spyware, malicious, exfiltrates
  secrets, phones home, abuses install scripts, or should be installed. The
  workflow clones or inspects the target without executing project code, uses
  available open-source scanners such as Gitleaks, Semgrep, OSV-Scanner,
  Trivy, ShellCheck, PSScriptAnalyzer, TruffleHog, or YARA when installed,
  offers conservative scanner installation commands when missing, and falls
  back to static grep-style checks.
---

# Paseo Spyware Check

This skill checks a GitHub URL or local repo for suspicious code before the user
installs or runs it. It is a risk triage workflow, not a guarantee that code is
safe.

## Third-party scanners

This skill integrates with external open-source scanner CLIs when they are
installed locally. Paseobility does not vendor or redistribute those scanner
binaries or rule sets.

## Core rules

- Default to read-only inspection.
- Do not run the target repo's install, build, test, postinstall, prepare,
  setup, bootstrap, or app commands.
- Do not install scanner tools until the user explicitly approves the exact
  package-manager command.
- Clone GitHub URLs into a temporary directory unless the user provided a local
  path.
- Do not source scripts, import project modules, execute package scripts, or
  run generated binaries from the target repo.
- Do not print secret values. Report only file paths, key names, line numbers,
  and redacted snippets.
- Distinguish `confirmed secret`, `high-risk behavior`, `suspicious pattern`,
  and `needs manual review`.

## Quick workflow

1. Identify the target:
   - GitHub URL: clone into a temporary directory.
   - Local path: inspect that path in place.
2. Confirm repo metadata:
   ```bash
   pwd
   git -C <repo> remote -v
   git -C <repo> rev-parse --show-toplevel
   git -C <repo> status --short
   rg --files <repo>
   ```
3. Run the bundled helper on macOS/Linux when available:
   ```bash
   bash <skill-dir>/scripts/spyware-check.sh --target <url-or-path>
   ```
4. On Windows, use the PowerShell workflow below.
5. Review high-signal files manually.
6. Produce a verdict with evidence and limitations.

## Bundled macOS/Linux helper

The helper never executes target project code. It:

- clones GitHub URLs into a temporary directory
- inventories risky files
- runs optional scanners if installed
- runs `rg` fallback heuristics
- writes a Markdown report

Use:

```bash
bash skills/paseo-spyware-check/scripts/spyware-check.sh --target https://github.com/owner/repo
bash skills/paseo-spyware-check/scripts/spyware-check.sh --target /path/to/repo --out /tmp/paseo-spyware-report
```

Optional scanners are detected automatically:

| Tool | Purpose |
| --- | --- |
| `gitleaks` | Secret scanning |
| `trufflehog` | Secret scanning, run with no verification by default |
| `semgrep` | Static analysis/security rules |
| `osv-scanner` | Dependency vulnerability scan |
| `trivy` | Filesystem vulnerability/secret/misconfiguration scan |
| `shellcheck` | Shell script lint/security review |
| `yara` | Malware/signature rules when local rules exist |

If optional tools are missing, continue with the fallback scan and clearly say
which tools were not available.

To add the recommended OSS scanner set on macOS/Linux, first show the user the
plan:

```bash
bash skills/paseo-spyware-check/scripts/install-scanners.sh --dry-run
```

Only after approval, run:

```bash
bash skills/paseo-spyware-check/scripts/install-scanners.sh --yes
```

The installer prefers Homebrew when present and never uses `sudo`, remote shell
pipes, or target-repo code.

## Windows PowerShell workflow

Use a temp clone for URLs:

```powershell
$tmp = New-Item -ItemType Directory -Path ([IO.Path]::GetTempPath()) -Name ("paseo-spyware-" + [guid]::NewGuid())
git clone --depth 1 <github-url> $tmp.FullName
$repo = $tmp.FullName
```

For local paths:

```powershell
$repo = Resolve-Path "<path>"
```

Inventory and static search:

```powershell
git -C $repo remote -v
git -C $repo status --short
Get-ChildItem -LiteralPath $repo -Recurse -File |
  Where-Object {
    $_.FullName -match 'package\.json$|pnpm-lock\.yaml$|yarn\.lock$|package-lock\.json$|Cargo\.toml$|go\.mod$|pyproject\.toml$|requirements.*\.txt$|Makefile$|Dockerfile$|\.github\\workflows\\.*\.ya?ml$|\.sh$|\.ps1$|\.js$|\.ts$|\.py$'
  } |
  Select-String -Pattern 'postinstall|preinstall|prepare|curl .*\\|.*sh|wget .*\\|.*sh|Invoke-Expression|iex|DownloadString|EncodedCommand|Start-Process.*Hidden|New-ScheduledTask|HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run|child_process|eval\\(|Function\\(|base64|atob|Buffer\.from|process\.env|\.ssh|\.aws|GITHUB_TOKEN|NPM_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY' |
  Select-Object Path, LineNumber, Line
```

Run optional tools only if they already exist:

```powershell
Get-Command gitleaks, semgrep, osv-scanner, trivy, trufflehog, Invoke-ScriptAnalyzer -ErrorAction SilentlyContinue
```

For PowerShell files, prefer PSScriptAnalyzer when available:

```powershell
Get-ChildItem -LiteralPath $repo -Recurse -Filter *.ps1 |
  ForEach-Object { Invoke-ScriptAnalyzer -Path $_.FullName }
```

## Manual review targets

Always inspect these files when present:

- `package.json` scripts, especially `preinstall`, `install`, `postinstall`,
  `prepare`, `prepublish`, `build`
- shell and PowerShell scripts: `*.sh`, `*.bash`, `*.zsh`, `*.ps1`
- GitHub Actions: `.github/workflows/*.yml`, `.github/workflows/*.yaml`
- Docker files and compose files
- dependency manifests and lockfiles
- binary-looking files, vendored archives, minified blobs, generated bundles
- files touching home directories, keychains, SSH, cloud credentials, browser
  profiles, environment variables, or webhooks

## High-risk patterns

Treat these as high risk until explained:

- install scripts that download and execute remote code
- obfuscated code using base64, eval, dynamic function construction, packed
  blobs, or hidden PowerShell windows
- credential access: `.ssh`, `.aws`, `.npmrc`, keychains, browser profiles,
  `process.env`, common API token names
- persistence: launch agents, login items, scheduled tasks, registry Run keys,
  cron, systemd units
- broad filesystem traversal from the user's home directory
- network exfiltration to unknown domains, pastebins, webhooks, or raw IPs
- GitHub Actions using `pull_request_target` with untrusted checkout/scripts
- unpinned remote scripts, unpinned third-party actions, or install-time curl
  pipes

## Verdict format

Return:

```text
Verdict
- Low / Medium / High / Critical
- one-sentence reason

What I Checked
- target URL/path, commit if available
- optional scanners available/missing
- files and manifests reviewed

Findings
- severity, file:line, evidence, why it matters

Suspicious But Not Confirmed
- items that need maintainer explanation

Safe Signals
- boring install scripts, no secrets found, pinned dependencies, etc.

Limitations
- tools not installed
- dynamic behavior not executed
- private dependency code not inspected

Recommendation
- safe to inspect only / safe to install in sandbox / do not install / ask maintainer
```

Do not claim "safe" absolutely. Prefer "no high-risk indicators found in this
static pass" when the scan is clean.
