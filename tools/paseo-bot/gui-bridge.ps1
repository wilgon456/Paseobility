# SSH launches this fixed entry. Requests are UTF-8 JSON on stdin, never code.
[CmdletBinding()]
param([switch]$AllowSubmit, [string]$State = (Join-Path $env:USERPROFILE '.config\paseo-bot'))
$ErrorActionPreference = 'Stop'
try {
  $utf8 = New-Object Text.UTF8Encoding($false)
  [Console]::InputEncoding = $utf8
  [Console]::OutputEncoding = $utf8
  $env:PYTHONIOENCODING = 'utf-8'
  $python = Get-Command python.exe -ErrorAction SilentlyContinue | Where-Object { $_.Source -notmatch '\\WindowsApps\\' } | Select-Object -First 1
  if (!$python) { throw 'Python missing' }
  $argv = @('-X','utf8',(Join-Path $PSScriptRoot 'gui_api.py'),'--state',$State)
  if ($AllowSubmit) { $argv += '--allow-submit' }
  # Let Python inherit the SSH byte streams. No PowerShell native pipeline/ASCII conversion.
  & $python.Source @argv 2>$null
  exit $LASTEXITCODE
} catch {
  [Console]::Write('{"ok":false,"error":"Bot bridge unavailable. Check Python and private queue."}')
  exit 1
}
