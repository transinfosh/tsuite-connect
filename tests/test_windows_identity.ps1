# Isolated account reuse regressions; no real account, profile, task or process changes.
param([string]$ClientPath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $ClientPath) { $ClientPath=Join-Path (Split-Path -Parent $PSScriptRoot) 'customer/windows-client.ps1' }
. $ClientPath -Mode Library
function Assert-True($Value,[string]$Message) { if (-not $Value) { throw $Message } }
function Assert-Rejected([scriptblock]$Call,[string]$Message) {
    $failed=$false;try { & $Call } catch { $failed=$true };Assert-True $failed $Message
}
$root=Join-Path ([IO.Path]::GetTempPath()) ('tsuite-identity-'+[guid]::NewGuid().ToString('N'))
$id='012345abcdef';$other='fedcba543210';$directory=Join-Path $root $id
[void][IO.Directory]::CreateDirectory($directory)
$originalComputerName=$env:COMPUTERNAME;$env:COMPUTERNAME='IDENTITY-TEST'
$script:sid='S-1-5-21-1-2-3-1001'
$script:identity=[pscustomobject]@{Name='IDENTITY-TEST\Normal User';IsSystem=$false;User=[pscustomobject]@{Value=$script:sid}}
$script:local=[pscustomobject]@{Name='Normal User';Enabled=$true}
$script:events=New-Object 'Collections.Generic.List[string]'
function Get-SupportWindowsIdentity { return $script:identity }
function Get-SupportUserPrincipalName { return 'operator@corp.example' }
function Get-LocalUser { param($SID,$ErrorAction) return $script:local }
function New-LocalUser { throw 'Existing-account mode must never create users.' }
function Disable-LocalUser { throw 'Existing-account mode must never disable users.' }
function Set-LocalUser { throw 'Existing-account mode must never change account expiry or password.' }
function Remove-LocalUser { throw 'Existing-account mode must never remove users.' }
function Add-LocalGroupMember { throw 'Existing-account mode must never change groups.' }
function Get-SupportUserProcesses { throw 'Existing-account mode must never scan all processes owned by the user.' }
function Remove-SupportUserProfile { throw 'Existing-account mode must never delete or unload the user profile.' }
function Get-SupportRoot { return $root }
function Assert-PrivateDirectory { param($Path) }
function Set-ServiceFilePermissions { param($Path) $script:events.Add('set-session-acl') }
function Resolve-SupportAccountSid { param($Name) return $script:sid }
function Get-ScheduledTask { param($TaskName,$ErrorAction) return [pscustomobject]@{TaskName=$TaskName} }
function Stop-ScheduledTask { param($InputObject) $script:events.Add('stop-'+$InputObject.TaskName) }
function Start-ScheduledTask { param($TaskName) $script:events.Add('start-'+$TaskName) }
function Unregister-ScheduledTask { param($InputObject,$TaskName,[switch]$Confirm,$ErrorAction)
    if ($InputObject) { $script:events.Add('remove-'+$InputObject.TaskName) }
    else { $script:events.Add('remove-'+$TaskName) }
}
function Get-CimInstance { param($ClassName,$Filter)
    Assert-True ($ClassName -eq 'Win32_Process' -and $Filter -eq "Name='ssh.exe' OR Name='sshd.exe'") 'Only query session SSH processes.'
    return @()
}
try {
    Assert-True ((Get-SupportAccountMode ([pscustomobject]@{})) -eq 'temporary') 'Old states must retain temporary-account behavior.'
    Assert-True ((Get-SupportAccountMode @{account_mode='existing'}) -eq 'existing') 'Bootstrap hashtable mode must be recognized.'
    Assert-Rejected { Get-SupportAccountMode @{account_mode='unknown'} } 'Unknown mode must fail closed.'
    Assert-Rejected { Get-SupportAccountMode @{account_mode=$null} } 'Null mode must not fall back to destructive cleanup.'
    $account=Get-SupportExecutorAccount
    Assert-True ($account.ops_sid -eq $script:sid -and $account.ops_user -eq 'IDENTITY-TEST\Normal User') 'Bind the executing account SID and canonical name.'
    Assert-True ($account.ssh_user -eq 'normal user') 'Local SSH users must use the lower-case SAM name.'
    $script:local=$null;$script:identity.Name='CORP\Operator'
    Assert-True ((Get-SupportExecutorAccount).ssh_user -eq 'operator@corp.example') 'Domain SSH identity must use its system-resolved UPN for cross-platform clients.'
    $script:identity.IsSystem=$true
    Assert-Rejected { Get-SupportExecutorAccount } 'SYSTEM cannot become a reusable support account.'
    $script:identity.IsSystem=$false;$script:identity.User.Value='S-1-12-1-1-2-3-4'
    Assert-Rejected { Get-SupportExecutorAccount } 'Entra/service identities must fail before enrollment.'
    $script:identity.User.Value=$script:sid;$script:identity.Name='IDENTITY-TEST\tsuite-ops-12345678'
    Assert-Rejected { Get-SupportExecutorAccount } 'Never reuse another session temporary account.'

    $state=[pscustomobject]@{session_id=$id;account_mode='existing';ops_user=$account.ops_user;ops_sid=$script:sid;
        ssh_user=$account.ssh_user;expires_at=100;portable_operator=$false;ssh_path='ssh.exe';sshd_path='sshd.exe'}
    Write-Utf8 (Join-Path $directory 'session.json') ($state|ConvertTo-Json -Compress)
    Assert-True ((Read-SupportState $id).account_mode -eq 'existing') 'Existing users must not be subjected to temporary-name validation.'
    $keys=Join-Path $directory 'authorized_keys'
    Write-Utf8 $keys 'expiry-time="20260909000000" ssh-ed25519 fixture'
    Set-SupportExpiry $state 200
    Assert-True ($state.expires_at -eq 200) 'Existing account sessions must renew without account mutation.'
    $before=[IO.File]::ReadAllText($keys)
    $script:sid='S-1-5-21-1-2-3-1002'
    Assert-Rejected { Set-SupportExpiry $state 300 } 'A different SID cannot inherit session renewal.'
    Assert-True ([IO.File]::ReadAllText($keys) -ceq $before) 'Identity rejection must not extend key validity.'
    $script:sid=$state.ops_sid

    $state.expires_at=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+600
    Write-Utf8 (Join-Path $directory 'session.json') ($state|ConvertTo-Json -Compress)
    $script:sid='S-1-5-21-1-2-3-1002';$script:events.Clear()
    Assert-Rejected { Invoke-SupportProcess $state 'Sshd' } 'Changed identities must not start a listener.'
    function Request-SupportLease { throw 'Changed identities must not contact the lease service.' }
    Watch-SupportLease $id
    Assert-True (Test-Path (Join-Path $directory 'closing')) 'Identity changes must close the session.'
    Assert-True $script:events.Contains("start-TSuiteSupport-$id-Cleanup") 'Schedule only the changed session cleanup.'
    $script:sid=$state.ops_sid

    $otherDirectory=Join-Path $root $other
    [void][IO.Directory]::CreateDirectory($otherDirectory)
    Write-Utf8 (Join-Path $otherDirectory 'sentinel') 'another session using the same account'
    $script:events.Clear()
    Remove-SupportSession $id
    Assert-True (-not(Test-Path $directory)) 'Remove only this session directory.'
    Assert-True (Test-Path (Join-Path $otherDirectory 'sentinel')) 'Another session directory must survive.'
    Assert-True (@($script:events|Where-Object {$_ -match 'TSuiteSupport-' -and $_ -notlike "*TSuiteSupport-$id-*"}).Count -eq 0) 'Only stop tasks belonging to this session.'
    Assert-True ($script:events[$script:events.Count-1] -eq "remove-TSuiteSupport-$id-Cleanup") 'Remove the cleanup task last.'
    [void][IO.Directory]::CreateDirectory($directory)
    $state.account_mode='invalid';Write-Utf8 (Join-Path $directory 'session.json') ($state|ConvertTo-Json -Compress)
    $script:events.Clear()
    Assert-Rejected { Remove-SupportSession $id } 'Unknown modes must be rejected before changing resources.'
    Assert-True ($script:events.Count -eq 0) 'Invalid state must make no changes.'

    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        # Exercise the real bootstrap function with a native stdin fixture, not a PS host.
        $bootstrap=Join-Path (Split-Path -Parent $ClientPath) 'bootstrap.ps1'
        $ast=[Management.Automation.Language.Parser]::ParseFile($bootstrap,[ref]$null,[ref]$null)
        $definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-Enrollment'},$true)
        . ([scriptblock]::Create($definition.Extent.Text))
        $sshPath=Join-Path $root 'enroll-fixture.exe'
        Add-Type -OutputAssembly $sshPath -OutputType ConsoleApplication -TypeDefinition @'
using System;
using System.IO;
public static class EnrollmentFixture {
    public static int Main(string[] args) {
        using (var data=new MemoryStream()) {
            Console.OpenStandardInput().CopyTo(data);
            File.WriteAllBytes(Environment.GetEnvironmentVariable("TSUITE_IDENTITY_TEST_INPUT"),data.ToArray());
        }
        Console.WriteLine("{}");return 0;
    }
}
'@
        $temporary=$root
        $configuration=[pscustomobject]@{bastion_host='fixture.invalid';bastion_port=22}
        $previousTestInput=$env:TSUITE_IDENTITY_TEST_INPUT
        $originalInputEncoding=[Console]::InputEncoding
        try {
            $env:TSUITE_IDENTITY_TEST_INPUT=Join-Path $root 'enrollment-input.json'
            [Console]::InputEncoding=New-Object Text.UTF8Encoding($true)
            $beforeEncoding=$OutputEncoding
            $expected=[string]([char]0x64cd)+[char]0x4f5c+[char]0x5458
            Invoke-Enrollment 'enroll' @{customer_ssh_user=$expected}|Out-Null
            $bytes=[IO.File]::ReadAllBytes($env:TSUITE_IDENTITY_TEST_INPUT)
            Assert-True (-not($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)) 'Enrollment stdin must not have a UTF-8 BOM.'
            $request=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json
            Assert-True ($request.customer_ssh_user -ceq $expected) 'Native enrollment stdin lost the Unicode identity.'
            Assert-True ($OutputEncoding -eq $beforeEncoding) 'Enrollment must preserve the caller encoding.'
            Assert-True ([Console]::InputEncoding.GetPreamble().Length -eq 3) 'Enrollment must preserve the host input encoding.'
        } finally {
            [Console]::InputEncoding=$originalInputEncoding
            $env:TSUITE_IDENTITY_TEST_INPUT=$previousTestInput
        }
    }
    Write-Output 'Windows existing-account identity, renewal, cleanup and cross-session regressions passed.'
} finally {
    $env:COMPUTERNAME=$originalComputerName
    [IO.Directory]::Delete($root,$true)
}
