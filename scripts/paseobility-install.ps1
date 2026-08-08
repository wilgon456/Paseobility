param(
  [switch]$WithClaude,
  [switch]$NoPaseoCheck
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$SkillsDir = Join-Path $RepoRoot "skills"

function Write-Status {
  param(
    [string]$Name,
    [string]$Value
  )
  Write-Host "[$Name] $Value"
}

function Copy-Skills {
  param([string]$Target)

  if (-not (Test-Path $SkillsDir)) {
    throw "skills directory not found: $SkillsDir"
  }

  New-Item -ItemType Directory -Force $Target | Out-Null
  Copy-Item -Recurse -Force (Join-Path $SkillsDir "*") $Target
  Write-Status "install" "copied skills to $Target"
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
Write-Status "os" ([System.Runtime.InteropServices.RuntimeInformation]::OSDescription)
Write-Status "arch" ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString())

Copy-Skills (Join-Path $HOME ".agents\skills")

if ($WithClaude) {
  Copy-Skills (Join-Path $HOME ".claude\skills")
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
