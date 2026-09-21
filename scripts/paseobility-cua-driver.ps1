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
# Pinned upstream source reviewed at the pin
# (libs/cua-driver/scripts/install.ps1): this helper passes -NoAutoStart
# -NoPathUpdate, so the installer registers no autostart Scheduled Task and
# starts no daemon on a clean host; it only downloads the release and retargets
# directory junctions. OS permission grants stay manual.
# Source-reviewed on macOS; not runtime-executed there.
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

function Get-DriverBinary {
  if ($DriverBin -and (Test-Path -LiteralPath $DriverBin)) { return $DriverBin }
  $cmd = Get-Command "cua-driver" -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($name in @("cua-driver.exe", "cua-driver")) {
    $candidate = Join-Path $BinDir $name
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
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
  Write-Host ("[cua-driver] dry-run: would fetch pinned installer scripts at {0} and run install.ps1 -NoAutoStart -NoPathUpdate with CUA_DRIVER_RS_INSTALL_DIR={1}" -f $PinSha, $BinDir)
  exit 0
}

$tmp = $null
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

  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  # The upstream installer takes its visible bin dir from this env var; it has
  # no -BinDir parameter. Keep the requested dir out of PATH and out of the
  # autostart Scheduled Task.
  $env:CUA_DRIVER_RS_INSTALL_DIR = $BinDir
  $env:CUA_DRIVER_RS_VERSION = $Version
  $env:CUA_DRIVER_RS_NO_MODIFY_PATH = "1"
  & (Join-Path $src "install.ps1") -NoAutoStart -NoPathUpdate
  if ($LASTEXITCODE -ne 0) {
    throw ("[cua-driver] upstream installer exited {0}" -f $LASTEXITCODE)
  }
} catch {
  Write-Host ("[cua-driver] {0}" -f $_) -ForegroundColor Red
  Write-Host "[cua-driver] runtime setup failed: installation may be incomplete (partial files possible)." -ForegroundColor Red
  exit 4
} finally {
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
