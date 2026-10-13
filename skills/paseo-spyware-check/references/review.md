# Extended scanner and manual review workflow

This skill checks a GitHub URL or local repo for suspicious code before the user
installs or runs it. It is a risk triage workflow, not a guarantee that code is
safe.

The scanner is intentionally independent of Paseo's daemon, MCP tool names,
agent profiles, and workspace lifecycle. Paseo compatibility depends only
on the skill being installed and discovered; scanning remains a local,
read-only helper workflow.

## Third-party scanners

This skill integrates with external open-source scanner CLIs when they are
installed locally. Paseobility does not vendor or redistribute those scanner
binaries or rule sets.

`scripts/spyware-check.py` is the dependency-free, cross-platform scanner.
Scanner schema v2 produces an integrity-digested JSON receipt, a versioned
local security-policy decision, an immutable GitHub commit/tree/path or local
snapshot, severity counts, stable finding IDs, and explicit scan/truncation
metadata. The shell and PowerShell helpers provide the broader human-review
workflow and may use optional third-party scanners.

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
- Treat Markdown/README/docs/examples as documentation: dangerous examples are
  informational, while actual configuration/executable content is evaluated for
  capabilities and blocking canaries. Only actual lifecycle fields in
  `package.json` are lifecycle findings.
- API-key variable names declare credential capability; they are not automatically
  High. Actual token/private-key material, executable remote shell pipes, and
  persistence canaries are blocking.

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
4. On Windows, run the bundled PowerShell helper when available:
   ```powershell
   .\<skill-dir>\scripts\spyware-check.ps1 -Target <url-or-path>
   ```
5. Review high-signal files manually.
6. Produce a verdict with evidence and limitations.

## Bundled macOS/Linux helper

The helper never executes target project code. It:

- clones GitHub URLs into a temporary directory
- inventories risky files
- runs optional scanners if installed
- runs `rg` fallback heuristics
- classifies fallback findings as `High`, `Medium`, or `Info`
- marks scanner documentation/self-reference matches as `Info`
- summarizes `High`, `Medium`, and `Info` counts with a verdict hint
- writes a Markdown report
- exits nonzero when required temporary/report setup or report writes fail

An optional scanner's nonzero exit is recorded in `tools.log` and does not
prevent the remaining scanners or fallback heuristics from running. Do not
interpret a missing report or a nonzero helper exit as a clean scan.

Use:

```bash
bash <skill-dir>/scripts/spyware-check.sh --target https://github.com/owner/repo
bash <skill-dir>/scripts/spyware-check.sh --target /path/to/repo --out /tmp/paseo-spyware-report
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
bash <skill-dir>/scripts/install-scanners.sh --dry-run
```

Only after approval, run:

```bash
bash <skill-dir>/scripts/install-scanners.sh --yes
```

The installer prefers Homebrew when present and never uses `sudo`, remote shell
pipes, or target-repo code.

## Windows PowerShell workflow

Prefer the bundled helper:

```powershell
.\<skill-dir>\scripts\spyware-check.ps1 -Target https://github.com/owner/repo
.\<skill-dir>\scripts\spyware-check.ps1 -Target C:\path\to\repo -Out $env:TEMP\paseo-spyware-report
```

The PowerShell helper follows the same safety model: clone or inspect, do not
execute target project code, run optional scanners only when installed, and
write `report.md` with the same `Finding Summary` and classified findings table.

To preview Windows scanner installation commands:

```powershell
.\<skill-dir>\scripts\install-scanners.ps1 -DryRun
```

Only after approval:

```powershell
.\<skill-dir>\scripts\install-scanners.ps1 -Yes
```

The installer does not use remote shell pipes. It only runs planned package
manager commands and leaves uncertain tools as manual guidance.

Manual fallback:

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
$pattern = @(
  'postinstall'
  'preinstall'
  'prepare'
  'curl .*\|.*sh'
  'wget .*\|.*sh'
  'Invoke-Expression'
  '\biex\b'
  'DownloadString'
  'EncodedCommand'
  'Start-Process.*Hidden'
  'New-ScheduledTask'
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
  'child_process'
  'eval\('
  'Function\('
  'base64'
  'atob'
  'Buffer\.from'
  'process\.env'
  '\.ssh'
  '\.aws'
  'GITHUB_TOKEN'
  'NPM_TOKEN'
  'OPENAI_API_KEY'
  'ANTHROPIC_API_KEY'
) -join '|'

Get-ChildItem -LiteralPath $repo -Recurse -File |
  Where-Object {
    $_.FullName -match 'package\.json$|pnpm-lock\.yaml$|yarn\.lock$|package-lock\.json$|Cargo\.toml$|go\.mod$|pyproject\.toml$|requirements.*\.txt$|Makefile$|Dockerfile$|\.github\\workflows\\.*\.ya?ml$|\.sh$|\.ps1$|\.js$|\.ts$|\.py$'
  } |
  Select-String -Pattern $pattern |
  Select-Object Path, LineNumber
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

## Self-reference handling

Scanner docs and scanner source may contain strings like `GITHUB_TOKEN`,
`child_process`, `curl | sh`, or `EncodedCommand` because they describe what to
find. Do not hide those matches. Classify them as `Info` when the path is this
skill's README/SKILL/script documentation, and explain that they are
self-references rather than target-repo behavior.

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

When a bundled helper report exists, start from its `Finding Summary` counts but
do not treat the helper's verdict hint as final without reviewing the evidence.

## Current optional scanner contract

- Gitleaks 8.19+ uses `dir` for the current filesystem; `git` scans Git history.
  Shallow clones do not establish full-history secret coverage. `detect` is deprecated.
- OSV-Scanner v2 uses `scan source --no-resolve --output-file`; do not invoke
  `fix` on untrusted projects, since it can invoke package-manager behavior.
- Semgrep Registry rules still require a network download; `--metrics=off`
  suppresses rule metrics but does not make the scan offline. OSV online matches
  can disclose package/version inventory; Trivy can fetch databases.
- TruffleHog retains `--no-verification`; do not validate discovered credentials
  against external services. Its JSON can contain raw secrets.
- Inspect tool versions/help when an installed tool rejects these flags. Record
  that tool as failed/incompatible, never count it as a clean pass or install a
  replacement silently. Incomplete/offline database coverage stays explicit.
- Raw matches, logs and third-party JSON are private local evidence. The helper
  report omits source-line content, but URLs/paths/tool logs can still be sensitive;
  review and redact them before sharing. Do not upload the report directory wholesale.

Official references: [Gitleaks](https://github.com/gitleaks/gitleaks),
[OSV v2 usage](https://google.github.io/osv-scanner/usage/),
[OSV offline mode](https://google.github.io/osv-scanner/usage/offline-mode/),
[Semgrep metrics](https://semgrep.dev/docs/metrics),
[TruffleHog](https://github.com/trufflesecurity/trufflehog).
