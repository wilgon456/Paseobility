param(
  [string]$TargetHome = $env:USERPROFILE,
  [string[]]$Skill = @(),
  [switch]$WithClaude,
  [switch]$NoBackup,
  [switch]$MigrateSkills,
  [switch]$NoPaseoCheck,
  [switch]$SkipCuaDriver,
  [switch]$AllowHostRuntime
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$SkillsDir = Join-Path $RepoRoot "skills"
$VersionFile = Join-Path $RepoRoot "VERSION"
$Version = "dev"
if (Test-Path $VersionFile) {
  $Version = (Get-Content -LiteralPath $VersionFile -TotalCount 1).Trim()
}

if ([string]::IsNullOrWhiteSpace($TargetHome)) {
  throw "TargetHome is empty. Pass -TargetHome or ensure USERPROFILE is set."
}

function Write-Status {
  param(
    [string]$Name,
    [string]$Value
  )
  Write-Host "[$Name] $Value"
}

function Copy-Skills {
  param(
    [string]$Target,
    [string]$BackupParent
  )

  if (-not (Test-Path $SkillsDir)) {
    throw "skills directory not found: $SkillsDir"
  }

  New-Item -ItemType Directory -Force $Target | Out-Null
  $timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
  $backupRoot = Join-Path $BackupParent "Paseobility-$Version-$timestamp-$([guid]::NewGuid().ToString('N').Substring(0,8))"
  $backupCount = 0
  $skillDirs = @()
  if ($Skill.Count -gt 0) {
    foreach ($name in $Skill) {
      if ([string]::IsNullOrWhiteSpace($name)) {
        continue
      }
      $source = Join-Path $SkillsDir $name
      $skillFile = Join-Path $source "SKILL.md"
      if (-not (Test-Path $skillFile)) {
        throw "skill not found or missing SKILL.md: $name"
      }
      $skillDirs += $source
    }
  } else {
    $skillDirs = Get-ChildItem -LiteralPath $SkillsDir -Directory | Where-Object {
      Test-Path (Join-Path $_.FullName "SKILL.md")
    } | ForEach-Object { $_.FullName }
  }

  foreach ($source in $skillDirs) {
    $name = Split-Path -Leaf $source
    $dest = Join-Path $Target $name
    if ((Test-Path $dest) -and (-not $NoBackup)) {
      New-Item -ItemType Directory -Force $backupRoot | Out-Null
      Copy-Item -LiteralPath $dest -Destination $backupRoot -Recurse -Force
      $backupCount += 1
    }
    if (Test-Path $dest) {
      Remove-Item -LiteralPath $dest -Recurse -Force
    }
    Copy-Item -LiteralPath $source -Destination $Target -Recurse -Force
    Write-Status "install" ("copied {0} to {1}" -f $name, $Target)
  }

  if ($MigrateSkills) {
    foreach ($entry in $RetiredSkills.GetEnumerator()) {
      if (-not (Selected-Skill $entry.Value)) { continue }
      $retired = Join-Path $Target $entry.Key
      if (-not (Test-Path -LiteralPath $retired)) { continue }
      if ($entry.Value -and -not (Test-Path -LiteralPath (Join-Path $Target "$($entry.Value)/SKILL.md"))) {
        throw "Replacement missing; preserving $retired"
      }
      New-Item -ItemType Directory -Force $backupRoot | Out-Null
      $backupDest = Join-Path $backupRoot $entry.Key
      if (Test-Path -LiteralPath $backupDest) { throw "Backup collision: $backupDest" }
      Move-Item -LiteralPath $retired -Destination $backupDest
      $backupCount += 1
      Write-Status "migrate" "moved $retired to $backupDest"
    }
  }

  if ($backupCount -gt 0) {
    Write-Status "backup" ("saved {0} existing skill(s) to {1}" -f $backupCount, $backupRoot)
  }
}

$RetiredSkills = [ordered]@{
  "paseo-agent-tournament" = "paseo-orchestration"
  "paseo-session-brief" = "paseo-project"
  "paseo-project-bootstrap" = "paseo-project"
  "paseo-computer-use" = "paseo-browser"
  "paseo-skill-save" = ""
}

function Selected-Skill([string]$Name) {
  return ($Skill.Count -eq 0 -or $Skill -contains $Name)
}

function Check-Retired([string]$Target) {
  if (-not $MigrateSkills) { return }
  $rootItem = Get-Item -LiteralPath $Target -Force -ErrorAction SilentlyContinue
  if ($rootItem -and ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "Refusing linked skill root: $Target"
  }
  foreach ($entry in $RetiredSkills.GetEnumerator()) {
    if (-not (Selected-Skill $entry.Value)) { continue }
    if ($entry.Value -and -not (Test-Path -LiteralPath (Join-Path $SkillsDir "$($entry.Value)/SKILL.md"))) {
      throw "Replacement source missing: $($entry.Value)"
    }
    $dest = Join-Path $Target $entry.Key
    $item = Get-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
    if (-not $item) { continue }
    $skillFile = Join-Path $dest "SKILL.md"
    $skillItem = Get-Item -LiteralPath $skillFile -Force -ErrorAction SilentlyContinue
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        -not $skillItem -or ($skillItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "Refusing unrecognized retired skill: $dest"
    }
    $namePattern = '(?m)^name: [''" ]*' + [regex]::Escape($entry.Key) + '[''" ]*\r?$'
    $content = Get-Content -LiteralPath $skillFile -Raw
    if ($content -notmatch '\A---\r?\n(?<header>[\s\S]*?)\r?\n---(?:\r?\n|$)') {
      throw "Refusing unrecognized retired skill: $dest"
    }
    if ($Matches['header'] -notmatch $namePattern) {
      throw "Refusing unrecognized retired skill: $dest"
    }
  }
}

function Find-PaseoCli {
  $cmd = Get-Command "paseo" -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $candidates = @()
  foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
    if (-not [string]::IsNullOrWhiteSpace($base)) {
      if ($base -eq $env:LOCALAPPDATA) {
        $candidates += (Join-Path $base "Programs\Paseo\resources\bin\paseo.cmd")
      } else {
        $candidates += (Join-Path $base "Paseo\resources\bin\paseo.cmd")
      }
    }
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

Write-Status "repo" $RepoRoot
Write-Status "target_home" $TargetHome
Write-Status "os" ([System.Runtime.InteropServices.RuntimeInformation]::OSDescription)
Write-Status "arch" ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString())

Check-Retired (Join-Path $TargetHome ".agents\skills")
if ($WithClaude) { Check-Retired (Join-Path $TargetHome ".claude\skills") }
Copy-Skills (Join-Path $TargetHome ".agents\skills") (Join-Path $TargetHome ".agents\skills-backups")

if ($WithClaude) {
  Copy-Skills (Join-Path $TargetHome ".claude\skills") (Join-Path $TargetHome ".claude\skills-backups")
} else {
  Write-Status "skip" "Claude skills not touched. Pass -WithClaude to install there."
}

# Ensure the Cua Driver runtime when paseo-cua (or the full package) is selected.
# Idempotent: an existing driver is reused, never auto-upgraded.
$wantsRuntime = ($Skill.Count -eq 0 -or (Selected-Skill "paseo-cua"))
Write-Host ""
if (-not $wantsRuntime) {
  Write-Status "skip" "Cua Driver runtime not requested for this skill selection."
} elseif ($SkipCuaDriver) {
  Write-Status "skip" "Cua Driver runtime install skipped (-SkipCuaDriver)."
} elseif ($TargetHome -ne $env:USERPROFILE -and -not $AllowHostRuntime) {
  Write-Status "skip" "Cua Driver runtime install skipped for custom -TargetHome ($TargetHome); pass -AllowHostRuntime to install on the real host."
} else {
  # Host runtime: use the driver's normal host binary location (or the
  # PASEOBILITY_CUA_BIN_DIR test hook). The custom -TargetHome only redirects
  # the skill copy, so it must not redirect the driver.
  $runtimeStatus = "installed"
  try {
    & (Join-Path $ScriptDir "paseobility-cua-driver.ps1")
    if ($LASTEXITCODE -ne 0) { $runtimeStatus = "failed" }
  } catch {
    $runtimeStatus = "failed"
  }
  if ($runtimeStatus -eq "failed") {
    Write-Host ""
    Write-Host "Skills were copied, but the Cua Driver runtime setup failed." -ForegroundColor Red
    Write-Host "Installation may be incomplete (partial files possible). Resolve the error above and re-run, or pass -SkipCuaDriver to install skills only."
    exit 1
  }
}

if (-not $NoPaseoCheck) {
  $paseo = Find-PaseoCli
  if ($paseo) {
    Write-Status "paseo_cli" $paseo
    try {
      $paseoVersion = (& $paseo --version 2>$null | Select-Object -First 1)
      if (-not [string]::IsNullOrWhiteSpace($paseoVersion)) {
        Write-Status "paseo_version" $paseoVersion.Trim()
      } else {
        Write-Status "paseo_version" "unavailable"
      }
    } catch {
      Write-Status "paseo_version" "unavailable"
    }
  } else {
    Write-Status "paseo_cli" "not found; copying skills can still be complete"
  }
}

Write-Host ""
Write-Host "Done. Start a new agent session or reload integrations if the skills do not appear immediately."
