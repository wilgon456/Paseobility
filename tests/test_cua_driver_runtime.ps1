# Offline regression test for scripts/paseobility-cua-driver.ps1 and the native
# skill migration in scripts/paseobility-install.ps1, on Windows.
#
# No network, no real Cua install, no host change. The pinned upstream installer
# is replaced by a local fixture (PASEOBILITY_CUA_INSTALLER_DIR). The fixture
# reproduces the upstream junction precondition: it fails if the visible bin
# path already exists, and on success it creates a directory junction from the
# staging bin to a release dir (so the "delete a link, not its target" cleanup
# is actually exercised). The shared bin dir and temp dir are redirected with
# documented test hooks (PASEOBILITY_CUA_BIN_DIR, PASEOBILITY_CUA_DRIVER_BIN).
# $HOME / $env:USERPROFILE / $env:LOCALAPPDATA are never repurposed. PATH is
# replaced with an empty per-case dir and PASEOBILITY_CUA_DRIVER_BIN is pinned
# to a per-case path, so a real cua-driver on the operator's PATH or under
# LOCALAPPDATA can never be picked up (hermetic).
#
# One throwaway fixture .exe is compiled with the in-box .NET Framework csc.exe
# (or Add-Type -OutputAssembly) so the happy path can run the post-install
# `cua-driver --version` probe. If no compiler is available this fails under CI
# (where a compiler is expected) and is skipped otherwise.
#
# Run:  pwsh -NoProfile -File tests/test_cua_driver_runtime.ps1
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Driver = Join-Path $RepoRoot "scripts/paseobility-cua-driver.ps1"
$Install = Join-Path $RepoRoot "scripts/paseobility-install.ps1"
$RepoSkills = Join-Path $RepoRoot "skills"

$script:Passed = 0
$script:Failed = 0
$script:Skipped = 0
$script:Work = $null
$script:CanBuildExe = $null
$script:PowerShellExe = $null
$script:OriginalPath = $env:PATH

$FixtureInstaller = @'
$ErrorActionPreference = "Stop"
$bin = $env:CUA_DRIVER_RS_INSTALL_DIR
if ($env:FAKE_CUA_LOG) {
  Add-Content -LiteralPath $env:FAKE_CUA_LOG -Value ("staging=" + $bin)
  Add-Content -LiteralPath $env:FAKE_CUA_LOG -Value ("version=" + $env:CUA_DRIVER_RS_VERSION)
}
if ([string]::IsNullOrWhiteSpace($bin)) { Write-Error "fixture: staging dir not set"; exit 91 }
if ($env:FAKE_CUA_EXIT -and [int]$env:FAKE_CUA_EXIT -ne 0) {
  Write-Host "fixture: simulated failure"
  exit ([int]$env:FAKE_CUA_EXIT)
}
# Reproduce upstream Ensure-Junction: it refuses an existing non-junction path.
if (Test-Path -LiteralPath $bin) {
  Write-Error "fixture: visible bin path already exists (upstream refuses)"
  exit 92
}
$mode = $env:FAKE_CUA_MODE
if (-not $mode) { $mode = "ok" }
if ($mode -eq "none") { exit 0 }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $bin) | Out-Null
if ($mode -eq "broken") {
  New-Item -ItemType Directory -Force -Path $bin | Out-Null
  Set-Content -LiteralPath (Join-Path $bin "cua-driver.exe") -Value "not a real executable" -Encoding ascii
  exit 0
}
$release = $env:FAKE_CUA_RELEASE_DIR
if ($mode -eq "missing-theme") {
  $release = Join-Path (Split-Path -Parent $bin) "release-partial"
  New-Item -ItemType Directory -Force -Path $release | Out-Null
  Copy-Item -LiteralPath (Join-Path $env:FAKE_CUA_RELEASE_DIR "cua-driver.exe") -Destination (Join-Path $release "cua-driver.exe") -Force
  Copy-Item -LiteralPath (Join-Path $env:FAKE_CUA_RELEASE_DIR "cua-driver-uia.exe") -Destination (Join-Path $release "cua-driver-uia.exe") -Force
}
# Upstream installs via a directory junction; publish must copy through it and
# cleanup must delete the link, never the target.
New-Item -ItemType Junction -Path $bin -Target $release | Out-Null
exit 0
'@

