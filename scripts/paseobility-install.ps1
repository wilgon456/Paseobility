param(
  [string]$TargetHome = $env:USERPROFILE,
  [string[]]$Skill = @(),
  [switch]$WithClaude,
  [switch]$NoBackup,
  [switch]$NoPaseoCheck
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
  $backupRoot = Join-Path $BackupParent "Paseobility-$Version-$timestamp"
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

  if ($backupCount -gt 0) {
    Write-Status "backup" ("saved {0} existing skill(s) to {1}" -f $backupCount, $backupRoot)
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

Copy-Skills (Join-Path $TargetHome ".agents\skills") (Join-Path $TargetHome ".agents\skills-backups")

if ($WithClaude) {
  Copy-Skills (Join-Path $TargetHome ".claude\skills") (Join-Path $TargetHome ".claude\skills-backups")
} else {
  Write-Status "skip" "Claude skills not touched. Pass -WithClaude to install there."
}

if (-not $NoPaseoCheck) {
  $paseo = Find-PaseoCli
  if ($paseo) {
    Write-Status "paseo_cli" $paseo
  } else {
    Write-Status "paseo_cli" "not found; copying skills can still be complete"
  }
}

Write-Host ""
Write-Host "Done. Start a new agent session or reload integrations if the skills do not appear immediately."
