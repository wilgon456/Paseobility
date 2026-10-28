# Installs or removes the PaseoBotGuardian Windows service. Without -Apply it only
# prints the plan. -Apply needs an elevated PowerShell (paseo-bot.ps1 supervise
# install-service -Apply asks for UAC consent and passes the caller's SID).
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Uninstall,
  [Parameter(Mandatory=$true)][string]$UserSid,
  [string]$State = (Join-Path $env:USERPROFILE '.config\paseo-bot'),
  [string]$Pythonw,
  [string]$ResultFile
)
$ErrorActionPreference = 'Stop'
$name = 'PaseoBotGuardian'
$tool = Split-Path -Parent $PSScriptRoot
$supervisor = Join-Path $tool 'supervisor.py'
$binDir = Join-Path $env:ProgramFiles $name
$dataDir = Join-Path $env:ProgramData $name
$exe = Join-Path $binDir "$name.exe"
$ini = Join-Path $dataDir 'guardian.ini'
if (!$Pythonw) {
  $python = Get-Command python.exe -ErrorAction SilentlyContinue | Where-Object { $_.Source -notmatch '\\WindowsApps\\' } | Select-Object -First 1
  if ($python) { $Pythonw = Join-Path (Split-Path $python.Source) 'pythonw.exe' }
}

function Finish($result) {
  $json = $result | ConvertTo-Json -Depth 4 -Compress
  if ($ResultFile) { [IO.File]::WriteAllText($ResultFile, $json, (New-Object Text.UTF8Encoding($false))) }
  $json
}

try {
  [void](New-Object Security.Principal.SecurityIdentifier($UserSid))
  $config = @(
    '# Written by install-guardian.ps1; only Administrators may change it.',
    "UserSid=$UserSid",
    "Command=$Pythonw",
    "Arguments=-X utf8 `"$supervisor`" run --state `"$State`"",
    "WorkingDirectory=$tool",
    "Match=$supervisor"
  ) -join "`r`n"
  $plan = [ordered]@{
    service = $name; action = $(if ($Uninstall) { 'uninstall' } else { 'install' }); applied = $false
    binary = $exe; config = $ini; log = (Join-Path $dataDir 'guardian.log')
    runsAs = 'LocalSystem service; launches the supervisor with the logged-on user token (never as SYSTEM)'
    recovery = 'restart after 1 s, 5 s, 30 s; failure count resets daily'
    supervisor = "$Pythonw -X utf8 $supervisor run --state $State"
  }
  if (!$Uninstall -and !(Test-Path $Pythonw)) { throw "pythonw.exe not found: $Pythonw" }
  if (!$Apply) { $plan.next = 'Re-run with -Apply from paseo-bot.ps1 to change the system (UAC consent required).'; Finish ([ordered]@{ ok = $true; result = $plan }); exit 0 }

  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (!$admin) { throw 'Administrator rights are required for -Apply.' }
  $existing = Get-Service -Name $name -ErrorAction SilentlyContinue

  if ($Uninstall) {
    if ($existing) {
      if ($existing.Status -ne 'Stopped') { Stop-Service -Name $name -Force; $existing.WaitForStatus('Stopped', '00:00:30') }
      & sc.exe delete $name | Out-Null
    }
    Remove-Item -Recurse -Force $binDir -ErrorAction SilentlyContinue
    Remove-Item -Force $ini -ErrorAction SilentlyContinue
    $plan.applied = $true; $plan.note = 'The supervisor and bot keep running in the user session.'
    Finish ([ordered]@{ ok = $true; result = $plan }); exit 0
  }

  # Build first, so a compile error leaves any installed version untouched.
  $build = Join-Path ([IO.Path]::GetTempPath()) ("$name-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $build | Out-Null
  $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  $out = & $csc /nologo /target:exe /optimize /r:System.ServiceProcess.dll /r:System.Management.dll "/out:$build\$name.exe" (Join-Path $PSScriptRoot "$name.cs")
  if ($LASTEXITCODE -ne 0) { throw "Guardian build failed: $out" }

  # Admin-only locations: users can read but not replace what SYSTEM runs or what it launches.
  foreach ($dir in @($binDir, $dataDir)) {
    New-Item -ItemType Directory -Force $dir | Out-Null
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($who in @('S-1-5-18', 'S-1-5-32-544')) {
      $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($who)), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    }
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')), 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    Set-Acl -Path $dir -AclObject $acl
  }
  [IO.File]::WriteAllText($ini, $config, (New-Object Text.UTF8Encoding($false)))
  & "$build\$name.exe" --check-config $ini | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'guardian.ini validation failed' }

  if ($existing -and $existing.Status -ne 'Stopped') { Stop-Service -Name $name -Force; $existing.WaitForStatus('Stopped', '00:00:30') }
  Copy-Item -Force "$build\$name.exe" $exe
  Remove-Item -Recurse -Force $build
  if (!$existing) {
    & sc.exe create $name binPath= "`"$exe`"" start= auto obj= LocalSystem DisplayName= 'Paseo Bot Guardian' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'sc.exe create failed' }
  }
  & sc.exe description $name 'Keeps the Paseo bot supervisor running in the configured user session (no console, no network).' | Out-Null
  & sc.exe failure $name reset= 86400 actions= restart/1000/restart/5000/restart/30000 | Out-Null
  & sc.exe failureflag $name 1 | Out-Null
  Start-Service -Name $name
  (Get-Service -Name $name).WaitForStatus('Running', '00:00:30')
  $plan.applied = $true
  Finish ([ordered]@{ ok = $true; result = $plan })
} catch {
  Finish ([ordered]@{ ok = $false; error = $_.Exception.Message })
  exit 1
}
