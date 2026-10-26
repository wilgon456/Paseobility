[CmdletBinding()]
param(
  [Parameter(Mandatory=$true,Position=0)]
  [ValidateSet('submit','status','result','health','list','serve','discover','tick')]
  [string]$Command,
  [Parameter(Position=1)][string]$Id,
  [string]$File,
  [string]$State = (Join-Path $env:USERPROFILE '.config\paseo-bot'),
  [string]$Python,
  [Parameter(ValueFromPipeline=$true)][AllowEmptyString()][string]$Json
)
begin { $chunks = New-Object 'System.Collections.Generic.List[string]' }
process { if ($PSBoundParameters.ContainsKey('Json')) { $chunks.Add($Json) } }
end {
  $oldOutput = $OutputEncoding
  $oldConsole = [Console]::OutputEncoding
  $code = 1
  try {
    $utf8 = New-Object Text.UTF8Encoding($false)
    $OutputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
    $prefix = @()
    if (!$Python) {
      $launcher = Get-Command py.exe -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($launcher) { $Python = $launcher.Source; $prefix = @('-3') }
      else {
        $launcher = Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -First 1
        if (!$launcher) { throw 'Python unavailable' }
        $Python = $launcher.Source
      }
    }
    $argv = $prefix + @('-X','utf8',(Join-Path $PSScriptRoot 'paseo_bot.py'),'--state',$State,$Command)
    if ($Id) { $argv += $Id }
    if ($File) { $argv += @('--file',$File) }
    if ($Command -eq 'submit' -and !$File) {
      $inputText = if ($chunks.Count -gt 0) { $chunks -join [Environment]::NewLine }
                   elseif ([Console]::IsInputRedirected) { [Console]::In.ReadToEnd() }
                   else { throw 'Submit needs -File or pipeline JSON' }
      $inputText | & $Python @argv
    } else { & $Python @argv }
    $code = $LASTEXITCODE
  } catch {
    Write-Output '{"ok":false,"error":"PowerShell bot invocation failed. Check Python, command, file and state path."}'
    $code = 1
  } finally {
    $OutputEncoding = $oldOutput
    [Console]::OutputEncoding = $oldConsole
  }
  exit $code
}
