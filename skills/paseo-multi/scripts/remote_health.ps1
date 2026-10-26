# Windows PowerShell 5.1, CIM fallback; no Python/psutil dependency.
$ErrorActionPreference = 'Stop'
$multiRoot = Join-Path $env:LOCALAPPDATA 'paseo-multi'
$multiUser = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Size($folder) {
    $bytes = 0L; $count = 0; $partial = $false
    if (Test-Path -LiteralPath $folder) {
        # Bound traversal and never descend through junctions/reparse points.
        $queue = New-Object 'System.Collections.Generic.Queue[string]'
        $queue.Enqueue($folder)
        while ($queue.Count -gt 0 -and $count -lt 20000) {
            $dir = $queue.Dequeue()
            foreach ($f in @(Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue)) {
                $count++; if ($count -gt 20000) { $partial=$true; break }
                if ($f.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
                if ($f.PSIsContainer) { $queue.Enqueue($f.FullName) } else { $bytes += $f.Length }
            }
        }
        if ($queue.Count) { $partial=$true }
    }
    @{bytes=$bytes;partial=$partial}
}
function Snapshot {
    $all = @(Get-CimInstance Win32_Process)
    $map = @{}; foreach ($p in $all) { $map[[int]$p.ProcessId]=$p }
    $ports=@{}; $portsKnown=$true
    try { Get-NetTCPConnection -State Listen -ErrorAction Stop | ForEach-Object { $ports[[int]$_.OwningProcess] += @([int]$_.LocalPort) } }
    catch { $portsKnown=$false }
    $tasks=@{}
    try { Get-ScheduledTask -ErrorAction Stop | ForEach-Object { $task=$_; foreach ($a in $task.Actions) { if ($a.Execute) { $key=[IO.Path]::GetFileName($a.Execute).ToLowerInvariant(); $tasks[$key]+=@($task.TaskPath+$task.TaskName) } } } } catch {}
    $rows=@(foreach ($p in $all) {
        $owner=$null
        try { $owner=(Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid -ErrorAction Stop).Sid } catch {}
        $parent=$map[[int]$p.ParentProcessId]
        $started=if ($p.CreationDate) { $p.CreationDate.ToUniversalTime().ToString('o') } else { $null }
        $age=if ($p.CreationDate) { ((Get-Date)-$p.CreationDate).TotalSeconds } else { 0 }
        $cause='parent '+$p.ParentProcessId+' ('+$parent.Name+')'
        $scheduled=@($tasks[$p.Name.ToLowerInvariant()]); if ($scheduled.Count) { $cause+='; scheduled task: '+($scheduled -join ', ') }
        @{sessionId=[int]$p.SessionId;pid=[int]$p.ProcessId;ppid=[int]$p.ParentProcessId;owner=$owner;name=$p.Name;started=$started;ageSeconds=$age;rssBytes=[long]$p.WorkingSetSize;session=$null;ports=@($ports[[int]$p.ProcessId] | Where-Object {$_});parentDead=(!$parent -or ($parent.CreationDate -gt $p.CreationDate));cause=$cause;protected=($p.CommandLine -match '(\bpaseo\b|\bsshd?\b|\bcodex\b|\bclaude\b|\bopencode\b)')}
    })
    @{rows=$rows;portsKnown=$portsKnown}
}
function Denied($rows, $daemonPid) {
    $deny=@{}; $roots=@{}
    foreach ($p in $rows) {
        if (!$p.owner -or $p.owner -match '^S-1-5-(18|19|20|80|82)(-|$)' -or $p.sessionId -eq 0 -or $p.owner -ne $multiUser -or $p.pid -le 4 -or $p.protected -or $p.name -match '(paseo|sshd?|mosh|codex|claude|opencode|services|svchost|wininit|csrss|lsass|taskhost|winlogon|conhost)') { $deny[$p.pid]=$true; if ($p.pid -ne $daemonPid -and ($p.name -match '(ssh|mosh|codex|claude|opencode)' -or $p.protected)) { $roots[$p.pid]=$true } }
    }
    $deny[[int]$daemonPid]=$true
    do { $changed=$false; foreach ($p in $rows) { if ($roots.ContainsKey($p.ppid) -and !$roots.ContainsKey($p.pid)) { $roots[$p.pid]=$true;$deny[$p.pid]=$true;$changed=$true } } } while ($changed)
    $deny
}
function Candidates($rows, $daemonPid) {
    $deny=Denied $rows $daemonPid
    $counts=@{}; foreach ($p in $rows) { $counts[$p.name]++ }
    @(foreach ($p in $rows) {
        if ($deny.ContainsKey($p.pid) -or !$p.started) { continue }
        $orphan=($p.name -match '^(node|python[\d.]*|bun)(\.exe)?$' -and $p.parentDead -and $p.ageSeconds -ge 21600 -and $p.ports.Count)
        if ($orphan -or $counts[$p.name] -ge 3) {
            $item=@{};foreach($k in $p.Keys){$item[$k]=$p[$k]}
            $item.id='process:'+$p.pid+':'+$p.started;$item.kind='process';$item.tier='CONFIRM'
            $item.reason=if($orphan){'orphan dev server'}else{'same-name pileup; inspect cause before picking'}
            $item
        }
    })
}
function SafeDir($dir) {
    if (!(Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    if ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point refused' }
    $acl=Get-Acl -LiteralPath $dir
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $multiUser) { throw 'Managed directory owner mismatch' }
}
function TempItems {
    $dir=Join-Path $multiRoot 'temp'
    if (!(Test-Path -LiteralPath $dir)) { return @() }
    SafeDir $multiRoot; SafeDir $dir
    @(Get-ChildItem -LiteralPath $dir -File -Force | Where-Object { !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $_.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-2) } | ForEach-Object {
        if ((Get-Acl -LiteralPath $_.FullName).GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $multiUser) { return }
        @{id='temp:'+$_.Name;name=$_.Name;mtime=$_.LastWriteTimeUtc.Ticks;bytes=$_.Length;kind='temp';tier='AUTO';reason='managed file older than two days'}
    })
}
function Audit($event) {
    SafeDir $multiRoot
    $file=Join-Path $multiRoot 'cleanup.jsonl'
    if (Test-Path -LiteralPath $file) { if ((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked audit file refused' } }
    $event.time=[DateTime]::UtcNow.ToString('o')
    $stream=[IO.File]::Open($file,[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    try { $bytes=[Text.Encoding]::UTF8.GetBytes(($event | ConvertTo-Json -Compress)+"`n"); $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true) } finally { $stream.Dispose() }
}
$snap=Snapshot
if ($multiRequest.apply) {
    $events=@(foreach ($item in $multiRequest.items) {
        $event=@{id=$item.id;reason=$item.reason;status='skipped'}
        try {
            $fresh=Snapshot
            $current=@(@(Candidates $fresh.rows $multiRequest.daemonPid)+@(TempItems) | Where-Object {$_.id -eq $item.id})
            if ($current.Count -ne 1 -or $current[0].tier -ne $item.tier -or ($item.tier -eq 'CONFIRM' -and $item.id -notin $multiRequest.picks)) { throw 'Eligibility changed or explicit pick missing' }
            $attempt=@{id=$item.id;reason=$item.reason;status='attempt'};Audit $attempt
            if ($item.kind -eq 'temp') {
                $dir=Join-Path $multiRoot 'quarantine';SafeDir $dir
                $file=Join-Path (Join-Path $multiRoot 'temp') $current[0].name
                $info=Get-Item -LiteralPath $file -Force
                if ($info.LastWriteTimeUtc.Ticks -ne $item.mtime -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'File changed' }
                # Windows refuses moving a locked file; never force or recurse.
                $destination=Join-Path $dir (([guid]::NewGuid().ToString())+'.quarantined')
                [IO.File]::Move($file,$destination);[IO.File]::SetLastWriteTimeUtc($destination,[DateTime]::UtcNow)
                $event.status='quarantined'
            } else {
                $deny=Denied $fresh.rows $multiRequest.daemonPid
                $tree=@{};$tree[[int]$current[0].pid]=$true
                do {$changed=$false;foreach($p in $fresh.rows){if($tree.ContainsKey($p.ppid) -and !$tree.ContainsKey($p.pid)){$tree[$p.pid]=$true;$changed=$true}}}while($changed)
                if (@($fresh.rows | Where-Object {$tree.ContainsKey($_.pid) -and $deny.ContainsKey($_.pid)}).Count) { throw 'Protected process in tree' }
                & taskkill.exe /PID $current[0].pid /T 2>$null | Out-Null
                Start-Sleep -Seconds 2
                $after=Snapshot
                $survivor=@($after.rows | Where-Object {$_.pid -eq $current[0].pid})
                if ($survivor.Count) {
                    if ($survivor[0].started -ne $current[0].started) { throw 'PID reused during grace period' }
                    $newTree=@{};$newTree[[int]$current[0].pid]=$true
                    do{$changed=$false;foreach($p in $after.rows){if($newTree.ContainsKey($p.ppid) -and !$newTree.ContainsKey($p.pid)){$newTree[$p.pid]=$true;$changed=$true}}}while($changed)
                    foreach($p in $after.rows){if($newTree.ContainsKey($p.pid)){
                        $original=@($fresh.rows|Where-Object {$_.pid -eq $p.pid -and $_.started -eq $p.started})
                        if (!$tree.ContainsKey($p.pid) -or $original.Count -ne 1) {throw 'Process tree changed during grace period'}
                    }}
                    $newDenied=Denied $after.rows $multiRequest.daemonPid
                    foreach($p in $after.rows){if($tree.ContainsKey($p.pid) -and $newDenied.ContainsKey($p.pid)){throw 'Tree protection changed'}}
                    & taskkill.exe /PID $current[0].pid /T /F 2>$null | Out-Null
                }
                # Do not claim success on access denied or a remaining child.
                $remaining=Snapshot
                if (@($remaining.rows | Where-Object {$tree.ContainsKey($_.pid)}).Count) { throw 'Process tree termination unconfirmed' }
                $event.status='terminated'
            }
        } catch { $event.detail=$_.Exception.Message }
        Audit $event; $event
    })
    $quarantine=Join-Path $multiRoot 'quarantine'
    $purged=@()
    if($multiRequest.purge -ne $false -and (Test-Path -LiteralPath $quarantine)){SafeDir $quarantine; Get-ChildItem -LiteralPath $quarantine -File | Where-Object {$_.Name -match '^[a-f0-9-]{36}\.quarantined$' -and !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $_.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-7)} | ForEach-Object {
        if ((Get-Acl -LiteralPath $_.FullName).GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $multiUser) { return }
        $event=@{id='quarantine:'+$_.Name;reason='seven day quarantine retention';status='purge-attempt'};Audit $event
        try{[IO.File]::Delete($_.FullName);$event.status='purged'}catch{$event.status='locked'};Audit $event; $purged+=@($event)
    }}
    $multiResult=@($events)+@($purged)
} else {
    $os=Get-CimInstance Win32_OperatingSystem
    $cpu=@(Get-CimInstance Win32_Processor | ForEach-Object {$_.LoadPercentage} | Measure-Object -Average).Average
    $drive=Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='"+[IO.Path]::GetPathRoot($env:USERPROFILE).TrimEnd('\')+"'")
    $multiResult=@{version=1;platform='Windows';cpuPercent=$cpu;ram=@{totalBytes=[long]$os.TotalVisibleMemorySize*1024;availableBytes=[long]$os.FreePhysicalMemory*1024};disk=@{totalBytes=[long]$drive.Size;freeBytes=[long]$drive.FreeSpace};topProcesses=@($snap.rows|Sort-Object rssBytes -Descending|Select-Object -First 10);processCounts=@($snap.rows|Group-Object name|Sort-Object Count -Descending|ForEach-Object {@{name=$_.Name;count=$_.Count;causes=@($_.Group.cause|Select-Object -Unique)}});processes=@($snap.rows);portsKnown=$snap.portsKnown;temp=(Size $env:TEMP);managedTemp=(Size (Join-Path $multiRoot 'temp'));candidates=@(@(Candidates $snap.rows $multiRequest.daemonPid)+@(TempItems))}
}
