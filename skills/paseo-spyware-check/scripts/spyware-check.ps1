param(
  [Parameter(Mandatory = $true)]
  [string]$Target,
  [string]$Out,
  [switch]$Keep
)

$ErrorActionPreference = "Stop"

function Write-ReportLine {
  param([string]$Text = "")
  Add-Content -LiteralPath $script:ReportPath -Value $Text -Encoding UTF8
}

function Test-Url {
  param([string]$Value)
  return $Value -match '^(https?://|git@)'
}

function Get-ToolStatus {
  param([string]$Name)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) {
    return "available: $($cmd.Source)"
  }
  return "missing"
}

function Invoke-OptionalTool {
  param(
    [string]$Name,
    [string[]]$Command
  )
  Add-Content -LiteralPath $script:ToolsLogPath -Value "== $Name ==" -Encoding UTF8
  try {
    $exe = $Command[0]
    $args = @()
    if ($Command.Count -gt 1) {
      $args = $Command[1..($Command.Count - 1)]
    }
    & $exe @args *>> $script:ToolsLogPath
    Add-Content -LiteralPath $script:ToolsLogPath -Value "exit=$LASTEXITCODE`n" -Encoding UTF8
  } catch {
    Add-Content -LiteralPath $script:ToolsLogPath -Value "error=$($_.Exception.Message)`n" -Encoding UTF8
  }
}

function Get-Severity {
  param(
    [string]$RelativePath,
    [string]$Line
  )

  if ($RelativePath -match '^(README\.md|README\..*|skills[\\/]paseo-spyware-check[\\/]SKILL\.md|skills[\\/]paseo-spyware-check[\\/]scripts[\\/].*)$') {
    return @("Info", "self-reference or scanner documentation")
  }

  if ($Line -match 'curl .*\|.*(sh|bash|zsh)|wget .*\|.*(sh|bash|zsh)|EncodedCommand|DownloadString|Invoke-Expression|Start-Process.*Hidden|New-ScheduledTask|CurrentVersion\\Run|launchctl|LaunchAgents|crontab|systemctl') {
    return @("High", "remote execution, hidden execution, or persistence indicator")
  }
  if ($Line -match '\.ssh|\.aws|\.npmrc|GITHUB_TOKEN|NPM_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|api[_-]?key|webhook|pastebin|discord(app)?\.com/api/webhooks') {
    return @("High", "credential or exfiltration indicator")
  }
  if ($Line -match 'preinstall|postinstall|prepare|prepublish') {
    return @("Medium", "install-time script indicator")
  }
  if ($Line -match 'child_process|eval\(|Function\(|base64|atob|Buffer\.from|process\.env') {
    return @("Medium", "dynamic execution, obfuscation, or environment access indicator")
  }
  return @("Medium", "suspicious static pattern")
}

