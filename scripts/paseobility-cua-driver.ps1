# Ensure the trycua Cua Driver exists for the paseo-cua skill.
#
# Idempotent: reuses an existing working cua-driver and never auto-upgrades it.
# A candidate that exists but fails `cua-driver --version` is reported as broken
# and left untouched (exit 5); it is never overwritten or upgraded.
#
# Downloads the pinned upstream installer scripts (install.ps1 plus the helper
# module it imports) into a local temporary directory and runs them there
# (never a blind `irm | iex`, never a rolling secondary module). It never edits
# PATH or registers MCP config.
#
# The pinned upstream installer requires its visible bin dir to be free because
# it places a directory junction there, and `Ensure-Junction` refuses an
# existing non-junction directory (exit 1). The shared bin dir often already
# exists as a real directory holding unrelated files, so this helper never
# points upstream at it: upstream installs into a private, Paseobility-owned
# staging directory, and only the executable set (cua-driver.exe,
# cua-driver-uia.exe, cua-cursor-theme.exe) is published into the shared bin
# dir afterwards. Existing files there are preserved; a differing collision
# aborts and rolls back only the files this run added.
#
# Pinned upstream source reviewed at the pin
# (libs/cua-driver/scripts/install.ps1): this helper passes -NoAutoStart
# -NoPathUpdate, so the installer registers no autostart Scheduled Task and
# starts no daemon on a clean host; it only downloads the release and retargets
# directory junctions. OS permission grants stay manual.
# Source-reviewed on macOS; not runtime-executed there. The offline fixture
# tests in tests/test_cua_driver_runtime.ps1 exercise it on Windows.
[CmdletBinding()]
param(
  [switch]$Check,
  [switch]$DryRun,
  [string]$BinDir = $(if ($env:PASEOBILITY_CUA_BIN_DIR) { $env:PASEOBILITY_CUA_BIN_DIR } else { Join-Path $env:USERPROFILE ".local\bin" }),
  [string]$Version = $(if ($env:PASEOBILITY_CUA_PIN_VERSION) { $env:PASEOBILITY_CUA_PIN_VERSION } else { "0.28.2" })
)

$ErrorActionPreference = "Stop"

$PinSha = $(if ($env:PASEOBILITY_CUA_PIN_SHA) { $env:PASEOBILITY_CUA_PIN_SHA } else { "9bbfa7dd3e27ca7f1861ede70aaca390174493f9" })
$RawBase = $(if ($env:PASEOBILITY_CUA_RAW_BASE) { $env:PASEOBILITY_CUA_RAW_BASE } else { "https://raw.githubusercontent.com/trycua/cua/$PinSha/libs/cua-driver/scripts" })
$InstallerDir = $env:PASEOBILITY_CUA_INSTALLER_DIR
$DriverBin = $env:PASEOBILITY_CUA_DRIVER_BIN
# Optional expected SHA-256 digests for the pinned installer scripts. When set,
# a mismatch aborts before execution. Upstream publishes no checksums, so these
# are only checked when an operator supplies them out of band.
$PinnedFiles = @("install.ps1", "_install-common.psm1")
$ExpectedDigests = @{
  "install.ps1"          = $env:PASEOBILITY_CUA_INSTALL_SHA256
  "_install-common.psm1" = $env:PASEOBILITY_CUA_COMMON_SHA256
}
# The executable set the upstream release exposes. cua-driver.exe is required;
# cua-driver-uia.exe ships from 0.2.8 and cua-cursor-theme.exe from 0.12.7, so
# for a supported version a missing helper is a real failure, not a pass.
$ExposedDriverFiles = @("cua-driver.exe", "cua-driver-uia.exe", "cua-cursor-theme.exe")
# Process environment the upstream installer reads. Snapshotted before the run
# and restored in `finally` so an in-process call does not leak into the caller.
$DriverEnvNames = @("CUA_DRIVER_RS_INSTALL_DIR", "CUA_DRIVER_RS_VERSION", "CUA_DRIVER_RS_NO_MODIFY_PATH")
$DriverEnvSaved = $null

