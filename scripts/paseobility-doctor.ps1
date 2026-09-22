# Thin Windows wrapper over the cross-platform Python diagnostics helper.
#
# The diagnostics themselves live in paseobility-doctor.py (stdlib only) so the
# same logic runs on macOS, Linux, and Windows. Arguments are passed through,
# mirroring the Python flags: -Root, -SourceRoot, -TargetHome, -CuaBin,
# -CuaBinDir, -Json, and -CheckMcp.
[CmdletBinding()]
param(
  [string]$Root,
  [string]$SourceRoot,
  [string]$TargetHome,
  [switch]$Json,
  [switch]$CheckMcp,
  [string]$Paseo,
  [string]$CuaBin,
  [string]$CuaBinDir,
  [double]$Timeout = 5
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Helper = Join-Path $ScriptDir "paseobility-doctor.py"
if (-not (Test-Path -LiteralPath $Helper)) {
  throw "diagnostics helper not found: $Helper"
}

# Resolve a *real* Python 3. The Microsoft Store "python3"/"python" aliases in
# WindowsApps are stubs that only open the Store, so they are rejected by
# actually running `--version` and requiring a "Python 3" reply.
$launcher = $null
$prefix = @()
foreach ($candidate in @(
    @{ Cmd = "python3"; Extra = @() },
    @{ Cmd = "python"; Extra = @() },
    @{ Cmd = "py"; Extra = @("-3") })) {
  $cmd = Get-Command $candidate.Cmd -ErrorAction SilentlyContinue
  if (-not $cmd) { continue }
  $source = $cmd.Source
  if ($source -and ($source -like "*\WindowsApps\*")) { continue }
  $probeArgs = @($candidate.Extra) + @("--version")
  try {
    $probe = & $source @probeArgs 2>&1
    if ($LASTEXITCODE -eq 0 -and ("$probe" -match "Python 3")) {
      $launcher = $source
      $prefix = @($candidate.Extra)
      break
    }
  } catch {
    continue
  }
}
if (-not $launcher) {
  throw "diagnostics unavailable: a real Python 3 was not found (the Microsoft Store alias is not accepted)."
}

$arguments = @($prefix) + @($Helper, "--timeout", "$Timeout")
if ($Root) { $arguments += @("--root", $Root) }
if ($SourceRoot) { $arguments += @("--source-root", $SourceRoot) }
if ($TargetHome) { $arguments += @("--target-home", $TargetHome) }
if ($Json) { $arguments += "--json" }
if ($CheckMcp) { $arguments += "--check-mcp" }
if ($Paseo) { $arguments += @("--paseo", $Paseo) }
if ($CuaBin) { $arguments += @("--cua-bin", $CuaBin) }
if ($CuaBinDir) { $arguments += @("--cua-bin-dir", $CuaBinDir) }

& $launcher @arguments
exit $LASTEXITCODE