function Write-Case([string]$name) { Write-Host "== $name" }

function Assert-True([bool]$condition, [string]$message) {
  if ($condition) {
    $script:Passed += 1
  } else {
    $script:Failed += 1
    Write-Host ("  FAIL: {0}" -f $message) -ForegroundColor Red
  }
}

function Assert-Equal($expected, $actual, [string]$message) {
  Assert-True ($expected -eq $actual) ("{0} (expected '{1}', got '{2}')" -f $message, $expected, $actual)
}

function Assert-NotEqual($expected, $actual, [string]$message) {
  Assert-True ($expected -ne $actual) ("{0} (should not be '{1}')" -f $message, $expected)
}

function Assert-Contains([string]$haystack, [string]$needle, [string]$message) {
  Assert-True ($haystack -like ("*" + $needle + "*")) ("{0} (missing '{1}')" -f $message, $needle)
}

function Set-TestEnv([hashtable]$Values) {
  foreach ($key in @(
      "FAKE_CUA_LOG", "FAKE_CUA_MODE", "FAKE_CUA_EXIT", "FAKE_CUA_RELEASE_DIR",
      "PASEOBILITY_CUA_INSTALLER_DIR", "PASEOBILITY_CUA_DRIVER_BIN",
      "PASEOBILITY_CUA_RAW_BASE", "PASEOBILITY_CUA_BIN_DIR", "PATH")) {
    Remove-Item -Path ("Env:" + $key) -ErrorAction SilentlyContinue
  }
  [Environment]::SetEnvironmentVariable("PATH", $script:OriginalPath, "Process")
  foreach ($key in $Values.Keys) {
    [Environment]::SetEnvironmentVariable($key, [string]$Values[$key], "Process")
  }
}

function Get-PowerShellExe {
  if ($script:PowerShellExe) { return $script:PowerShellExe }
  $exe = (Get-Process -Id $PID).Path
  if (-not $exe -or -not (Test-Path -LiteralPath $exe)) {
    $exe = Join-Path $PSHOME "powershell.exe"
  }
  $script:PowerShellExe = $exe
  return $exe
}

function Invoke-ChildScript {
  param([string]$Path, [string[]]$Arguments = @())
  $exe = Get-PowerShellExe
  $output = & $exe -NoProfile -NonInteractive -File $Path @Arguments 2>&1 | Out-String
  return @{ Code = $LASTEXITCODE; Output = $output }
}

function New-Case {
  $dir = Join-Path $script:Work ("case-" + [guid]::NewGuid().ToString("N"))
  $installer = Join-Path $dir "installer"
  $release = Join-Path $dir "release"
  $bin = Join-Path $dir "shared-bin"
  $emptyPath = Join-Path $dir "empty-path"
  [System.IO.Directory]::CreateDirectory($installer) | Out-Null
  [System.IO.Directory]::CreateDirectory($release) | Out-Null
  [System.IO.Directory]::CreateDirectory($emptyPath) | Out-Null
  Set-Content -LiteralPath (Join-Path $installer "install.ps1") -Value $FixtureInstaller -Encoding ascii
  # Text stand-ins are enough for every case that does not run `--version`.
  Set-Content -LiteralPath (Join-Path $release "cua-driver.exe") -Value "placeholder" -Encoding ascii
  Set-Content -LiteralPath (Join-Path $release "cua-driver-uia.exe") -Value "placeholder" -Encoding ascii
  Set-Content -LiteralPath (Join-Path $release "cua-cursor-theme.exe") -Value "placeholder" -Encoding ascii
  return [pscustomobject]@{
    Dir       = $dir
    Installer = $installer
    Release   = $release
    Bin       = $bin
    EmptyPath = $emptyPath
    Log       = Join-Path $dir "fixture.log"
  }
}

