param(
  [switch]$DryRun,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

if (-not $DryRun -and -not $Yes) {
  throw "Choose -DryRun or -Yes."
}

function Test-Command {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Show-Status {
  foreach ($tool in @("gitleaks", "trufflehog", "semgrep", "osv-scanner", "trivy", "shellcheck", "yara", "Invoke-ScriptAnalyzer")) {
    $cmd = Get-Command $tool -ErrorAction SilentlyContinue
    if ($cmd) {
      Write-Host "[installed] $tool -> $($cmd.Source)"
    } else {
      Write-Host "[missing]   $tool"
    }
  }
}

$planned = New-Object System.Collections.Generic.List[string]
$manual = New-Object System.Collections.Generic.List[string]

if (Test-Command "winget") {
  $planned.Add("winget install --id Gitleaks.Gitleaks -e")
  $planned.Add("winget install --id AquaSecurity.Trivy -e")
  $manual.Add("winget search ShellCheck")
  $manual.Add("winget search YARA")
} else {
  $manual.Add("Install WinGet/App Installer first, then install Gitleaks and Trivy from the official package source.")
}

if (Test-Command "pipx") {
  $planned.Add("pipx install semgrep")
} elseif (Test-Command "uv") {
  $planned.Add("uv tool install semgrep")
} elseif (Test-Command "python") {
  $manual.Add("python -m pip install --user semgrep")
} else {
  $manual.Add("Install Python plus pipx or uv to install Semgrep.")
}

if (Test-Command "go") {
  $manual.Add("go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest")
  $manual.Add("go install github.com/trufflesecurity/trufflehog/v3@latest")
} else {
  $manual.Add("Install OSV-Scanner and TruffleHog from their official release or package-manager instructions.")
}

Write-Host "== Current scanner status =="
Show-Status
Write-Host ""
Write-Host "== Planned automatic commands =="
foreach ($cmd in $planned) {
  Write-Host $cmd
}
Write-Host ""
Write-Host "== Manual guidance =="
foreach ($cmd in $manual) {
  Write-Host $cmd
}

if ($DryRun) {
  Write-Host ""
  Write-Host "[dry-run] No changes made."
  exit 0
}

foreach ($cmd in $planned) {
  Write-Host "[run] $cmd"
  cmd.exe /d /s /c $cmd
}

Write-Host ""
Write-Host "== Scanner status after install =="
Show-Status
