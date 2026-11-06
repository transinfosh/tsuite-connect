# Windows PowerShell 5.1. This file contains no enrollment credentials.
[CmdletBinding()]
param(
    [ValidateSet('Library', 'Sshd', 'Tunnel', 'Monitor', 'Activity', 'Close', 'Cleanup')]
    [string]$Mode = 'Library',
    [string]$SessionId
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-SessionId([string]$Value) {
    if ($Value -cnotmatch '^[a-f0-9]{12}$') { throw 'Invalid session ID.' }
}

function Test-SupportSshUser([string]$Value) {
    if ($Value.Length -eq 0 -or $Value.Length -gt 256 -or $Value -cne $Value.Trim() -or
        $Value -cmatch '[\x00-\x1f\x7f''`";&<>|(){}$\\*/?\[\]!]' -or $Value -cmatch '(^-|\s-)') { return $false }
    if ($Value.Contains('@')) {
        $parts=$Value.Split('@')
        if ($parts.Count -ne 2 -or -not $parts[0] -or $parts[1] -cnotmatch '^[A-Za-z0-9][A-Za-z0-9.-]*$') { return $false }
    }
    return $true
}

function Test-SupportAccountName([string]$Value) {
    return ($Value.Length -gt 0 -and $Value.Length -le 256 -and $Value -ceq $Value.Trim() -and
        $Value -cnotmatch '[\x00-\x1f\x7f"*/?\[\]!@]' -and
        @($Value.Split('\')).Count -eq 2 -and @($Value.Split('\') | Where-Object { $_.Length -eq 0 }).Count -eq 0)
}

function Get-SupportUserPrincipalName {
    if (-not ('TSuiteSupport.AccountNames' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.ComponentModel;
using System.Runtime.InteropServices;
namespace TSuiteSupport {
    public static class AccountNames {
        [DllImport("secur32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
        static extern bool GetUserNameEx(int format,StringBuilder value,ref uint length);
        public static string Principal() {
            uint length=0;GetUserNameEx(8,null,ref length);
            if(length<2 || length>4096)throw new Win32Exception();
            var value=new StringBuilder((int)length);
            if(!GetUserNameEx(8,value,ref length))throw new Win32Exception();
            return value.ToString();
        }
    }
}
'@
    }
    return [TSuiteSupport.AccountNames]::Principal()
}

function Get-SupportAccountMode($State) {
    if ($State -is [Collections.IDictionary]) {
        if (-not $State.Contains('account_mode')) { return 'temporary' }
        $value = $State['account_mode']
    } else {
        $property = $State.PSObject.Properties['account_mode']
        if (-not $property) { return 'temporary' }
        $value = $property.Value
    }
    if ($value -cnotin @('existing', 'temporary')) { throw 'Invalid support account mode.' }
    return $value
}

function Get-SupportWindowsIdentity { return [Security.Principal.WindowsIdentity]::GetCurrent() }

function Get-SupportExecutorAccount {
    $identity = Get-SupportWindowsIdentity
    $sid = $identity.User.Value
    if ($identity.IsSystem -or $sid -cnotmatch '^S-1-5-21-\d+-\d+-\d+-\d+$') {
        throw 'Run the customer command as a local or Active Directory administrator, not a service or Entra ID identity.'
    }
    $local = Get-LocalUser -SID $sid -ErrorAction SilentlyContinue
    if ($local) {
        if (-not $local.Enabled) { throw 'The current Windows account is disabled.' }
        $name = "$env:COMPUTERNAME\$($local.Name)"
        $sshUser = $local.Name.ToLowerInvariant()
        $allowUser = $sshUser
    } else {
        $name = $identity.Name
        $allowUser = $name.ToLowerInvariant()
        # Modern Unix OpenSSH rejects the backslash SAM form; UPN works on both support platforms.
        $sshUser = (Get-SupportUserPrincipalName).ToLowerInvariant()
        if ((Resolve-SupportAccountSid $sshUser) -cne $sid) { throw 'Windows UPN does not match the executing account SID.' }
    }
    if ($name.Split('\')[-1] -like 'tsuite-ops-*') {
        throw 'Run the customer command from your normal Windows administrator account; temporary support accounts cannot be reused.'
    }
    if (-not (Test-SupportSshUser $sshUser) -or -not (Test-SupportAccountName $name)) { throw 'The current Windows account name is not supported by the SSH session policy.' }
    return [pscustomobject]@{account_mode='existing'; ops_user=$name; ops_sid=$sid; ssh_user=$sshUser; ssh_allow_user=$allowUser}
}

function Resolve-SupportAccountSid([string]$Name) {
    $account = New-Object Security.Principal.NTAccount($Name)
    return $account.Translate([Security.Principal.SecurityIdentifier]).Value
}

function Assert-SupportAccountBinding($State) {
    if ((Resolve-SupportAccountSid $State.ops_user) -cne $State.ops_sid) {
        throw 'The Windows account no longer matches the original support session SID.'
    }
}

function New-SupportSessionProcess([string]$Executable, [string]$Arguments, [string]$ErrorPath) {
    if (-not ('TSuiteSupport.SessionProcess' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace TSuiteSupport {
    // One anonymous, non-inheritable Job owns only this listener and its descendants.
    public sealed class SessionProcess : IDisposable {
        private IntPtr job;
        public Process Process { get; private set; }

        [StructLayout(LayoutKind.Sequential)]
        private struct BasicLimits {
            public long ProcessTime, JobTime;
            public uint Flags;
            public UIntPtr MinWorkingSet, MaxWorkingSet;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint Priority, Scheduling;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct IoCounters {
            public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct ExtendedLimits {
            public BasicLimits Basic;
            public IoCounters Io;
            public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct SecurityAttributes {
            public uint Length;
            public IntPtr Descriptor;
            [MarshalAs(UnmanagedType.Bool)] public bool Inherit;
        }
        [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
        private struct StartupInfo {
            public uint Size;
            public string Reserved, Desktop, Title;
            public uint X, Y, Width, Height, XChars, YChars, Fill, Flags;
            public ushort ShowWindow, ReservedSize;
            public IntPtr ReservedData, Input, Output, Error;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct ProcessInfo {
            public IntPtr Process, Thread;
            public uint ProcessId, ThreadId;
        }
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError=true)]
        private static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits info, uint size);
        [DllImport("kernel32.dll", SetLastError=true)]
        private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        private static extern IntPtr CreateFile(string path, uint access, uint share, ref SecurityAttributes attributes,
                                               uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        private static extern bool CreateProcess(string application, StringBuilder command, IntPtr processAttributes,
                                                IntPtr threadAttributes, bool inheritHandles, uint flags,
                                                IntPtr environment, string directory, ref StartupInfo startup,
                                                out ProcessInfo process);
        [DllImport("kernel32.dll", SetLastError=true)]
        private static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll", SetLastError=true)]
        private static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll", SetLastError=true)]
        private static extern bool TerminateJobObject(IntPtr job, uint code);
        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr handle);

        private static void Close(IntPtr handle) {
            if (handle != IntPtr.Zero && handle != new IntPtr(-1)) CloseHandle(handle);
        }

        public static SessionProcess Start(string executable, string arguments, string errorPath) {
            var owner = new SessionProcess();
            ProcessInfo child = new ProcessInfo();
            IntPtr input = IntPtr.Zero, error = IntPtr.Zero;
            bool created = false;
            try {
                owner.job = CreateJobObject(IntPtr.Zero, null);
                if (owner.job == IntPtr.Zero) throw new Win32Exception();
                var limits = new ExtendedLimits();
                limits.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE; no breakaway.
                if (!SetInformationJobObject(owner.job, 9, ref limits, (uint)Marshal.SizeOf(limits)))
                    throw new Win32Exception();
                var attributes = new SecurityAttributes();
                attributes.Length = (uint)Marshal.SizeOf(attributes);
                attributes.Inherit = true;
                input = CreateFile("NUL", 0xC0000000, 3, ref attributes, 3, 0x80, IntPtr.Zero);
                if (input == new IntPtr(-1)) throw new Win32Exception();
                error = CreateFile(errorPath, 4, 3, ref attributes, 4, 0x80, IntPtr.Zero);
                if (error == new IntPtr(-1)) throw new Win32Exception();
                var startup = new StartupInfo();
                startup.Size = (uint)Marshal.SizeOf(startup);
                startup.Flags = 0x100; // STARTF_USESTDHANDLES.
                startup.Input = input; startup.Output = input; startup.Error = error;
                var command = new StringBuilder("\"" + executable + "\" " + arguments);
                // Assign while suspended: no login or child can escape between creation and assignment.
                if (!CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true,
                                   0x08000004, IntPtr.Zero, null, ref startup, out child))
                    throw new Win32Exception();
                created = true;
                if (!AssignProcessToJobObject(owner.job, child.Process)) throw new Win32Exception();
                owner.Process = System.Diagnostics.Process.GetProcessById((int)child.ProcessId);
                if (owner.Process.Handle == IntPtr.Zero) throw new Win32Exception();
                if (ResumeThread(child.Thread) == UInt32.MaxValue) throw new Win32Exception();
                return owner;
            } catch {
                if (created) TerminateProcess(child.Process, 1);
                owner.Dispose();
                throw;
            } finally {
                Close(child.Thread); Close(child.Process); Close(input); Close(error);
            }
        }

        public void Dispose() {
            if (job != IntPtr.Zero) {
                TerminateJobObject(job, 1);
                CloseHandle(job);
                job = IntPtr.Zero;
            }
            if (Process != null) {
                Process.WaitForExit(5000);
                Process.Dispose();
                Process = null;
            }
        }
    }
}
'@
    }
    return [TSuiteSupport.SessionProcess]::Start($Executable, $Arguments, $ErrorPath)
}

function Enter-SupportLock([string]$Id, [int]$TimeoutMilliseconds = 0) {
    Assert-SessionId $Id
    $mutex = New-Object Threading.Mutex($false, "Global\TSuiteSupport-$Id")
    try {
        try { $acquired = $mutex.WaitOne($TimeoutMilliseconds) }
        catch [Threading.AbandonedMutexException] { $acquired = $true }
        if (-not $acquired) { throw 'Another installation or cleanup is using this session. Retry later.' }
        return $mutex
    } catch {
        $mutex.Dispose()
        throw
    }
}

function Complete-SupportBootstrap(
    [string]$Temporary, [string]$Directory, [string]$Id,
    [bool]$Installed, [bool]$StateWritten, [bool]$DirectoryCreated
) {
    try {
        Remove-Item -LiteralPath $Temporary -Recurse -Force
    } finally {
        # Rollback is independent of temporary credential deletion (e.g. an antivirus file lock).
        if (-not $Installed -and $StateWritten) {
            try { Write-Utf8 (Join-Path $Directory 'closing') 'installation failed' }
            finally { Remove-SupportSession $Id }
        } elseif (-not $Installed -and $DirectoryCreated) {
            Remove-Item -LiteralPath $Directory -Recurse -Force
        }
    }
}

function Write-Utf8([string]$Path, [string]$Value) {
    [IO.File]::WriteAllText($Path, $Value, (New-Object Text.UTF8Encoding($false)))
}

function Read-Utf8WithRetry([string]$Path) {
    # File.Replace is atomic, but on Windows a reader can briefly encounter a
    # sharing violation while another support task swaps session.json.
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        try { return [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) }
        catch [IO.IOException] {
            if ($attempt -eq 20) { throw }
            Start-Sleep -Milliseconds 50
        }
    }
}

function Format-WindowsOpenSshExpiry([DateTimeOffset]$Value) {
    # Win32-OpenSSH 8.1 accepts 8/12/14 local-time digits but not the newer
    # UTC "Z" suffix. Keep this aligned with the local Windows account expiry.
    return $Value.LocalDateTime.ToString('yyyyMMddHHmmss')
}

function Get-WindowsSshdRuntimeOptions([bool]$CompatibilityRuntime, [string]$DirectoryPath) {
    $options = @('PidFile "{0}/sshd.pid"' -f $DirectoryPath)
    if ($CompatibilityRuntime) {
        # OpenSSH 9.8 penalizes bare TCP readiness probes. This listener is
        # loopback-only, and all legitimate tunneled connections share 127.0.0.1.
        $options += 'PerSourcePenalties no'
        $options += 'LogLevel DEBUG3'
    } else {
        $options += 'LogLevel VERBOSE'
    }
    return $options -join "`n    "
}

function Move-OpenSshHostKeyPair([string]$PrivateKeyPath, [string]$DestinationDirectory) {
    $publicKeyPath = "$PrivateKeyPath.pub"
    foreach ($path in @($PrivateKeyPath, $publicKeyPath)) {
        $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
        if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Expected a regular SSH host key file: $path"
        }
    }
    Move-Item -LiteralPath $PrivateKeyPath -Destination (Join-Path $DestinationDirectory 'ssh_host_ed25519_key')
    Move-Item -LiteralPath $publicKeyPath -Destination (Join-Path $DestinationDirectory 'ssh_host_ed25519_key.pub')
}

function Set-ServiceFilePermissions([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Expected a regular service file.'
    }
    # ssh-keygen can assign the interactive user's SID even inside our private directory.
    # SYSTEM-run OpenSSH requires service-owned files, not personal user ownership/grants.
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
    foreach ($sid in @('S-1-5-18', 'S-1-5-32-544')) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            (New-Object Security.Principal.SecurityIdentifier($sid)), 'FullControl', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function New-PrivateDirectory([string]$Path) {
    if (Test-Path -LiteralPath $Path) { throw "Directory already exists: $Path" }
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
    foreach ($sid in @('S-1-5-18', 'S-1-5-32-544')) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            (New-Object Security.Principal.SecurityIdentifier($sid)), 'FullControl',
            'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    # .NET Framework overload applies the ACL at creation, before writing secrets.
    [void][IO.Directory]::CreateDirectory($Path, $acl)
}

function Assert-PrivateDirectory([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Support directory must not be a reparse point.'
    }
    $acl = Get-Acl -LiteralPath $Path
    $trusted = @('S-1-5-18', 'S-1-5-32-544')
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $trusted) {
        throw 'Support directory has an untrusted owner.'
    }
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $trusted) {
            throw 'Support directory has untrusted permissions.'
        }
    }
}

function Set-OpenSshRuntimePermissions([string]$Path, [bool]$Recursive) {
    $item = Get-Item -LiteralPath $Path -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'OpenSSH runtime path must be a regular directory.'
    }

    $system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
    $administrators = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
    $users = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')

    function Set-RuntimeDirectoryAcl([string]$Directory, [bool]$InheritReadAccess) {
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $acl.SetAccessRuleProtection($true, $false)
        $acl.SetOwner($administrators)
        foreach ($identity in @($system, $administrators)) {
            $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
                $identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
        }
        $inheritance = if ($InheritReadAccess) { 'ContainerInherit,ObjectInherit' } else { 'None' }
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
            $users, 'ReadAndExecute', $inheritance, 'None', 'Allow')))
        Set-Acl -LiteralPath $Directory -AclObject $acl
    }

    function Set-RuntimeFileAcl([string]$File) {
        $acl = New-Object Security.AccessControl.FileSecurity
        $acl.SetAccessRuleProtection($true, $false)
        $acl.SetOwner($administrators)
        foreach ($identity in @($system, $administrators)) {
            $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
                $identity, 'FullControl', 'Allow')))
        }
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
            $users, 'ReadAndExecute', 'Allow')))
        Set-Acl -LiteralPath $File -AclObject $acl
    }

    Set-RuntimeDirectoryAcl $Path $Recursive
    if ($Recursive) {
        foreach ($child in Get-ChildItem -LiteralPath $Path -Force -Recurse) {
            if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "OpenSSH runtime must not contain a reparse point: $($child.FullName)"
            }
            if ($child.PSIsContainer) { Set-RuntimeDirectoryAcl $child.FullName $true }
            else { Set-RuntimeFileAcl $child.FullName }
        }
    }
}