function Set-CaseEnv {
  param([pscustomobject]$Case, [hashtable]$Extra = @{})
  $values = @{
    PASEOBILITY_CUA_INSTALLER_DIR = $Case.Installer
    PASEOBILITY_CUA_BIN_DIR       = $Case.Bin
    # Pin the driver lookup to a per-case path so the helper can never fall back
    # to a real cua-driver on PATH or under LOCALAPPDATA. Cases that need to
    # present an existing driver override this explicitly.
    PASEOBILITY_CUA_DRIVER_BIN    = (Join-Path $Case.Bin "cua-driver.exe")
    FAKE_CUA_LOG                  = $Case.Log
    FAKE_CUA_RELEASE_DIR          = $Case.Release
    PATH                          = $Case.EmptyPath
  }
  foreach ($key in $Extra.Keys) { $values[$key] = $Extra[$key] }
  Set-TestEnv $values
}

function Invoke-DriverCase {
  param([pscustomobject]$Case, [string[]]$Arguments = @(), [hashtable]$Extra = @{})
  Set-CaseEnv -Case $Case -Extra $Extra
  try {
    return Invoke-ChildScript -Path $Driver -Arguments (@("-BinDir", $Case.Bin) + $Arguments)
  } finally {
    Set-TestEnv @{}
  }
}

function Get-LogText([pscustomobject]$Case) {
  if (Test-Path -LiteralPath $Case.Log) { return (Get-Content -LiteralPath $Case.Log -Raw) }
  return ""
}

