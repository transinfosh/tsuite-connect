# Isolated regressions: no real accounts, tasks, user hives or processes are changed.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'customer/windows-client.ps1') -Mode Library
$nativeProfileRemoval = ${function:Remove-SupportUserProfile}
function Assert-True($Value, [string]$Message) { if (-not $Value) { throw $Message } }
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('tsuite-cleanup-' + [guid]::NewGuid().ToString('N'))
$id = '012345abcdef'
$directory = Join-Path $testRoot $id
[void][IO.Directory]::CreateDirectory($directory)
$oldComputerName = $env:COMPUTERNAME
$env:COMPUTERNAME = 'CLEANUP-TEST'
$script:state = [pscustomobject]@{session_id=$id; ops_user='tsuite-ops-012345ab'; ssh_path='ssh.exe'; sshd_path='sshd.exe'}
$script:events = New-Object 'Collections.Generic.List[string]'
$script:description = "TSuite temporary support $id"
$script:profileLocked = $false
$script:profileCalls = 0
$script:ownedRunning = $true
$script:stopFails = $false
function Get-SupportRoot { return $testRoot }
function Read-SupportState { param($Id) return $script:state }
function Get-LocalUser { param($Name, $ErrorAction)
    return [pscustomobject]@{Description=$script:description; SID=[pscustomobject]@{Value='S-1-5-21-1-2-3-1001'}}
}
function Disable-LocalUser { param($SID) $script:events.Add('disable-user') }
function Get-ScheduledTask { param($TaskName, $ErrorAction) return [pscustomobject]@{TaskName=$TaskName} }
function Stop-ScheduledTask { param($InputObject) $script:events.Add('stop-task') }
function Unregister-ScheduledTask { param($InputObject, $TaskName, [switch]$Confirm, $ErrorAction)
    if ($TaskName -like '*-Cleanup') { $script:events.Add('remove-cleanup-task') }
}
function Get-CimInstance { param($ClassName, $Filter)
    if ($ClassName -eq 'Win32_Process' -and $Filter -ne "Name='ssh.exe' OR Name='sshd.exe'") {
        throw 'Regression: cleanup scanned all processes through WMI.'
    }
    return @()
}
function Invoke-CimMethod { throw 'Regression: per-process WMI calls are forbidden during cleanup.' }
function Get-Process { param([switch]$IncludeUserName, $ErrorAction)
    Assert-True $IncludeUserName 'Owner lookup must use native process metadata.'
    if ($script:ownedRunning) { [pscustomobject]@{Id=101; UserName='CLEANUP-TEST\tsuite-ops-012345ab'} }
    [pscustomobject]@{Id=102; UserName='CLEANUP-TEST\unrelated-user'}
    [pscustomobject]@{Id=103; UserName='OTHER-DOMAIN\tsuite-ops-012345ab'}
}
function Stop-Process { param($InputObject, [switch]$Force, $ErrorAction)
    Assert-True ($InputObject.Id -eq 101) 'Never stop another account process.'
    $script:events.Add('stop-owned-process')
    if (-not $script:stopFails) { $script:ownedRunning = $false }
}
function Remove-SupportUserProfile { param($Sid)
    $script:profileCalls++
    $script:events.Add('remove-profile')
    if ($script:profileLocked) { throw (New-Object ComponentModel.Win32Exception(32)) }
}
function Remove-LocalUser { param($SID) $script:events.Add('remove-user') }
function Remove-Item { param($LiteralPath, [switch]$Recurse, [switch]$Force)
    if ($LiteralPath -eq $directory) { $script:events.Add('remove-session-files') }
    else { Microsoft.PowerShell.Management\Remove-Item -LiteralPath $LiteralPath -Force }
}
try {
    Remove-SupportSession $id
    Assert-True ($script:events[0] -eq 'disable-user') 'Revoke login before cleanup.'
    Assert-True $script:events.Contains('stop-owned-process') 'Owned shells must be stopped without WMI.'
    Assert-True ($script:events.IndexOf('remove-profile') -lt $script:events.IndexOf('remove-user')) 'Keep SID ownership until profile removal succeeds.'
    Assert-True ($script:events[$script:events.Count-1] -eq 'remove-cleanup-task') 'Remove the retry task last.'

    $script:ownedRunning = $true; $script:stopFails = $true
    $calls = $script:profileCalls; $refused = $false
    try { Remove-SupportSession $id } catch { $refused = $true }
    Assert-True ($refused -and $script:profileCalls -eq $calls) 'Never unload a profile while its account still has running processes.'
    $script:ownedRunning = $false; $script:stopFails = $false

    $script:events.Clear(); $script:profileLocked = $true
    Remove-SupportSession $id
    $retryPath = Join-Path $directory 'cleanup-retry.json'
    $retry = Get-Content -LiteralPath $retryPath -Raw | ConvertFrom-Json
    Assert-True ($retry.attempts -eq 1) 'Persist the first profile failure.'
    Assert-True ($retry.next_attempt_at -ge [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+290) 'Back off for five minutes after a sharing violation.'
    Assert-True (-not $script:events.Contains('remove-user')) 'Keep the disabled account while its profile remains.'
    Assert-True (-not $script:events.Contains('remove-session-files')) 'Preserve recovery state after a profile failure.'
    Assert-True (-not $script:events.Contains('remove-cleanup-task')) 'Preserve the retry task after a profile failure.'

    $script:events.Clear(); $calls = $script:profileCalls
    Remove-SupportSession $id
    Assert-True ($script:profileCalls -eq $calls) 'A one-minute task trigger must not repeat blocked profile deletion.'
    Assert-True $script:events.Contains('disable-user') 'Backoff must not skip login revocation.'
    Assert-True ($script:events.IndexOf('stop-task') -ge 0) 'Backoff must not skip transport revocation.'

    $retry.next_attempt_at = 0
    Write-Utf8 $retryPath ($retry | ConvertTo-Json -Compress)
    Remove-SupportSession $id
    $retry = Get-Content -LiteralPath $retryPath -Raw | ConvertFrom-Json
    Assert-True ($retry.attempts -eq 2) 'Retry failures increment the persisted attempt count.'
    Assert-True ($retry.next_attempt_at -ge [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+590) 'Repeated failures increase the backoff.'

    $retry.attempts = 20; $retry.next_attempt_at = 0
    Write-Utf8 $retryPath ($retry | ConvertTo-Json -Compress)
    Remove-SupportSession $id
    $retry = Get-Content -LiteralPath $retryPath -Raw | ConvertFrom-Json
    Assert-True ($retry.next_attempt_at -le [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+3600) 'Backoff must remain bounded.'

    $retry.session_id = 'fedcba543210'; $retry.next_attempt_at = 0
    Write-Utf8 $retryPath ($retry | ConvertTo-Json -Compress)
    $calls = $script:profileCalls; $refused = $false
    try { Remove-SupportSession $id } catch { $refused = $true }
    Assert-True ($refused -and $script:profileCalls -eq $calls) 'Reject retry state belonging to another session.'

    $retry.session_id = $id
    Write-Utf8 $retryPath ($retry | ConvertTo-Json -Compress)
    $script:profileLocked = $false; $script:events.Clear()
    Remove-SupportSession $id
    Assert-True $script:events.Contains('remove-user') 'A later successful retry must finish account removal.'
    Assert-True ($script:events[$script:events.Count-1] -eq 'remove-cleanup-task') 'A successful retry must remove its task last.'

    $script:description = 'Unrelated existing account'; $script:events.Clear(); $refused = $false
    try { Remove-SupportSession $id } catch { $refused = $true }
    Assert-True ($refused -and $script:events.Count -eq 0) 'Ownership mismatch must make no changes.'

    # Exercise the real hive/profile function against native-boundary fakes.
    $script:hives = New-Object 'Collections.Generic.List[string]'
    $script:unloadFails = $false
    $sid = 'S-1-5-21-1-2-3-1001'
    function Test-Path { param($LiteralPath)
        Assert-True ($LiteralPath -in @("Registry::HKEY_USERS\${sid}_Classes", "Registry::HKEY_USERS\$sid")) 'Only this account hives may be inspected.'
        return $true
    }
    function Dismount-SupportUserHive { param($Hive)
        $script:hives.Add("HKU\$Hive")
        if ($script:unloadFails) { throw 'simulated unload failure' }
    }
    function Get-CimInstance { param($ClassName, $Filter)
        Assert-True ($ClassName -eq 'Win32_UserProfile' -and $Filter -eq "SID='$sid'") 'Profile deletion must filter by the verified account SID.'
        $script:hives.Add('query-profile')
        return [pscustomobject]@{SID=$sid}
    }
    function Remove-CimInstance { param([Parameter(ValueFromPipeline=$true)]$InputObject)
        Assert-True ($InputObject.SID -eq $sid) 'Only delete the selected profile.'
        $script:hives.Add('delete-profile')
    }
    & $nativeProfileRemoval $sid
    Assert-True (($script:hives -join ',') -eq "HKU\${sid}_Classes,HKU\$sid,query-profile,delete-profile") 'Unload both stale hives before deleting the profile.'
    $script:hives.Clear(); $script:unloadFails = $true; $refused = $false
    try { & $nativeProfileRemoval $sid } catch { $refused = $true }
    Assert-True ($refused -and -not $script:hives.Contains('delete-profile')) 'Do not proceed after a failed hive unload.'
    $script:hives.Clear(); $refused = $false
    try { & $nativeProfileRemoval 'S-1-5-18' } catch { $refused = $true }
    Assert-True ($refused -and $script:hives.Count -eq 0) 'Reject system or malformed profile SIDs.'
    Write-Output 'Windows cleanup ownership, native process lookup and retry regressions passed.'
} finally {
    $env:COMPUTERNAME = $oldComputerName
    [IO.Directory]::Delete($testRoot, $true)
}