function Assert-OpenSshRuntimePermissions([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'OpenSSH runtime path must be a regular directory.'
    }
    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected -or
        $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne 'S-1-5-32-544') {
        throw 'OpenSSH runtime ownership or inheritance is unsafe.'
    }
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    foreach ($rule in $rules) {
        $sid = $rule.IdentityReference.Value
        if ($rule.AccessControlType -ne 'Allow' -or $sid -notin @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-32-545')) {
            throw 'OpenSSH runtime has unexpected permissions.'
        }
        if ($sid -eq 'S-1-5-32-545') {
            $writeRights = [Security.AccessControl.FileSystemRights]::Write -bor
                [Security.AccessControl.FileSystemRights]::Delete -bor
                [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
                [Security.AccessControl.FileSystemRights]::ChangePermissions -bor
                [Security.AccessControl.FileSystemRights]::TakeOwnership
            if (($rule.FileSystemRights -band $writeRights) -ne 0 -or
                ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadAndExecute) -ne
                    [Security.AccessControl.FileSystemRights]::ReadAndExecute) {
                throw 'OpenSSH runtime users must have read-execute access only.'
            }
        }
    }
    foreach ($sid in @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-32-545')) {
        if (-not ($rules | Where-Object { $_.IdentityReference.Value -eq $sid })) {
            throw "OpenSSH runtime is missing required access: $sid"
        }
    }
}