function New-TestExecutable([string]$Path) {
  $source = @'
public class FakeCuaDriver {
  public static int Main(string[] args) {
    System.Console.WriteLine("cua-driver 0.28.2 (fake)");
    return 0;
  }
}
'@
  if ($env:WINDIR) {
    foreach ($csc in @(
        (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
        (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"))) {
      if (-not (Test-Path -LiteralPath $csc)) { continue }
      $srcFile = [System.IO.Path]::ChangeExtension($Path, ".cs")
      Set-Content -LiteralPath $srcFile -Value $source -Encoding ascii
      & $csc /nologo /target:exe "/out:$Path" $srcFile | Out-Null
      Remove-Item -LiteralPath $srcFile -Force -ErrorAction SilentlyContinue
      if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $Path)) { return $true }
      return $false
    }
  }
  try {
    Add-Type -TypeDefinition $source -OutputAssembly $Path -OutputType ConsoleApplication -ErrorAction Stop
  } catch {
    return $false
  }
  return (Test-Path -LiteralPath $Path)
}

function Test-CanBuildExe {
  if ($null -ne $script:CanBuildExe) { return $script:CanBuildExe }
  $script:CanBuildExe = New-TestExecutable -Path (Join-Path $script:Work "probe.exe")
  return $script:CanBuildExe
}

function New-MigrationHome {
  $case = New-Case
  $TargetHomePath = Join-Path $case.Dir "home"
  [System.IO.Directory]::CreateDirectory($TargetHomePath) | Out-Null
  return [pscustomobject]@{ Case = $case; Home = $TargetHomePath }
}

function Seed-Retired {
  param([string]$TargetHomePath, [string[]]$Names, [string]$Base = ".agents")
  foreach ($name in $Names) {
    $dest = Join-Path (Join-Path $TargetHomePath "$Base\skills") $name
    [System.IO.Directory]::CreateDirectory($dest) | Out-Null
    Set-Content -LiteralPath (Join-Path $dest "SKILL.md") -Value ("---`nname: $name`n---`n") -Encoding ascii
    Set-Content -LiteralPath (Join-Path $dest "local-note.txt") -Value "preserve $name" -Encoding ascii
  }
}

function Test-RetiredBackupCount {
  param([string]$TargetHomePath, [string]$Name, [string]$Base = ".agents")
  $root = Join-Path $TargetHomePath "$Base\skills-backups"
  if (-not (Test-Path -LiteralPath $root)) { return 0 }
  return @(Get-ChildItem -LiteralPath $root -Recurse -Filter "local-note.txt" -File |
    Where-Object { $_.Directory.Name -eq $Name }).Count
}

# ---------------------------------------------------------------------------

$script:Work = Join-Path ([System.IO.Path]::GetTempPath()) ("paseobility-cua-pstest-" + [guid]::NewGuid().ToString("N"))
[System.IO.Directory]::CreateDirectory($script:Work) | Out-Null

try {
  Write-Case "missing driver installs once and publishes the executable set"
  if (Test-CanBuildExe) {
    $case = New-Case
    if (New-TestExecutable -Path (Join-Path $case.Release "cua-driver.exe")) {
      $result = Invoke-DriverCase -Case $case
      Assert-Equal 0 $result.Code "driver exits 0"
      Assert-Contains $result.Output "installed:" "reports the installed version"
      Assert-True (Test-Path -LiteralPath (Join-Path $case.Bin "cua-driver.exe")) "cua-driver.exe published"
      Assert-True (Test-Path -LiteralPath (Join-Path $case.Bin "cua-driver-uia.exe")) "cua-driver-uia.exe published"
      Assert-True (Test-Path -LiteralPath (Join-Path $case.Bin "cua-cursor-theme.exe")) "cua-cursor-theme.exe published"
      $lines = @(Get-Content -LiteralPath $case.Log)
      Assert-Equal 2 $lines.Count "fixture logged staging + version once"
      if ($lines.Count -ge 2) {
        Assert-Contains $lines[0] "staging=" "fixture recorded the staging dir"
        Assert-Contains $lines[1] "version=0.28.2" "fixture recorded the pinned version"
      }
      Assert-True (Test-Path -LiteralPath (Join-Path $case.Release "cua-cursor-theme.exe")) "staged junction target untouched"
    } else {
      $script:Skipped += 1
      Write-Host "  SKIP: could not compile a fixture executable"
    }
  } elseif ($env:CI) {
    $script:Failed += 1
    Write-Host "  FAIL: no in-box compiler in CI" -ForegroundColor Red
  } else {
    $script:Skipped += 1
    Write-Host "  SKIP: no in-box compiler for a fixture executable"
  }

  Write-Case "staged binary is validated before publication"
  $case = New-Case
  $result = Invoke-DriverCase -Case $case -Extra @{ FAKE_CUA_MODE = "broken" }
  Assert-Equal 4 $result.Code "broken staged binary exits 4"
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $case.Bin "cua-driver.exe"))) "broken binary never published"
  Assert-Contains $result.Output "aborting before publication" "reports prevalidation failure"

  Write-Case "uses a private staging dir, never the shared bin dir"
  $case = New-Case
  [System.IO.Directory]::CreateDirectory($case.Bin) | Out-Null
  Set-Content -LiteralPath (Join-Path $case.Bin "keep-me.txt") -Value "unrelated" -Encoding ascii
  $result = Invoke-DriverCase -Case $case -Extra @{ FAKE_CUA_MODE = "none" }
  $log = Get-LogText $case
  Assert-Contains $log "staging=" "fixture ran and recorded staging"
  Assert-True ($log -notlike ("*staging=" + $case.Bin + "*")) "staging dir is not the shared bin dir"
  Assert-True ($log -like "*paseobility-cua-stage-*") "staging dir is a private temp dir"
  Assert-Equal "unrelated" (Get-Content -LiteralPath (Join-Path $case.Bin "keep-me.txt") -Raw).Trim() "shared bin unrelated file preserved"
  Assert-NotEqual 0 $result.Code "missing required binary fails"

  Write-Case "shared bin dir that already exists as a real directory is preserved"
  if (Test-CanBuildExe) {
    $case = New-Case
    New-TestExecutable -Path (Join-Path $case.Release "cua-driver.exe") | Out-Null
    [System.IO.Directory]::CreateDirectory($case.Bin) | Out-Null
    Set-Content -LiteralPath (Join-Path $case.Bin "existing-tool.exe") -Value "keep" -Encoding ascii
    $result = Invoke-DriverCase -Case $case -Extra @{ FAKE_CUA_MODE = "ok" }
    Assert-Equal 0 $result.Code "installs into an existing real shared dir"
    Assert-Equal "keep" (Get-Content -LiteralPath (Join-Path $case.Bin "existing-tool.exe") -Raw).Trim() "pre-existing shared file unchanged"
    Assert-True (Test-Path -LiteralPath (Join-Path $case.Bin "cua-driver.exe")) "published alongside the existing file"
  } else {
    $script:Skipped += 1
    Write-Host "  SKIP: no in-box compiler"
  }

  Write-Case "existing working driver is reused without installing"
  $case = New-Case
  [System.IO.Directory]::CreateDirectory($case.Bin) | Out-Null
  $fake = Join-Path $case.Dir "fake-driver.ps1"
  Set-Content -LiteralPath $fake -Value "Write-Output 'cua-driver 0.28.2 (fake)'; exit 0" -Encoding ascii
  $result = Invoke-DriverCase -Case $case -Extra @{ PASEOBILITY_CUA_DRIVER_BIN = $fake }
  Assert-Equal 0 $result.Code "reuse exits 0"
  Assert-Contains $result.Output "present:" "reports reuse"
  Assert-Equal "" (Get-LogText $case).Trim() "upstream installer not run"

  Write-Case "existing broken executable is left untouched"
  $case = New-Case
  [System.IO.Directory]::CreateDirectory($case.Bin) | Out-Null
  $broken = Join-Path $case.Bin "cua-driver.exe"
  Set-Content -LiteralPath $broken -Value "not a real executable" -Encoding ascii
  $result = Invoke-DriverCase -Case $case
  Assert-Equal 5 $result.Code "broken candidate exits 5"
  Assert-Equal "not a real executable" (Get-Content -LiteralPath $broken -Raw).Trim() "broken binary unchanged"
  Assert-Equal "" (Get-LogText $case).Trim() "upstream installer not run"

  Write-Case "-Check reports missing without installing"
  $case = New-Case
  $result = Invoke-DriverCase -Case $case -Arguments @("-Check")
  Assert-Equal 3 $result.Code "-Check exits 3 when missing"
  Assert-Equal "" (Get-LogText $case).Trim() "upstream installer not run"
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $case.Bin "cua-driver.exe"))) "nothing published"

  Write-Case "-DryRun does not execute the installer"
  $case = New-Case
  $result = Invoke-DriverCase -Case $case -Arguments @("-DryRun")
  Assert-Equal 0 $result.Code "dry-run exits 0"
  Assert-Contains $result.Output "dry-run" "prints the plan"
  Assert-Equal "" (Get-LogText $case).Trim() "upstream installer not run"
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $case.Bin "cua-driver.exe"))) "nothing published"

  Write-Case "upstream installer failure is non-zero"
  $case = New-Case
  $result = Invoke-DriverCase -Case $case -Extra @{ FAKE_CUA_EXIT = "7" }
  Assert-Equal 4 $result.Code "installer failure exits 4"
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $case.Bin "cua-driver.exe"))) "nothing published"

  Write-Case "missing helper for the pinned version fails instead of passing"
  if (Test-CanBuildExe) {
    $case = New-Case
    New-TestExecutable -Path (Join-Path $case.Release "cua-driver.exe") | Out-Null
    $result = Invoke-DriverCase -Case $case -Extra @{ FAKE_CUA_MODE = "missing-theme" }
    Assert-Equal 4 $result.Code "missing theme helper exits 4"
    Assert-Contains $result.Output "required cua-cursor-theme.exe" "reports the missing helper"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $case.Bin "cua-driver.exe"))) "nothing published"
  } else {
    $script:Skipped += 1
    Write-Host "  SKIP: no in-box compiler"
  }

  Write-Case "installer success but broken binary fails the version probe"
  $case = New-Case
  $result = Invoke-DriverCase -Case $case -Extra @{ FAKE_CUA_MODE = "broken" }
  Assert-Equal 4 $result.Code "broken published binary exits 4"
  Assert-Contains $result.Output "runtime setup failed" "reports failure"

  Write-Case "collision with a differing existing file rolls back this run"
  if (Test-CanBuildExe) {
    $case = New-Case
    New-TestExecutable -Path (Join-Path $case.Release "cua-driver.exe") | Out-Null
    [System.IO.Directory]::CreateDirectory($case.Bin) | Out-Null
    $existingTheme = Join-Path $case.Bin "cua-cursor-theme.exe"
    Set-Content -LiteralPath $existingTheme -Value "pre-existing theme" -Encoding ascii
    $result = Invoke-DriverCase -Case $case -Extra @{ FAKE_CUA_MODE = "ok" }
    Assert-Equal 4 $result.Code "collision fails"
    Assert-Equal "pre-existing theme" (Get-Content -LiteralPath $existingTheme -Raw).Trim() "existing file preserved"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $case.Bin "cua-driver.exe"))) "newly added cua-driver.exe rolled back"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $case.Bin "cua-driver-uia.exe"))) "newly added cua-driver-uia.exe rolled back"
    $leftovers = @(Get-ChildItem -LiteralPath $case.Bin -Filter ".*.tmp" -Force -ErrorAction SilentlyContinue)
    Assert-Equal 0 $leftovers.Count "no temp files left behind"
    Assert-True (Test-Path -LiteralPath (Join-Path $case.Release "cua-cursor-theme.exe")) "junction target contents preserved"
  } else {
    $script:Skipped += 1
    Write-Host "  SKIP: no in-box compiler"
  }

  Write-Case "collision with identical content is idempotent"
  if (Test-CanBuildExe) {
    $case = New-Case
    New-TestExecutable -Path (Join-Path $case.Release "cua-driver.exe") | Out-Null
    [System.IO.Directory]::CreateDirectory($case.Bin) | Out-Null
    # Seed only the helper executables with identical content. cua-driver.exe must
    # stay absent so the driver is not discovered as an existing install (which
    # would take the reuse path) and the publish path with its identical-content
    # skip actually runs.
    foreach ($name in @("cua-driver-uia.exe", "cua-cursor-theme.exe")) {
      Copy-Item -LiteralPath (Join-Path $case.Release $name) -Destination (Join-Path $case.Bin $name) -Force
    }
    $result = Invoke-DriverCase -Case $case -Extra @{ FAKE_CUA_MODE = "ok" }
    Assert-Equal 0 $result.Code "idempotent re-run exits 0"
    Assert-Contains $result.Output "identical content" "identical files are skipped"
    Assert-True (Test-Path -LiteralPath (Join-Path $case.Bin "cua-driver.exe")) "missing main binary published"
  } else {
    $script:Skipped += 1
    Write-Host "  SKIP: no in-box compiler"
  }

  Write-Case "process environment is restored after an in-process run"
  $case = New-Case
  $names = @("CUA_DRIVER_RS_INSTALL_DIR", "CUA_DRIVER_RS_VERSION", "CUA_DRIVER_RS_NO_MODIFY_PATH")
  $before = @{}
  foreach ($name in $names) { $before[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
  Set-CaseEnv -Case $case -Extra @{ FAKE_CUA_EXIT = "7" }
  try {
    $global:LASTEXITCODE = 0
    $null = & $Driver -BinDir $case.Bin 2>&1 | Out-Null
  } finally {
    Set-TestEnv @{}
  }
  foreach ($name in $names) {
    Assert-Equal $before[$name] ([Environment]::GetEnvironmentVariable($name, "Process")) ("{0} restored" -f $name)
  }

  # --- native skill migration (Windows path of paseobility-install.ps1) -----

  Write-Case "native migration moves retired skills and preserves backups"
  $m = New-MigrationHome
  $retired = @("paseo-agent-tournament", "paseo-session-brief", "paseo-project-bootstrap", "paseo-computer-use", "paseo-skill-save")
  Seed-Retired -TargetHomePath $m.Home -Names $retired
  Seed-Retired -TargetHomePath $m.Home -Names $retired -Base ".claude"
  $private = Join-Path $m.Home ".local\state\ai-skill-library\private-marker"
  [System.IO.Directory]::CreateDirectory((Split-Path -Parent $private)) | Out-Null
  Set-Content -LiteralPath $private -Value "untouched" -Encoding ascii
  $unrelated = Join-Path $m.Home ".agents\skills\unrelated\SKILL.md"
  [System.IO.Directory]::CreateDirectory((Split-Path -Parent $unrelated)) | Out-Null
  Set-Content -LiteralPath $unrelated -Value "unrelated" -Encoding ascii
  Set-CaseEnv -Case $m.Case
  try {
    $result = Invoke-ChildScript -Path $Install -Arguments @(
      "-TargetHome", $m.Home, "-MigrateSkills", "-WithClaude", "-NoPaseoCheck")
  } finally {
    Set-TestEnv @{}
  }
  Assert-Equal 0 $result.Code "migration exits 0"
  foreach ($base in @(".agents", ".claude")) {
    foreach ($name in $retired) {
      Assert-True (-not (Test-Path -LiteralPath (Join-Path $m.Home "$base\skills\$name"))) "retired $name removed ($base)"
      Assert-Equal 1 (Test-RetiredBackupCount -TargetHomePath $m.Home -Name $name -Base $base) "backup kept for $name ($base)"
    }
    foreach ($name in @("paseo-cua", "paseo-project", "paseo-share")) {
      $dest = Join-Path $m.Home "$base\skills\$name\SKILL.md"
      $src = Join-Path $RepoSkills "$name\SKILL.md"
      Assert-True (Test-Path -LiteralPath $dest) "$name installed ($base)"
      if (Test-Path -LiteralPath $dest) {
        Assert-True ((Get-FileHash -LiteralPath $dest).Hash -eq (Get-FileHash -LiteralPath $src).Hash) "$name matches source ($base)"
      }
    }
  }
  Assert-Equal "untouched" (Get-Content -LiteralPath $private -Raw).Trim() "private state preserved"
  Assert-Equal "unrelated" (Get-Content -LiteralPath $unrelated -Raw).Trim() "unrelated skill preserved"

  Write-Case "native single-skill migration only moves its predecessors"
  $m = New-MigrationHome
  $retired = @("paseo-agent-tournament", "paseo-session-brief", "paseo-project-bootstrap", "paseo-computer-use", "paseo-skill-save")
  Seed-Retired -TargetHomePath $m.Home -Names $retired
  Set-CaseEnv -Case $m.Case
  try {
    $result = Invoke-ChildScript -Path $Install -Arguments @(
      "-TargetHome", $m.Home, "-Skill", "paseo-project", "-MigrateSkills", "-NoPaseoCheck")
  } finally {
    Set-TestEnv @{}
  }
  Assert-Equal 0 $result.Code "single-skill migration exits 0"
  foreach ($name in @("paseo-session-brief", "paseo-project-bootstrap")) {
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $m.Home ".agents\skills\$name"))) "$name migrated"
  }
  foreach ($name in @("paseo-agent-tournament", "paseo-computer-use", "paseo-skill-save")) {
    Assert-True (Test-Path -LiteralPath (Join-Path $m.Home ".agents\skills\$name")) "$name preserved"
  }
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $m.Home ".claude"))) "claude target untouched"

  Write-Case "native repeated migration keeps the original backup"
  $m = New-MigrationHome
  Seed-Retired -TargetHomePath $m.Home -Names @("paseo-session-brief")
  Set-CaseEnv -Case $m.Case
  try {
    $null = Invoke-ChildScript -Path $Install -Arguments @("-TargetHome", $m.Home, "-MigrateSkills", "-NoPaseoCheck")
    $result = Invoke-ChildScript -Path $Install -Arguments @("-TargetHome", $m.Home, "-MigrateSkills", "-NoPaseoCheck")
  } finally {
    Set-TestEnv @{}
  }
  Assert-Equal 0 $result.Code "second migration exits 0"
  Assert-Equal 1 (Test-RetiredBackupCount -TargetHomePath $m.Home -Name "paseo-session-brief") "original backup kept once"

  Write-Case "native unknown ownership aborts before installation"
  $m = New-MigrationHome
  Seed-Retired -TargetHomePath $m.Home -Names @("paseo-session-brief")
  $skillFile = Join-Path $m.Home ".agents\skills\paseo-session-brief\SKILL.md"
  Set-Content -LiteralPath $skillFile -Value "---`nname: unrelated`n---`n" -Encoding ascii
  Set-CaseEnv -Case $m.Case
  try {
    $result = Invoke-ChildScript -Path $Install -Arguments @("-TargetHome", $m.Home, "-MigrateSkills", "-NoPaseoCheck")
  } finally {
    Set-TestEnv @{}
  }
  Assert-NotEqual 0 $result.Code "unknown ownership fails"
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $m.Home ".agents\skills\paseo-project"))) "no replacement installed"
  Assert-True (Test-Path -LiteralPath $skillFile) "unrecognized skill left in place"

  Write-Case "native linked retired skill aborts without touching its target"
  $m = New-MigrationHome
  $outside = Join-Path $m.Case.Dir "outside"
  [System.IO.Directory]::CreateDirectory($outside) | Out-Null
  Set-Content -LiteralPath (Join-Path $outside "marker") -Value "keep" -Encoding ascii
  $linkParent = Join-Path $m.Home ".agents\skills"
  [System.IO.Directory]::CreateDirectory($linkParent) | Out-Null
  $link = Join-Path $linkParent "paseo-session-brief"
  $linked = $false
  try {
    New-Item -ItemType Junction -Path $link -Target $outside | Out-Null
    $linked = $true
  } catch {
    try {
      New-Item -ItemType SymbolicLink -Path $link -Target $outside | Out-Null
      $linked = $true
    } catch {
      $linked = $false
    }
  }
  if (-not $linked) {
    $script:Skipped += 1
    Write-Host "  SKIP: this host cannot create a link (privilege)"
  } else {
    Set-CaseEnv -Case $m.Case
    try {
      $result = Invoke-ChildScript -Path $Install -Arguments @("-TargetHome", $m.Home, "-MigrateSkills", "-NoPaseoCheck")
    } finally {
      Set-TestEnv @{}
    }
    Assert-NotEqual 0 $result.Code "linked retired skill fails"
    Assert-True (Test-Path -LiteralPath $link) "link left in place"
    Assert-Equal "keep" (Get-Content -LiteralPath (Join-Path $outside "marker") -Raw).Trim() "link target preserved"
  }

  Write-Case "selecting another skill has no driver side effects"
  $case = New-Case
  $TargetHomePath = Join-Path $case.Dir "home"
  Set-CaseEnv -Case $case
  try {
    $result = Invoke-ChildScript -Path $Install -Arguments @(
      "-Skill", "paseo-share", "-TargetHome", $TargetHomePath, "-NoPaseoCheck")
  } finally {
    Set-TestEnv @{}
  }
  Assert-Equal 0 $result.Code "skills-only install exits 0"
  Assert-Contains $result.Output "not requested" "runtime not requested"
  Assert-Equal "" (Get-LogText $case).Trim() "driver helper not invoked"

  Write-Case "custom -TargetHome with paseo-cua skips the host runtime by default"
  $case = New-Case
  $TargetHomePath = Join-Path $case.Dir "home"
  Set-CaseEnv -Case $case
  try {
    $result = Invoke-ChildScript -Path $Install -Arguments @(
      "-Skill", "paseo-cua", "-TargetHome", $TargetHomePath, "-NoPaseoCheck")
  } finally {
    Set-TestEnv @{}
  }
  Assert-Equal 0 $result.Code "install exits 0"
  Assert-Contains $result.Output "skipped for custom -TargetHome" "custom target skips the host runtime"
  Assert-Equal "" (Get-LogText $case).Trim() "driver helper not invoked"
} finally {
  [Environment]::SetEnvironmentVariable("PATH", $script:OriginalPath, "Process")
  if ($script:Work -and (Test-Path -LiteralPath $script:Work)) {
    Remove-Item -LiteralPath $script:Work -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ""
Write-Host ("passed: {0}  failed: {1}  skipped: {2}" -f $script:Passed, $script:Failed, $script:Skipped)
if ($script:Failed -gt 0) { exit 1 }
exit 0
