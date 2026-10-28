[CmdletBinding()]
param(
  [Parameter(Mandatory=$true,Position=0)]
  [ValidateSet('submit','status','result','health','list','serve','discover','tick','close','supervise')]
  [string]$Command,
  [Parameter(Position=1)][string]$Id,
  [string]$File,
  [string]$State = (Join-Path $env:USERPROFILE '.config\paseo-bot'),
  [string]$Python,
  [string]$Reason,
  [switch]$Apply,
  [ValidateSet('cli','grok')][string]$Producer = 'cli',
  [Parameter(ValueFromPipeline=$true)][AllowEmptyString()][string]$Json
)
begin { $chunks = New-Object 'System.Collections.Generic.List[string]' }
process { if ($PSBoundParameters.ContainsKey('Json')) { $chunks.Add($Json) } }
end {
  $oldConsole = [Console]::OutputEncoding
  $oldInput = [Console]::InputEncoding
  $code = 1
  try {
    $utf8 = New-Object Text.UTF8Encoding($false)
    [Console]::OutputEncoding = $utf8
    [Console]::InputEncoding = $utf8
    $prefix = @()
    if (!$Python) {
      $launcher = Get-Command python.exe -ErrorAction SilentlyContinue | Where-Object { $_.Source -notmatch '\\WindowsApps\\' } | Select-Object -First 1
      if ($launcher) { $Python = $launcher.Source }
      else {
        $launcher = Get-Command py.exe -ErrorAction SilentlyContinue | Select-Object -First 1
        if (!$launcher) { throw 'Python unavailable' }
        $Python = $launcher.Source
        $prefix = @('-3')
      }
    }
    if ($Command -eq 'supervise') {
      # Opt-in resident supervisor; install/uninstall (task) and *-service (guardian) change nothing without -Apply.
      if ($Id -notin @('install','uninstall','status','restart','install-service','uninstall-service')) { throw 'supervise needs install, uninstall, status, restart, install-service or uninstall-service' }
      $argv = $prefix + @('-X','utf8',(Join-Path $PSScriptRoot 'supervisor.py'),'--state',$State,$Id)
      if ($Apply) { $argv += '--apply' }
    } else {
      $argv = $prefix + @('-X','utf8',(Join-Path $PSScriptRoot 'paseo_bot.py'),'--state',$State,$Command)
      if ($Id) { $argv += $Id }
    }
    if ($File) { $argv += @('--file',$File) }
    if ($Command -eq 'close' -and $Reason) { $argv += @('--reason',$Reason) }
    if ($Command -eq 'submit') { $argv += @('--producer',$Producer) }
    # .NET Framework's ProcessStartInfo lacks ArgumentList. Quote CreateProcess
    # arguments explicitly; no shell or PowerShell expression is evaluated.
    function Quote-NativeArgument([string]$value) {
      $builder = New-Object Text.StringBuilder
      [void]$builder.Append('"')
      $slashes = 0
      foreach ($char in $value.ToCharArray()) {
        if ($char -eq '\') { $slashes++; continue }
        if ($char -eq '"') { [void]$builder.Append(('\' * ($slashes * 2 + 1))); [void]$builder.Append('"') }
        else { [void]$builder.Append(('\' * $slashes)); [void]$builder.Append($char) }
        $slashes = 0
      }
      [void]$builder.Append(('\' * ($slashes * 2)))
      [void]$builder.Append('"')
      return $builder.ToString()
    }
    if ($Command -eq 'supervise' -and $Id -in @('install-service','uninstall-service')) {
      # Guardian service layer. The installer runs elevated only with -Apply, after UAC consent,
      # and receives this user's SID so it never guesses whose session to supervise.
      $installer = Join-Path $PSScriptRoot 'guardian\install-guardian.ps1'
      $common = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$installer,'-UserSid',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'-State',$State)
      $pythonw = Join-Path (Split-Path $Python) 'pythonw.exe'
      if (Test-Path $pythonw) { $common += @('-Pythonw',$pythonw) }
      if ($Id -eq 'uninstall-service') { $common += '-Uninstall' }
      if ($Apply) {
        $resultFile = [IO.Path]::GetTempFileName()
        $elevated = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru `
          -ArgumentList ((($common + @('-Apply','-ResultFile',$resultFile)) | ForEach-Object { Quote-NativeArgument $_ }) -join ' ')
        $output = [IO.File]::ReadAllText($resultFile); Remove-Item $resultFile
        $code = $elevated.ExitCode
      } else {
        $output = (& powershell.exe @common) -join [Environment]::NewLine; $code = $LASTEXITCODE
      }
      if (!$output) { $output = '{"ok":false,"error":"Guardian installer returned no result."}'; $code = 1 }
      [Console]::WriteLine($output)
    } else {
    $needsInput = $Command -eq 'submit' -and !$File
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $Python
    $start.Arguments = (($argv | ForEach-Object { Quote-NativeArgument $_ }) -join ' ')
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.RedirectStandardInput = $needsInput
    $start.StandardOutputEncoding = $utf8
    $start.StandardErrorEncoding = $utf8
    if ($needsInput) {
      $inputText = if ($chunks.Count -gt 0) { $chunks -join [Environment]::NewLine }
                   elseif ([Console]::IsInputRedirected) { [Console]::In.ReadToEnd() }
                   else { throw 'Submit needs -File or pipeline JSON' }
    }
    $child = New-Object Diagnostics.Process
    $child.StartInfo = $start
    if (!$child.Start()) { throw 'Python start failed' }
    $stdout = $child.StandardOutput.ReadToEndAsync()
    $stderr = $child.StandardError.ReadToEndAsync()
    if ($needsInput) {
      # Windows PowerShell native pipelines can use ASCII even inside an invoked
      # script. Write UTF-8 bytes directly to avoid corrupting Korean task text.
      $bytes = $utf8.GetBytes($inputText)
      $child.StandardInput.BaseStream.Write($bytes,0,$bytes.Length)
      $child.StandardInput.Close()
    }
    $child.WaitForExit()
    $code = $child.ExitCode
    $output = $stdout.GetAwaiter().GetResult()
    [void]$stderr.GetAwaiter().GetResult() # Never relay raw exception/CLI stderr.
    if ($output) { [Console]::Write($output) }
    else { [Console]::WriteLine('{"ok":false,"error":"Python returned no JSON output."}'); $code = 1 }
    $child.Dispose()
    }
  } catch {
    [Console]::WriteLine('{"ok":false,"error":"PowerShell bot invocation failed. Check Python, command, file and state path."}')
    $code = 1
  } finally { [Console]::OutputEncoding = $oldConsole; [Console]::InputEncoding = $oldInput }
  exit $code
}