function Get-SupportRoot {
    $root = Join-Path $env:ProgramData 'TSuiteSupport'
    if (-not (Test-Path -LiteralPath $root)) { New-PrivateDirectory $root }
    Assert-PrivateDirectory $root
    return $root
}

function Register-SupportTask([string]$Id, [string]$ActionMode, [datetime]$Expires) {
    Assert-SessionId $Id
    $directory = Join-Path (Get-SupportRoot) $Id
    $script = Join-Path $directory 'client.ps1'
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $runnerLog = Join-Path $directory "$ActionMode.runner.log"
    $quotedScript = $script.Replace("'", "''")
    $quotedLog = $runnerLog.Replace("'", "''")
    # Catch errors outside the client script too (loading/parsing/early state validation).
    $runner = "`$ErrorActionPreference = 'Stop'; try { & '$quotedScript' -Mode $ActionMode -SessionId $Id } catch { " +
        "[IO.File]::AppendAllText('$quotedLog', '[TSuite-startup] ' + `$_.Exception.Message + " +
        "[Environment]::NewLine + `$_.ScriptStackTrace + [Environment]::NewLine); exit 1 }"
    $encodedRunner = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($runner))
    $action = New-ScheduledTaskAction -Execute $powershell -Argument (
        '-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ' + $encodedRunner)
    $principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    $triggers = @(New-ScheduledTaskTrigger -AtStartup)
    if ($ActionMode -eq 'Cleanup') {
        # Also retry cleanup after a reboot or a temporary failure.
        $triggers += New-ScheduledTaskTrigger -Once -At $Expires -RepetitionInterval (New-TimeSpan -Minutes 1)
    }
    Register-ScheduledTask -TaskName "TSuiteSupport-$Id-$ActionMode" -Action $action `
        -Trigger $triggers -Principal $principal -Settings $settings | Out-Null
}

function Read-SupportState([string]$Id) {
    Assert-SessionId $Id
    $directory = Join-Path (Get-SupportRoot) $Id
    Assert-PrivateDirectory $directory
    $state = Read-Utf8WithRetry (Join-Path $directory 'session.json') | ConvertFrom-Json
    if ($state.session_id -cne $Id) { throw 'Support state does not match this session.' }
    if ((Get-SupportAccountMode $state) -eq 'temporary') {
        if ($state.ops_user -cne "tsuite-ops-$($Id.Substring(0, 8))") { throw 'Support account does not match this session.' }
    } elseif ($state.ops_sid -cnotmatch '^S-1-5-21-\d+-\d+-\d+-\d+$' -or
        -not (Test-SupportSshUser $state.ssh_user) -or -not (Test-SupportAccountName $state.ops_user)) {
        throw 'Invalid existing Windows account binding.'
    }
    return $state
}

function Remove-SupportSession([string]$Id) {
    $mutex = Enter-SupportLock $Id 30000
    try { Remove-SupportSessionResources $Id }
    finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
}

function Get-SupportUserProcesses([string]$UserName) {
    # Get-Process reads native process tokens once; WMI GetOwnerSid per PID is very expensive.
    $owner = "$env:COMPUTERNAME\$UserName"
    Get-Process -IncludeUserName -ErrorAction SilentlyContinue |
        Where-Object { $_.UserName -ieq $owner }
}

function Dismount-SupportUserHive([string]$Hive) {
    & "$env:SystemRoot\System32\reg.exe" unload "HKU\$Hive" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not unload the support account profile; cleanup will retry.' }
}

function Remove-SupportUserProfile([string]$Sid) {
    if ($Sid -cnotmatch '^S-1-5-21-\d+-\d+-\d+-\d+$') { throw 'Invalid local support account SID.' }
    # OpenSSH can leave a profile mounted after all of this account's processes have exited.
    # Only the already-revoked, ownership-checked account's hives may be unloaded.
    foreach ($hive in @("${Sid}_Classes", $Sid)) {
        if (Test-Path -LiteralPath ("Registry::HKEY_USERS\$hive")) {
            Dismount-SupportUserHive $hive
        }
    }
    Get-CimInstance Win32_UserProfile -Filter "SID='$Sid'" | Remove-CimInstance
}

function Remove-SupportProfileWithRetry([string]$Id, [string]$Sid, [string]$Directory) {
    $path = Join-Path $Directory 'cleanup-retry.json'
    $attempts = 0
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    if (Test-Path -LiteralPath $path) {
        $retry = Read-Utf8WithRetry $path | ConvertFrom-Json
        if ($retry.session_id -cne $Id -or $retry.sid -cne $Sid -or
            [long]$retry.attempts -lt 1 -or [long]$retry.next_attempt_at -lt 0) {
            throw 'Cleanup retry state does not match this session.'
        }
        $attempts = [math]::Min(20, [long]$retry.attempts)
        $mounted = $retry.PSObject.Properties.Name -contains 'loaded_hive' -and $retry.loaded_hive
        if ($now -lt [long]$retry.next_attempt_at -and
            (-not $mounted -or (Test-Path -LiteralPath "Registry::HKEY_USERS\$Sid" -ErrorAction SilentlyContinue))) {
            return $false
        }
    }
    try {
        Remove-SupportUserProfile $Sid
        return $true
    } catch {
        # Transport/login revocation has already completed. Preserve ownership and retry cheaply.
        $attempts++
        $delay = [long][math]::Min(3600, 300 * [math]::Pow(2, $attempts - 1))
        $retry = @{
            session_id=$Id; sid=$Sid; attempts=$attempts; next_attempt_at=$now+$delay
            loaded_hive=[bool](Test-Path -LiteralPath "Registry::HKEY_USERS\$Sid" -ErrorAction SilentlyContinue)
            last_error=$_.Exception.Message
        }
        $temporary = Join-Path $Directory ('retry-' + [guid]::NewGuid().ToString('N'))
        try {
            Write-Utf8 $temporary ($retry | ConvertTo-Json -Compress)
            if (Test-Path -LiteralPath $path) { [IO.File]::Replace($temporary, $path, [NullString]::Value) }
            else { [IO.File]::Move($temporary, $path) }
        } finally {
            if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
        }
        Write-Warning "Support profile cleanup failed; retrying in $delay seconds."
        return $false
    }
}

function Remove-SupportSessionResources([string]$Id) {
    $state = Read-SupportState $Id
    $directory = Join-Path (Get-SupportRoot) $Id
    # Disable login before stopping tasks or removing credentials. Never remove a pre-existing account.
    $user = $null
    if ((Get-SupportAccountMode $state) -eq 'temporary') {
        $user = Get-LocalUser -Name $state.ops_user -ErrorAction SilentlyContinue
    }
    if ($user) {
        if ($user.Description -cne "TSuite temporary support $Id") { throw 'Account ownership mismatch.' }
        Disable-LocalUser -SID $user.SID
    }
    foreach ($action in @('Monitor', 'Tunnel', 'Sshd')) {
        $task = Get-ScheduledTask -TaskName "TSuiteSupport-$Id-$action" -ErrorAction SilentlyContinue
        if ($task) {
            Stop-ScheduledTask -InputObject $task
            Unregister-ScheduledTask -InputObject $task -Confirm:$false
        }
    }
    # Task Scheduler may leave native child processes behind after terminating the wrapper.
    foreach ($process in Get-CimInstance Win32_Process -Filter "Name='ssh.exe' OR Name='sshd.exe'") {
        if ($process.Name -notin @('ssh.exe', 'sshd.exe') -or -not $process.CommandLine) { continue }
        $configArgument = '"' + (Join-Path $directory 'sshd_config') + '"'
        $keyArgument = '"' + (Join-Path $directory 'tunnel_ed25519') + '"'
        if (($process.ExecutablePath -eq $state.sshd_path -and $process.CommandLine.Contains($configArgument)) -or
            ($process.ExecutablePath -eq $state.ssh_path -and $process.CommandLine.Contains($keyArgument))) {
            & "$env:SystemRoot\System32\taskkill.exe" /PID $process.ProcessId /T /F | Out-Null
            if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) {
                throw 'Could not stop a session SSH process; cleanup will retry.'
            }
        }
    }
    # Stop SSH session shells as well as the task processes; account expiry alone does not end sessions.
    if ($user) {
        foreach ($process in Get-SupportUserProcesses $state.ops_user) {
            Stop-Process -InputObject $process -Force -ErrorAction SilentlyContinue
        }
        if (@(Get-SupportUserProcesses $state.ops_user).Count -gt 0) {
            throw 'Could not stop all support account processes; cleanup will retry.'
        }
        if (-not (Remove-SupportProfileWithRetry $Id $user.SID.Value $directory)) { return }
        Remove-LocalUser -SID $user.SID
    }
    Remove-Item -LiteralPath $directory -Recurse -Force
    # Keep the cleanup task until all cleanup succeeds, so a partial failure can be retried.
    Unregister-ScheduledTask -TaskName "TSuiteSupport-$Id-Cleanup" -Confirm:$false -ErrorAction SilentlyContinue
}

function Save-StartupDiagnostics([string]$Id) {
    Assert-SessionId $Id
    $root = Get-SupportRoot
    $directory = Join-Path $root $Id
    $diagnostics = Join-Path $root 'diagnostics'
    if (-not (Test-Path -LiteralPath $diagnostics)) { New-PrivateDirectory $diagnostics }
    Assert-PrivateDirectory $diagnostics
    $lines = New-Object 'Collections.Generic.List[string]'
    $lines.Add("[TSuite-startup] session=$Id time=$([DateTimeOffset]::UtcNow.ToString('o'))")
    try {
        $task = Get-ScheduledTask -TaskName "TSuiteSupport-$Id-Sshd" -ErrorAction Stop
        $info = $task | Get-ScheduledTaskInfo -ErrorAction Stop
        $lines.Add("task_state=$($task.State) last_result=$($info.LastTaskResult) last_run=$($info.LastRunTime)")
    } catch { $lines.Add('Task status unavailable: ' + $_.Exception.Message) }
    # Only these non-credential error logs are exported; never serialize session/enrollment state.
    foreach ($name in @('Sshd.runner.log', 'Sshd.stderr.log', 'Sshd.native.log')) {
        $path = Join-Path $directory $name
        if (Test-Path -LiteralPath $path) {
            $lines.Add("--- $name ---")
            try {
                foreach ($line in Get-Content -LiteralPath $path -Tail 30 -ErrorAction Stop) {
                    $lines.Add([string]$line)
                }
            } catch [IO.IOException] {
                # sshd -E can keep its native log exclusively open on Windows.
                # Preserve the other diagnostics instead of hiding the original failure.
                $lines.Add("$name unavailable because it is still in use.")
            } catch [UnauthorizedAccessException] {
                $lines.Add("$name unavailable because access was denied.")
            }
        }
    }
    $output = Join-Path $diagnostics "$Id-startup.log"
    Write-Utf8 $output ($lines -join [Environment]::NewLine)
    Write-Host ($lines -join [Environment]::NewLine)
    Write-Host "Startup diagnostics saved: $output"
}

function Invoke-SupportProcess($State, [string]$ActionMode) {
    $directory = Join-Path (Get-SupportRoot) $State.session_id
    while ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -lt [long](Read-SupportState $State.session_id).expires_at -and -not (Test-Path (Join-Path $directory 'closing'))) {
        if ($ActionMode -eq 'Sshd') {
            if ((Get-SupportAccountMode $State) -eq 'existing') { Assert-SupportAccountBinding $State }
            $executable = $State.sshd_path
            $arguments = '-D -E "{0}" -f "{1}"' -f (Join-Path $directory 'Sshd.native.log'), (Join-Path $directory 'sshd_config')
        } else {
            $executable = $State.ssh_path
            $arguments = '-NT -F none -i "{0}" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="{1}" -o ExitOnForwardFailure=yes -o ConnectTimeout=10 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -p {2} -R 127.0.0.1:{3}:127.0.0.1:{4} {5}@{6}' -f `
                (Join-Path $directory 'tunnel_ed25519'), (Join-Path $directory 'known_hosts'), `
                $State.bastion_port, $State.remote_port, $State.local_port, $State.tunnel_user, $State.bastion_host
        }
        $owned = $null
        if ($ActionMode -eq 'Sshd' -and (Get-SupportAccountMode $State) -eq 'existing') {
            $owned = New-SupportSessionProcess $executable $arguments (Join-Path $directory "$ActionMode.stderr.log")
            $process = $owned.Process
        } else {
            $process = Start-Process -FilePath $executable -ArgumentList $arguments -PassThru -NoNewWindow `
                -RedirectStandardError (Join-Path $directory "$ActionMode.stderr.log")
        }
        try {
            while (-not $process.WaitForExit(1000)) {
                if ((Test-Path (Join-Path $directory 'closing')) -or
                    [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -ge [long](Read-SupportState $State.session_id).expires_at) { break }
            }
        } finally {
            if ($owned) { $owned.Dispose() }
            else {
                if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
                $process.Dispose()
            }
        }
        Start-Sleep -Seconds 5
    }
}