function Get-DriverBinary {
  # An explicit PASEOBILITY_CUA_DRIVER_BIN is authoritative: the caller pinned
  # the driver location, so a missing file means "not found" rather than a reason
  # to fall back to PATH or the LOCALAPPDATA location.
  if ($DriverBin) {
    if (Test-Path -LiteralPath $DriverBin) { return $DriverBin }
    return $null
  }
  $cmd = Get-Command "cua-driver" -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  # The installer publishes to -BinDir (~/.local/bin by default). Also accept the
  # per-user LOCALAPPDATA location some hosts use, since the installer never
  # edits PATH.
  foreach ($dir in (Get-DriverBinDirs)) {
    foreach ($name in @("cua-driver.exe", "cua-driver")) {
      $candidate = Join-Path $dir $name
      if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
  }
  return $null
}

function Get-DriverBinDirs {
  $dirs = @($BinDir)
  if ($env:LOCALAPPDATA) {
    $alt = Join-Path $env:LOCALAPPDATA "Programs\Cua\cua-driver\bin"
    if ($alt -ne $BinDir) { $dirs += $alt }
  }
  return $dirs
}

# The helper executables a supported driver version must expose. A missing one is
# reported as a failure rather than silently accepted as a valid install.
function Get-RequiredDriverFiles([string]$Version) {
  $required = @("cua-driver.exe")
  $parsed = $null
  try { $parsed = [version]$Version } catch { $parsed = $null }
  if ($parsed -and $parsed -ge [version]"0.2.8") { $required += "cua-driver-uia.exe" }
  if ($parsed -and $parsed -ge [version]"0.12.7") { $required += "cua-cursor-theme.exe" }
  return $required
}

# Return the first --version line only when the command exits 0 with output.
# A broken candidate, an empty output, or a failed launch returns $null.
function Get-DriverVersion([string]$Path) {
  $global:LASTEXITCODE = 0
  try {
    $out = & $Path --version 2>$null | Select-Object -First 1
  } catch {
    return $null
  }
  if ($LASTEXITCODE -ne 0) { return $null }
  if ([string]::IsNullOrWhiteSpace($out)) { return $null }
  return ([string]$out).Trim()
}

function Get-FileDigest([string]$Path) {
  if (Get-Command Get-FileHash -ErrorAction SilentlyContinue) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  return $null
}

function Test-PinnedDigests([string]$Dir, [bool]$Verify) {
  foreach ($f in $PinnedFiles) {
    $path = Join-Path $Dir $f
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $digest = Get-FileDigest $path
    Write-Host ("[cua-driver] digest {0}  {1}" -f $digest, $f)
    if (-not $Verify) { continue }
    $expected = $ExpectedDigests[$f]
    if (-not $expected) { continue }
    if (-not $digest) {
      throw "[cua-driver] no SHA-256 tool available to verify $f"
    }
    if ($digest -ne $expected.ToLowerInvariant()) {
      throw "[cua-driver] digest mismatch for $f (expected $expected, got $digest)"
    }
    Write-Host ("[cua-driver] verified pinned digest for {0}" -f $f)
  }
}

function Save-DriverEnv {
  $script:DriverEnvSaved = @{}
  foreach ($name in $DriverEnvNames) {
    $script:DriverEnvSaved[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
  }
}

function Restore-DriverEnv {
  if (-not $script:DriverEnvSaved) { return }
  foreach ($name in $DriverEnvNames) {
    $previous = $script:DriverEnvSaved[$name]
    if ($null -eq $previous) {
      Remove-Item -Path ("Env:" + $name) -ErrorAction SilentlyContinue
    } else {
      Set-Item -Path ("Env:" + $name) -Value $previous
    }
  }
  $script:DriverEnvSaved = $null
}

# Remove the private staging tree. The staged bin dir is a directory junction
# created by the upstream installer, so delete the link itself and never its
# target: recursing through a junction would delete host release files.
function Remove-StageDir([string]$StageRoot, [string]$StageBin) {
  if ($StageBin -and (Test-Path -LiteralPath $StageBin)) {
    $item = Get-Item -LiteralPath $StageBin -Force -ErrorAction SilentlyContinue
    if ($item -and (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
      [System.IO.Directory]::Delete($StageBin, $false)
    } else {
      Remove-Item -LiteralPath $StageBin -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
  if ($StageRoot -and (Test-Path -LiteralPath $StageRoot)) {
    Remove-Item -LiteralPath $StageRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Publish the staged executable set into the shared bin dir. Never overwrites
# an existing file: identical content is left alone (idempotent), and a
# differing collision throws. Returns the destinations this run created so the
# caller can roll them back. On any failure the files this run added are removed
# and every private temp name is cleaned up, leaving the shared dir as found.
function Publish-DriverBinaries([string]$StageBin, [string]$Target, [string[]]$Required) {
  $toPublish = @()
  foreach ($name in $ExposedDriverFiles) {
    $candidate = Join-Path $StageBin $name
    if (Test-Path -LiteralPath $candidate) {
      $toPublish += $candidate
    } elseif ($Required -contains $name) {
      throw ("[cua-driver] staged install did not produce required {0} for the requested version" -f $name)
    }
  }

  # Create the shared bin dir only after a successful staged install. Never
  # delete or replace anything already inside it.
  New-Item -ItemType Directory -Force -Path $Target | Out-Null
  $written = @()
  $temps = @()
  try {
    foreach ($source in $toPublish) {
      $name = Split-Path -Leaf $source
      $dest = Join-Path $Target $name
      if (Test-Path -LiteralPath $dest) {
        $sourceHash = Get-FileDigest $source
        $destHash = Get-FileDigest $dest
        if ($sourceHash -and $destHash -and ($sourceHash -eq $destHash)) {
          Write-Host ("[cua-driver] {0} already present with identical content; leaving it in place" -f $name)
          continue
        }
        throw ("[cua-driver] refusing to overwrite existing {0} in the shared bin dir; move or remove it manually" -f $name)
      }
      # Copy to a private temp name first, then rename into place so the shared
      # dir never observes a partially written binary.
      $temp = Join-Path $Target ("." + $name + "." + [guid]::NewGuid().ToString("N") + ".tmp")
      $temps += $temp
      Copy-Item -LiteralPath $source -Destination $temp -Force
      Move-Item -LiteralPath $temp -Destination $dest
      $written += $dest
      Write-Host ("[cua-driver] published {0}" -f $name)
    }
  } catch {
    foreach ($path in $written) {
      Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
    throw
  } finally {
    # Clean up any private temp name that still exists (a failed copy/move must
    # not leak .tmp files). Only names this run created are touched.
    foreach ($path in $temps) {
      if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
      }
    }
  }
  return $written
}

$existing = Get-DriverBinary
if ($existing) {
  $existingVersion = Get-DriverVersion $existing
  if ($existingVersion) {
    Write-Host ("[cua-driver] present: {0} ({1})" -f $existing, $existingVersion)
    exit 0
  }
  Write-Host ("[cua-driver] {0} exists but ``cua-driver --version`` failed; treating it as broken and leaving it untouched." -f $existing) -ForegroundColor Red
  Write-Host "[cua-driver] fix or remove it, or pass -SkipCuaDriver for a skills-only install; this helper will not overwrite or upgrade it." -ForegroundColor Red
  exit 5
}

if ($Check) {
  Write-Host ("[cua-driver] missing (not on PATH and not under {0})" -f $BinDir)
  exit 3
}

Write-Host ("[cua-driver] not found; installing pinned Cua Driver {0}" -f $Version)

if ($DryRun) {
  Write-Host ("[cua-driver] dry-run: would fetch pinned installer scripts at {0} and run install.ps1 -NoAutoStart -NoPathUpdate against a private staging bin dir, then publish {1} into {2}" -f $PinSha, ($ExposedDriverFiles -join ", "), $BinDir)
  exit 0
}

$tmp = $null
$stageRoot = $null
$stageBin = $null
try {
  if ($InstallerDir) {
    $src = $InstallerDir
    if (-not (Test-Path -LiteralPath (Join-Path $src "install.ps1"))) {
      throw "[cua-driver] installer script missing: $src\install.ps1"
    }
    Write-Host ("[cua-driver] using provided installer dir {0}" -f $src)
  } else {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("paseobility-cua-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $src = $tmp
    foreach ($f in $PinnedFiles) {
      $dest = Join-Path $src $f
      Invoke-RestMethod -Uri "$RawBase/$f" -OutFile $dest -UseBasicParsing
      if (-not (Test-Path -LiteralPath $dest) -or ((Get-Item -LiteralPath $dest).Length -eq 0)) {
        throw "[cua-driver] downloaded file is empty: $f"
      }
    }
    Write-Host ("[cua-driver] downloaded installer scripts at pinned commit {0}" -f $PinSha)
    Test-PinnedDigests $src $true
  }

  # Private, Paseobility-owned staging. Do NOT pre-create the staged bin dir:
  # upstream creates it and turns it into a directory junction, and a
  # pre-existing real directory there would be refused. The shared bin dir is
  # never handed to upstream.
  $stageRoot = Join-Path ([IO.Path]::GetTempPath()) ("paseobility-cua-stage-" + [guid]::NewGuid().ToString("N"))
  $stageBin = Join-Path $stageRoot "bin"
  New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

  Save-DriverEnv
  # The upstream installer takes its visible bin dir from this env var; it has
  # no -BinDir parameter. Keep the requested dir out of PATH and out of the
  # autostart Scheduled Task.
  $env:CUA_DRIVER_RS_INSTALL_DIR = $stageBin
  $env:CUA_DRIVER_RS_VERSION = $Version
  $env:CUA_DRIVER_RS_NO_MODIFY_PATH = "1"
  & (Join-Path $src "install.ps1") -NoAutoStart -NoPathUpdate
  if ($LASTEXITCODE -ne 0) {
    throw ("[cua-driver] upstream installer exited {0}" -f $LASTEXITCODE)
  }

  $required = Get-RequiredDriverFiles $Version

  # Validate the staged main binary BEFORE touching the shared bin dir, so a
  # broken new build never reaches it.
  $stagedMain = Join-Path $stageBin "cua-driver.exe"
  if (-not (Test-Path -LiteralPath $stagedMain)) {
    throw "[cua-driver] staged install did not produce cua-driver.exe"
  }
  if (-not (Get-DriverVersion $stagedMain)) {
    throw "[cua-driver] staged cua-driver.exe failed `--version`; aborting before publication"
  }

  $published = Publish-DriverBinaries $stageBin $BinDir $required

  # Final validation of the published binary. If it fails, remove only the files
  # this run created and leave any pre-existing content untouched.
  $publishedMain = Join-Path $BinDir "cua-driver.exe"
  if (-not (Test-Path -LiteralPath $publishedMain) -or -not (Get-DriverVersion $publishedMain)) {
    foreach ($path in $published) {
      Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
    throw "[cua-driver] published cua-driver.exe failed `--version`; rolled back the files this run added"
  }
} catch {
  Write-Host ("[cua-driver] {0}" -f $_) -ForegroundColor Red
  Write-Host "[cua-driver] runtime setup failed: installation may be incomplete (partial files possible). Files this run added to the shared bin dir were rolled back; pre-existing files were left untouched." -ForegroundColor Red
  exit 4
} finally {
  Restore-DriverEnv
  Remove-StageDir $stageRoot $stageBin
  if ($tmp -and (Test-Path -LiteralPath $tmp)) {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$installed = Get-DriverBinary
if ($installed) {
  $installedVersion = Get-DriverVersion $installed
  if ($installedVersion) {
    Write-Host ("[cua-driver] installed: {0} ({1})" -f $installed, $installedVersion)
    exit 0
  }
  Write-Host ("[cua-driver] runtime setup failed: cua-driver exists at {0} but ``--version`` failed; installation may be incomplete (partial files possible)." -f $installed) -ForegroundColor Red
  exit 4
}

Write-Host ("[cua-driver] runtime setup failed: cua-driver is not visible on PATH or under {0} after install; installation may be incomplete (partial files possible)." -f $BinDir) -ForegroundColor Red
exit 4
