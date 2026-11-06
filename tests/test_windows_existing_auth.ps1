# Disposable Windows CI only: real current-account SSH auth, per-session process lifetime, no user creation.
param([Parameter(Mandatory=$true)][string]$OpenSshDirectory,[switch]$CompatibilityRuntime)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'customer/windows-client.ps1') -Mode Library
function Assert-True($Value,[string]$Message) { if (-not $Value) { throw $Message } }
$account=Get-SupportExecutorAccount
$before=Get-LocalUser -SID $account.ops_sid|Select-Object Name,Enabled,Description,AccountExpires,PasswordLastSet,UserMayChangePassword
$profile=[Environment]::GetFolderPath('UserProfile')
$oldProgramData=$env:ProgramData
$testRoot=Join-Path $oldProgramData ('TSuiteExistingAuthTest-'+[guid]::NewGuid().ToString('N'))
$sessions=New-Object 'Collections.Generic.List[object]'
$clients=New-Object 'Collections.Generic.List[Diagnostics.Process]'
$sentinel=$null
try {
    New-PrivateDirectory $testRoot
    $env:ProgramData=$testRoot
    $supportRoot=Get-SupportRoot
    $runtime=Join-Path $testRoot 'runtime';New-PrivateDirectory $runtime
    Get-ChildItem -LiteralPath $OpenSshDirectory -Force|ForEach-Object {Copy-Item $_.FullName $runtime -Recurse -Force}
    Set-OpenSshRuntimePermissions $runtime $true
    $sshd=Join-Path $runtime 'sshd.exe';$ssh=Join-Path $runtime 'ssh.exe';$keygen=Join-Path $runtime 'ssh-keygen.exe'
    $hostExecutable=(Get-Process -Id $PID).Path
    $sleepCommand=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('Start-Sleep -Seconds 300'))
    $sentinel=Start-Process $hostExecutable -ArgumentList "-NoProfile -NonInteractive -EncodedCommand $sleepCommand" -PassThru -NoNewWindow
    foreach($index in 1..2) {
        $id=[guid]::NewGuid().ToString('N').Substring(0,12)
        $directory=Join-Path $supportRoot $id;New-PrivateDirectory $directory
        $client=Join-Path $directory 'client.ps1'
        Copy-Item (Join-Path (Split-Path -Parent $PSScriptRoot) 'customer/windows-client.ps1') $client
        Set-ServiceFilePermissions $client
        $hostKey=Join-Path $directory 'ssh_host_ed25519_key'
        $ca=Join-Path $directory 'operator_ed25519';$identity=Join-Path $directory 'identity'
        foreach($key in @($hostKey,$ca,$identity)) {
            $p=Start-Process $keygen -ArgumentList ('-q -t ed25519 -N "" -f "{0}"' -f $key) -Wait -PassThru -NoNewWindow
            try{Assert-True ($p.ExitCode -eq 0) 'Test key generation failed.'}finally{$p.Dispose()}
            Set-ServiceFilePermissions $key
        }
        $p=Start-Process $keygen -ArgumentList ('-q -s "{0}" -I existing-account-test -n "{1}" -V -1m:+10m "{2}.pub"' -f $ca,$id,$identity) -Wait -PassThru -NoNewWindow
        try{Assert-True ($p.ExitCode -eq 0) 'Test certificate signing failed.'}finally{$p.Dispose()}
        $pub=((Get-Content "$ca.pub" -Raw).Trim() -split '\s+')[0..1]-join ' '
        $expiry=Format-WindowsOpenSshExpiry ([DateTimeOffset]::UtcNow.AddMinutes(10))
        $keys=Join-Path $directory 'authorized_keys'
        Write-Utf8 $keys ((('expiry-time="{0}",from="127.0.0.1",no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc {1}' -f $expiry,$pub)+"`n")+
            ('cert-authority,principals="{0}",expiry-time="{1}",from="127.0.0.1",no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc {2}' -f $id,$expiry,$pub))
        Set-ServiceFilePermissions $keys
        $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
        $path=$directory.Replace('\','/')
        $options=Get-WindowsSshdRuntimeOptions ([bool]$CompatibilityRuntime) $path
        $config=Join-Path $directory 'sshd_config'
        Write-Utf8 $config @"
ListenAddress 127.0.0.1
Port $port
HostKey "$path/ssh_host_ed25519_key"
AuthorizedKeysFile "$path/authorized_keys"
AllowUsers "$($account.ssh_allow_user)"
AuthenticationMethods publickey
PubkeyAuthentication yes
PasswordAuthentication no
AllowTcpForwarding no
AllowAgentForwarding no
$options
"@
        Set-ServiceFilePermissions $config
        $state=[pscustomobject]@{session_id=$id;account_mode='existing';ops_user=$account.ops_user;ops_sid=$account.ops_sid;
            ssh_user=$account.ssh_user;expires_at=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+600;portable_operator=$true;
            ssh_path=$ssh;sshd_path=$sshd;local_port=$port}
        Write-Utf8 (Join-Path $directory 'session.json') ($state|ConvertTo-Json -Compress)
        $name="TSuiteSupport-$id-Sshd"
        $run="`$env:ProgramData='"+$testRoot.Replace("'","''")+"'; & '"+$client.Replace("'","''")+"' -Mode Sshd -SessionId $id"
        $action=New-ScheduledTaskAction -Execute $hostExecutable -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($run)))
        $principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest
        $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
        $session=[pscustomobject]@{Id=$id;Directory=$directory;Task=$name;Port=$port;CA=$ca;Identity=$identity;State=$state}
        $sessions.Add($session)
        Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Settings $settings|Out-Null
        Start-ScheduledTask -TaskName $name
        $ready=$false
        for($attempt=0;$attempt -lt 100;$attempt++) {
            $tcp=New-Object Net.Sockets.TcpClient
            try{$tcp.Connect('127.0.0.1',$port);$ready=$true;break}catch{Start-Sleep -Milliseconds 200}finally{$tcp.Dispose()}
        }
        Assert-True $ready 'Job-controlled listener did not start.'
        $hostPublic=((Get-Content "$hostKey.pub" -Raw).Trim() -split '\s+')[0..1]-join ' '
        $known=Join-Path $directory 'known_hosts';Write-Utf8 $known "[127.0.0.1]:$port $hostPublic`n"
        foreach($key in @($ca,$identity)) {
            & $ssh -F none -T -i $key -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes `
                -o "UserKnownHostsFile=$known" -o ConnectTimeout=10 -p $port -l $account.ssh_user 127.0.0.1 'cmd.exe /d /c exit 0'
            Assert-True ($LASTEXITCODE -eq 0) 'Existing account plain-key/certificate login failed.'
        }
        # Real renewal must preserve the pre-existing account properties.
        Set-SupportExpiry $state ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+600)
        $pidFile=Join-Path $directory 'remote-pid.txt'
        $command="[IO.File]::WriteAllText('"+$pidFile.Replace("'","''")+"',[string]`$PID);Start-Sleep -Seconds 180"
        $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
        $args='-F none -T -i "{0}" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="{1}" -o ConnectTimeout=10 -p {2} -l "{3}" 127.0.0.1 "powershell.exe -NoProfile -NonInteractive -EncodedCommand {4}"' -f $identity,$known,$port,$account.ssh_user,$encoded
        $connection=Start-Process $ssh -ArgumentList $args -PassThru -NoNewWindow
        $clients.Add($connection)
        for($attempt=0;$attempt -lt 100;$attempt++){if(Test-Path $pidFile){break};Start-Sleep -Milliseconds 100}
        Assert-True (Test-Path $pidFile) 'Remote command did not start.'
        $session|Add-Member -NotePropertyName RemotePid -NotePropertyValue ([int](Get-Content $pidFile -Raw))
    }
    # Normal cleanup of A must not stop B, the desktop sentinel, or alter/delete the account/profile.
    Remove-SupportSession $sessions[0].Id
    Start-Sleep -Seconds 1
    Assert-True (-not(Get-Process -Id $sessions[0].RemotePid -ErrorAction SilentlyContinue)) 'Session A command survived cleanup.'
    Assert-True ([bool](Get-Process -Id $sessions[1].RemotePid -ErrorAction SilentlyContinue)) 'Session B was stopped by A cleanup.'
    Assert-True (-not $sentinel.HasExited) 'An unrelated current-user process was stopped.'
    # Forced task termination must also close its Job and descendants.
    Stop-ScheduledTask -TaskName $sessions[1].Task
    Start-Sleep -Seconds 1
    Assert-True (-not(Get-Process -Id $sessions[1].RemotePid -ErrorAction SilentlyContinue)) 'Session B command escaped task/Job termination.'
    Remove-SupportSession $sessions[1].Id
    $after=Get-LocalUser -SID $account.ops_sid|Select-Object Name,Enabled,Description,AccountExpires,PasswordLastSet,UserMayChangePassword
    Assert-True (($before|ConvertTo-Json -Compress) -ceq ($after|ConvertTo-Json -Compress)) 'Existing account properties changed.'
    Assert-True (Test-Path $profile) 'Existing user profile was removed.'
    Assert-True (-not $sentinel.HasExited) 'Original user processes did not survive both cleanup paths.'
    Write-Output 'Existing-account authentication, renewal, two-session isolation and forced Job cleanup passed.'
    $global:LASTEXITCODE=0
} catch {
    foreach($session in $sessions) {
        foreach($name in @('Sshd.native.log','Sshd.stderr.log')) {
            $log=Join-Path $session.Directory $name
            if(Test-Path $log){Get-Content $log -Tail 30|Write-Output}
        }
    }
    throw
} finally {
    foreach($session in $sessions) {
        Stop-ScheduledTask -TaskName $session.Task -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $session.Task -Confirm:$false -ErrorAction SilentlyContinue
    }
    foreach($connection in $clients){if(-not$connection.HasExited){$connection.Kill();$connection.WaitForExit()};$connection.Dispose()}
    if($sentinel){if(-not$sentinel.HasExited){$sentinel.Kill();$sentinel.WaitForExit()};$sentinel.Dispose()}
    $env:ProgramData=$oldProgramData
    if(Test-Path $testRoot){Remove-Item $testRoot -Recurse -Force}
}