function Write-SupportState($State, [string]$Directory) {
    $path = Join-Path $Directory 'session.json'
    $temporary = Join-Path $Directory ('state-' + [guid]::NewGuid().ToString('N'))
    try {
        Write-Utf8 $temporary ($State | ConvertTo-Json -Compress)
        [IO.File]::Replace($temporary, $path, [NullString]::Value)
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}

function Test-SupportActivity($State, $Previous) {
    $directory = Join-Path (Get-SupportRoot) $State.session_id
    $marker = Get-Item -LiteralPath (Join-Path $directory 'activity') -ErrorAction SilentlyContinue
    if (-not $marker) { return @{active = $false; snapshot = $Previous} }
    $age = ([DateTime]::UtcNow - $marker.LastWriteTimeUtc).TotalSeconds
    $stamp = $marker.LastWriteTimeUtc.Ticks
    return @{active = [bool]($stamp -ne $Previous -and $age -ge 0 -and $age -le 45); snapshot = $stamp}
}

function Request-SupportLease($State, [bool]$Active) {
    $directory = Join-Path (Get-SupportRoot) $State.session_id
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $State.ssh_path
    $start.Arguments = '-F none -T -i "{0}" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="{1}" -o ClearAllForwardings=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 -p {2} tsuite-enroll@{3} lease' -f `
        (Join-Path $directory 'lease_ed25519'), (Join-Path $directory 'known_hosts'), $State.bastion_port, $State.bastion_host
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.WriteLine((@{active = $Active} | ConvertTo-Json -Compress))
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(20000)) { $process.Kill(); throw 'Lease request timed out.' }
        if ($process.ExitCode -ne 0) { throw 'Lease request rejected or unavailable.' }
        $reply = $output.Result | ConvertFrom-Json
        $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        if ($reply.session_id -cne $State.session_id -or $reply.idle_timeout_seconds -ne $State.idle_timeout_seconds -or
            $reply.expires_at -le $now -or $reply.expires_at -gt ($now + $State.idle_timeout_seconds + 30) -or
            $reply.expires_at -lt $State.expires_at) { throw 'Invalid lease response.' }
        return [long]$reply.expires_at
    } finally { $process.Dispose() }
}

function Set-SupportExpiry($State, [long]$Expiry) {
    $directory = Join-Path (Get-SupportRoot) $State.session_id
    $date = [DateTimeOffset]::FromUnixTimeSeconds($Expiry)
    $user = $null
    if ((Get-SupportAccountMode $State) -eq 'temporary') {
        $user = Get-LocalUser -Name $State.ops_user
        if ($user.Description -cne "TSuite temporary support $($State.session_id)") { throw 'Account ownership mismatch.' }
    } else { Assert-SupportAccountBinding $State }
    $path = Join-Path $directory 'authorized_keys'
    $keys = Get-Content -LiteralPath $path -Raw
    # Sessions created before portable access have one key and no mode flag.
    $portableOperator = $State.PSObject.Properties['portable_operator']
    $expectedKeys = if ($portableOperator -and $portableOperator.Value -eq $true) { 2 } else { 1 }
    $expiryPattern = 'expiry-time="[0-9]{12}(?:[0-9]{2})?Z?"'
    if ([regex]::Matches($keys, $expiryPattern).Count -ne $expectedKeys) { throw 'Invalid key expiry.' }
    $keys = $keys -replace $expiryPattern, ('expiry-time="' + (Format-WindowsOpenSshExpiry $date) + '"')
    # Native restrictions first; commit the watchdog deadline only after both succeed.
    Write-Utf8 $path $keys
    Set-ServiceFilePermissions $path
    if ($user) { Set-LocalUser -SID $user.SID -AccountExpires $date.LocalDateTime }
    $State.expires_at = $Expiry
    Write-SupportState $State $directory
}

function Watch-SupportLease([string]$Id) {
    $previous = $null
    while ($true) {
        $mutex = Enter-SupportLock $Id 30000
        try {
            $state = Read-SupportState $Id
            $directory = Join-Path (Get-SupportRoot) $Id
            if ((Test-Path (Join-Path $directory 'closing')) -or
                [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -ge [long]$state.expires_at) { return }
            if ((Get-SupportAccountMode $state) -eq 'existing') {
                try { Assert-SupportAccountBinding $state }
                catch {
                    Write-Utf8 (Join-Path $directory 'closing') 'Windows account binding changed'
                    Start-ScheduledTask -TaskName "TSuiteSupport-$Id-Cleanup"
                    return
                }
            }
            $activity = Test-SupportActivity $state $previous
            $expiry = Request-SupportLease $state $activity.active
            if ($expiry -ne $state.expires_at) { Set-SupportExpiry $state $expiry }
            $previous = $activity.snapshot
            $marker = Join-Path $directory 'activity'
            if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
        } catch {
            Write-Warning 'Support lease check failed; retaining the confirmed expiry.'
        } finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
        Start-Sleep -Seconds 15
    }
}

if ($Mode -eq 'Library') { return }
Assert-SessionId $SessionId
$state = Read-SupportState $SessionId
$directory = Join-Path (Get-SupportRoot) $SessionId
switch ($Mode) {
    'Monitor' { Watch-SupportLease $SessionId }
    'Activity' {
        $mutex = Enter-SupportLock $SessionId 30000
        try {
            $state = Read-SupportState $SessionId
            if ((Test-Path (Join-Path $directory 'closing')) -or
                [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -ge [long]$state.expires_at) { throw 'Session ended.' }
            Write-Utf8 (Join-Path $directory 'activity') 'operator activity'
        } finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
    }
    'Close' {
        $mutex = Enter-SupportLock $SessionId 30000
        try { Write-Utf8 (Join-Path $directory 'closing') 'close requested' }
        finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
        Start-ScheduledTask -TaskName "TSuiteSupport-$SessionId-Cleanup"
        Write-Output "cleanup-scheduled:$SessionId"
    }
    'Cleanup' {
        # Leave enough time for the nested SSH/broker path to receive the
        # cleanup-scheduled acknowledgement before this task stops sshd.
        Start-Sleep -Seconds 10
        $mutex = Enter-SupportLock $SessionId 30000
        try {
            $state = Read-SupportState $SessionId
            if (-not (Test-Path (Join-Path $directory 'closing')) -and
                [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -lt [long]$state.expires_at) { return }
            Write-Utf8 (Join-Path $directory 'closing') 'cleanup requested'
            Remove-SupportSessionResources $SessionId
        } finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
    }
    default { Invoke-SupportProcess $state $Mode }
}