$WorkDir = Join-Path ([IO.Path]::GetTempPath()) ("paseo-spyware-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

if ([string]::IsNullOrWhiteSpace($Out)) {
  $Out = Join-Path ([IO.Path]::GetTempPath()) ("paseo-spyware-report-" + [guid]::NewGuid().ToString("N"))
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null

try {
  if (Test-Url $Target) {
    $Repo = Join-Path $WorkDir "repo"
    $CloneLog = Join-Path $Out "git-clone.log"
    git clone --depth 1 $Target $Repo *> $CloneLog
    if ($LASTEXITCODE -ne 0) {
      throw "git clone failed; see $CloneLog"
    }
  } else {
    $Repo = (Resolve-Path -LiteralPath $Target).Path
  }

  $script:ReportPath = Join-Path $Out "report.md"
  $script:ToolsLogPath = Join-Path $Out "tools.log"
  "" | Set-Content -LiteralPath $script:ToolsLogPath -Encoding UTF8

  "# Paseo Spyware Check Report" | Set-Content -LiteralPath $script:ReportPath -Encoding UTF8
  Write-ReportLine
  Write-ReportLine "- target: ``$Target``"
  Write-ReportLine "- repo: ``$Repo``"
  Write-ReportLine "- generated: ``$((Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ"))``"
  try {
    $commit = git -C $Repo rev-parse HEAD 2>$null
    if ($commit) {
      Write-ReportLine "- commit: ``$commit``"
    }
  } catch {}

  Write-ReportLine
  Write-ReportLine "## Scanner Availability"
  foreach ($tool in @("git", "gitleaks", "trufflehog", "semgrep", "osv-scanner", "trivy", "Invoke-ScriptAnalyzer")) {
    Write-ReportLine "- ${tool}: $(Get-ToolStatus $tool)"
  }

  $pattern = @(
    'postinstall',
    'preinstall',
    'prepare',
    'prepublish',
    'curl .*\|.*sh',
    'wget .*\|.*sh',
    'Invoke-Expression',
    '\biex\b',
    'DownloadString',
    'EncodedCommand',
    'Start-Process.*Hidden',
    'New-ScheduledTask',
    'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    'child_process',
    'eval\(',
    'Function\(',
    'base64',
    'atob',
    'Buffer\.from',
    'process\.env',
    '\.ssh',
    '\.aws',
    '\.npmrc',
    'GITHUB_TOKEN',
    'NPM_TOKEN',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'api[_-]?key',
    'webhook',
    'pastebin',
    'discord(app)?\.com/api/webhooks'
  ) -join '|'

  [void][regex]::new($pattern)

  $files = Get-ChildItem -LiteralPath $Repo -Recurse -File -Force |
    Where-Object {
      $_.FullName -notmatch '[\\/]\.git[\\/]|[\\/]node_modules[\\/]|[\\/]vendor[\\/]' -and
      $_.FullName -match 'package\.json$|pnpm-lock\.yaml$|yarn\.lock$|package-lock\.json$|Cargo\.toml$|go\.mod$|pyproject\.toml$|requirements.*\.txt$|Makefile$|Dockerfile$|\.github[\\/]workflows[\\/].*\.ya?ml$|\.sh$|\.ps1$|\.js$|\.ts$|\.py$'
    }

  Write-ReportLine
  Write-ReportLine "## Inventory"
  Write-ReportLine
  Write-ReportLine "### High-signal files"
  foreach ($file in $files) {
    Write-ReportLine "- $($file.FullName)"
  }

  if (Get-Command gitleaks -ErrorAction SilentlyContinue) {
    Invoke-OptionalTool "gitleaks" @("gitleaks", "detect", "--source", $Repo, "--redact", "--report-format", "json", "--report-path", (Join-Path $Out "gitleaks.json"))
  }
  if (Get-Command trufflehog -ErrorAction SilentlyContinue) {
    Invoke-OptionalTool "trufflehog" @("trufflehog", "filesystem", $Repo, "--no-verification", "--json")
  }
  if (Get-Command semgrep -ErrorAction SilentlyContinue) {
    Invoke-OptionalTool "semgrep" @("semgrep", "scan", "--config", "p/security-audit", "--json", "--output", (Join-Path $Out "semgrep.json"), $Repo)
  }
  if (Get-Command osv-scanner -ErrorAction SilentlyContinue) {
    Invoke-OptionalTool "osv-scanner" @("osv-scanner", "scan", "source", "-r", $Repo, "--format", "json", "--output", (Join-Path $Out "osv-scanner.json"))
  }
  if (Get-Command trivy -ErrorAction SilentlyContinue) {
    Invoke-OptionalTool "trivy" @("trivy", "fs", "--scanners", "vuln,secret,misconfig", "--format", "json", "--output", (Join-Path $Out "trivy.json"), $Repo)
  }

  $scanResults = $files | Select-String -Pattern $pattern

  $classifiedRows = @()
  if ($scanResults) {
    foreach ($match in $scanResults) {
      $relative = $match.Path
      if ($relative.StartsWith($Repo)) {
        $relative = $relative.Substring($Repo.Length).TrimStart([char[]]@('\', '/'))
      }
      $evidence = "${relative}:$($match.LineNumber):$($match.Line.Trim())"
      $safeEvidence = $evidence.Replace("|", "\|")
      $classification = Get-Severity -RelativePath $relative -Line $match.Line
      $classifiedRows += [PSCustomObject]@{
        Severity = $classification[0]
        Evidence = $safeEvidence
        Reason = $classification[1]
      }
    }
  }

  $highCount = @($classifiedRows | Where-Object { $_.Severity -eq "High" }).Count
  $mediumCount = @($classifiedRows | Where-Object { $_.Severity -eq "Medium" }).Count
  $infoCount = @($classifiedRows | Where-Object { $_.Severity -eq "Info" }).Count
  if ($highCount -gt 0) {
    $verdictHint = "High"
  } elseif ($mediumCount -gt 0) {
    $verdictHint = "Medium"
  } else {
    $verdictHint = "Low"
  }

  Write-ReportLine
  Write-ReportLine "## Finding Summary"
  Write-ReportLine
  Write-ReportLine "- Verdict hint: ``$verdictHint``"
  Write-ReportLine "- High: ``$highCount``"
  Write-ReportLine "- Medium: ``$mediumCount``"
  Write-ReportLine "- Info: ``$infoCount``"
  Write-ReportLine
  Write-ReportLine "Treat this as triage output. Final judgement still requires manual review of the evidence and optional scanner logs."

  Write-ReportLine
  Write-ReportLine "## Classified Findings"
  Write-ReportLine
  Write-ReportLine "| Severity | Evidence | Reason |"
  Write-ReportLine "| --- | --- | --- |"
  if ($classifiedRows.Count -gt 0) {
    foreach ($row in $classifiedRows) {
      Write-ReportLine "| $($row.Severity) | ``$($row.Evidence)`` | $($row.Reason) |"
    }
  } else {
    Write-ReportLine "| Info | No fallback pattern matches found. | Static fallback scan was clean. |"
  }

  Write-ReportLine
  Write-ReportLine "## Notes"
  Write-ReportLine
  Write-ReportLine "- This report is static triage, not proof of safety."
  Write-ReportLine "- The target repo's code was not executed."
  Write-ReportLine "- Review optional scanner logs in ``$Out``."

  Write-Output $script:ReportPath
} finally {
  if (-not $Keep) {
    Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
