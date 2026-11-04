[CmdletBinding()]
param(
  [Parameter(Mandatory=$true,Position=0)][ValidateSet('supervise','check')][string]$Command,
  [Parameter(Position=1)][ValidateSet('install','uninstall','status','restart','install-service','uninstall-service')][string]$Action,
  [string]$State = (Join-Path $env:USERPROFILE '.config\paseo-bot'),
  [string]$Python, [switch]$Apply
)
$ErrorActionPreference = 'Stop'
if (!$Python) {
  $launcher = Get-Command python.exe -ErrorAction SilentlyContinue | Where-Object { $_.Source -notmatch '\\WindowsApps\\' } | Select-Object -First 1
  if (!$launcher) { throw 'Python unavailable' }
  $Python = $launcher.Source
}
if ($Command -eq 'check') {
  & $Python -X utf8 (Join-Path $PSScriptRoot 'discord_serve.py') --state $State check
  exit $LASTEXITCODE
}
if (!$Action) { throw 'supervise requires an action' }
if ($Action -in @('install-service','uninstall-service')) {
  $installer = Join-Path $PSScriptRoot 'guardian\install-guardian.ps1'
  $params = @{ UserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; State = $State; Pythonw = (Join-Path (Split-Path $Python) 'pythonw.exe') }
  if ($Action -eq 'uninstall-service') { $params.Uninstall = $true }
  if ($Apply) {
    $result = [IO.Path]::GetTempFileName()
    try {
      function QuoteArg([string]$value) {
        $b = New-Object Text.StringBuilder
        [void]$b.Append('"'); $slashes = 0
        foreach ($char in $value.ToCharArray()) {
          if ($char -eq '\') { $slashes++; continue }
          if ($char -eq '"') { [void]$b.Append(('\' * ($slashes * 2 + 1))); [void]$b.Append('"') }
          else { [void]$b.Append(('\' * $slashes)); [void]$b.Append($char) }
          $slashes = 0
        }
        [void]$b.Append(('\' * ($slashes * 2))); [void]$b.Append('"')
        return $b.ToString()
      }
      $argv = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$installer,'-UserSid',$params.UserSid,'-State',$State,'-Pythonw',$params.Pythonw,'-Apply','-ResultFile',$result)
      if ($params.Uninstall) { $argv += '-Uninstall' }
      $start = New-Object Diagnostics.ProcessStartInfo
      $start.FileName = 'powershell.exe'; $start.Arguments = (($argv | ForEach-Object { QuoteArg $_ }) -join ' ')
      $start.Verb = 'runas'; $start.UseShellExecute = $true; $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
      $child = [Diagnostics.Process]::Start($start); $child.WaitForExit()
      $output = [IO.File]::ReadAllText($result); if ($output) { [Console]::WriteLine($output) }
      exit $child.ExitCode
    } finally { Remove-Item -LiteralPath $result -ErrorAction SilentlyContinue }
  }
  & $installer @params
  exit $LASTEXITCODE
}
$argsList = @('-X','utf8',(Join-Path $PSScriptRoot 'supervisor.py'),$Action,'--state',$State)
if ($Apply) { $argsList += '--apply' }
& $Python @argsList
exit $LASTEXITCODE
