// PaseoBotGuardian: a Windows service whose only job is to keep one process alive in a
// user's interactive session (the Paseo bot supervisor). The Service Control Manager
// restarts this service if it fails; the service restarts the supervisor when it exits.
//
// Security model
// - Runs as LocalSystem only to call WTSQueryUserToken. The configured command always
//   runs with the logged-on user's own (non-elevated) token, never as SYSTEM.
// - Configuration lives in %ProgramData%\PaseoBotGuardian\guardian.ini, writable only by
//   SYSTEM and Administrators (the installer sets the ACL). This binary belongs in
//   %ProgramFiles%. No password is stored; nothing listens on the network.
//
// Build (no SDK needed):
//   %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe /optimize
//     /r:System.ServiceProcess.dll /r:System.Management.dll /out:PaseoBotGuardian.exe PaseoBotGuardian.cs
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

[assembly: System.Reflection.AssemblyTitle("Paseo Bot Guardian")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

public sealed class GuardianConfig
{
    public string UserSid, Command, Arguments, WorkingDirectory, Match;

    public static GuardianConfig Load(string path)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in File.ReadAllLines(path, Encoding.UTF8))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith("#")) continue;
            int eq = line.IndexOf('=');
            if (eq > 0) values[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
        }
        var c = new GuardianConfig();
        values.TryGetValue("UserSid", out c.UserSid);
        values.TryGetValue("Command", out c.Command);
        values.TryGetValue("Arguments", out c.Arguments);
        values.TryGetValue("WorkingDirectory", out c.WorkingDirectory);
        values.TryGetValue("Match", out c.Match);
        if (string.IsNullOrEmpty(c.UserSid) || string.IsNullOrEmpty(c.Command) || string.IsNullOrEmpty(c.Match))
            throw new InvalidDataException("guardian.ini needs UserSid, Command and Match");
        new SecurityIdentifier(c.UserSid); // validates the SID format
        return c;
    }
}

public sealed class Guardian : ServiceBase
{
    public const string Name = "PaseoBotGuardian";
    const int HealthySeconds = 300, MaxDelaySeconds = 300, ScanSeconds = 30;
    static readonly string Home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), Name);

    readonly ManualResetEvent stopping = new ManualResetEvent(false);
    readonly AutoResetEvent sessionChanged = new AutoResetEvent(false);
    Thread worker;

    public Guardian()
    {
        ServiceName = Name;
        CanHandleSessionChangeEvent = true;
        CanStop = true;
        CanShutdown = true;
    }

    public static void Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--check-config")
        {
            // Lets the installer validate a config before registering the service.
            GuardianConfig.Load(args.Length > 1 ? args[1] : Path.Combine(Home, "guardian.ini"));
            Console.WriteLine("config ok");
            return;
        }
        ServiceBase.Run(new Guardian());
    }

    protected override void OnStart(string[] args)
    {
        worker = new Thread(Loop) { IsBackground = true, Name = "guardian" };
        worker.Start();
    }

    protected override void OnStop() { Shutdown(); }
    protected override void OnShutdown() { Shutdown(); }

    void Shutdown()
    {
        // The supervised process is left running: it belongs to the user and survives a
        // service update. A restarted guardian adopts it instead of starting a second one.
        stopping.Set();
        if (worker != null) worker.Join(10000);
    }

    protected override void OnSessionChange(SessionChangeDescription change)
    {
        if (change.Reason == SessionChangeReason.SessionLogon || change.Reason == SessionChangeReason.SessionUnlock
            || change.Reason == SessionChangeReason.ConsoleConnect || change.Reason == SessionChangeReason.RemoteConnect)
            sessionChanged.Set();
    }

    void Loop()
    {
        int failures = 0;
        DateTime nextStart = DateTime.MinValue;
        Log("guardian started");
        while (!stopping.WaitOne(0))
        {
            try
            {
                var config = GuardianConfig.Load(Path.Combine(Home, "guardian.ini"));
                int session = FindUserSession(config.UserSid);
                if (session < 0)
                {
                    // Logged off: the next logon starts the supervisor at once, not after a backoff.
                    failures = 0; nextStart = DateTime.MinValue;
                    WaitFor(TimeSpan.FromSeconds(ScanSeconds));
                    continue;
                }

                using (var child = Adopt(config, session) ?? (DateTime.UtcNow >= nextStart ? Launch(config, session) : null))
                {
                    if (child == null) { WaitFor(nextStart - DateTime.UtcNow); continue; }
                    var started = DateTime.UtcNow;
                    int which = WaitHandle.WaitAny(new WaitHandle[] { stopping, child.Exited });
                    if (which == 0) break;
                    var lived = DateTime.UtcNow - started;
                    failures = lived.TotalSeconds >= HealthySeconds ? 1 : failures + 1;
                    int delay = Math.Min(MaxDelaySeconds, 1 << Math.Min(failures - 1, 9));
                    nextStart = DateTime.UtcNow.AddSeconds(delay);
                    Log(string.Format("supervisor pid {0} exited with code {1} after {2:0}s; restart in {3}s (consecutive failures {4})",
                        child.Pid, child.ExitCode(), lived.TotalSeconds, delay, failures));
                }
            }
            catch (Exception e)
            {
                Log("error: " + e.GetType().Name + ": " + e.Message);
                WaitFor(TimeSpan.FromSeconds(ScanSeconds));
            }
        }
        Log("guardian stopped");
    }

    void WaitFor(TimeSpan span)
    {
        if (span < TimeSpan.FromSeconds(1)) span = TimeSpan.FromSeconds(1);
        if (span > TimeSpan.FromSeconds(ScanSeconds)) span = TimeSpan.FromSeconds(ScanSeconds);
        WaitHandle.WaitAny(new WaitHandle[] { stopping, sessionChanged }, span);
    }

    // ---- sessions -------------------------------------------------------------------

    static int FindUserSession(string sid)
    {
        IntPtr list; int count;
        if (!Native.WTSEnumerateSessions(IntPtr.Zero, 0, 1, out list, out count)) return -1;
        try
        {
            int size = Marshal.SizeOf(typeof(Native.WTS_SESSION_INFO));
            int fallback = -1;
            for (int i = 0; i < count; i++)
            {
                var info = (Native.WTS_SESSION_INFO)Marshal.PtrToStructure(new IntPtr(list.ToInt64() + i * size), typeof(Native.WTS_SESSION_INFO));
                if (info.State != Native.WTSActive && info.State != Native.WTSDisconnected) continue;
                if (!string.Equals(SessionSid(info.SessionId), sid, StringComparison.OrdinalIgnoreCase)) continue;
                if (info.State == Native.WTSActive) return info.SessionId;
                fallback = info.SessionId; // a locked-out or disconnected session still runs the bot
            }
            return fallback;
        }
        finally { Native.WTSFreeMemory(list); }
    }

    static string SessionSid(int session)
    {
        IntPtr token;
        if (!Native.WTSQueryUserToken(session, out token)) return null;
        try { using (var identity = new WindowsIdentity(token)) return identity.User.Value; }
        finally { Native.CloseHandle(token); }
    }

    // ---- processes ------------------------------------------------------------------

    sealed class Child : IDisposable
    {
        public int Pid;
        public ManualResetEvent Exited;
        SafeWaitHandle handle;

        public Child(int pid, IntPtr process)
        {
            Pid = pid;
            handle = new SafeWaitHandle(process, true);
            Exited = new ManualResetEvent(false) { SafeWaitHandle = handle };
        }

        public string ExitCode()
        {
            uint code;
            return Native.GetExitCodeProcess(handle.DangerousGetHandle(), out code) ? code.ToString() : "unknown";
        }

        public void Dispose() { Exited.Dispose(); }
    }

    static Child Adopt(GuardianConfig config, int session)
    {
        var query = "SELECT ProcessId, SessionId, CommandLine FROM Win32_Process WHERE Name='" + Path.GetFileName(config.Command).Replace("'", "") + "'";
        using (var searcher = new ManagementObjectSearcher(query))
        foreach (ManagementObject p in searcher.Get())
        {
            using (p)
            {
                var line = p["CommandLine"] as string;
                if (line == null || Convert.ToInt32(p["SessionId"]) != session) continue;
                if (line.IndexOf(config.Match, StringComparison.OrdinalIgnoreCase) < 0) continue;
                int pid = Convert.ToInt32(p["ProcessId"]);
                var handle = Native.OpenProcess(Native.SYNCHRONIZE | Native.PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
                if (handle == IntPtr.Zero) continue;
                Log("adopted running supervisor pid " + pid + " in session " + session);
                return new Child(pid, handle);
            }
        }
        return null;
    }

    static Child Launch(GuardianConfig config, int session)
    {
        IntPtr userToken, primary = IntPtr.Zero, environment = IntPtr.Zero;
        if (!Native.WTSQueryUserToken(session, out userToken)) throw new Win32Exception();
        try
        {
            if (!Native.DuplicateTokenEx(userToken, Native.MAXIMUM_ALLOWED, IntPtr.Zero, 2, 1, out primary)) throw new Win32Exception();
            if (!Native.CreateEnvironmentBlock(out environment, primary, false)) throw new Win32Exception();
            var si = new Native.STARTUPINFO();
            si.cb = Marshal.SizeOf(si);
            si.lpDesktop = @"winsta0\default";
            si.dwFlags = Native.STARTF_USESHOWWINDOW;
            si.wShowWindow = 0; // SW_HIDE
            var commandLine = new StringBuilder("\"" + config.Command + "\" " + (config.Arguments ?? ""));
            Native.PROCESS_INFORMATION pi;
            if (!Native.CreateProcessAsUser(primary, null, commandLine, IntPtr.Zero, IntPtr.Zero, false,
                    Native.CREATE_UNICODE_ENVIRONMENT | Native.CREATE_NO_WINDOW, environment,
                    string.IsNullOrEmpty(config.WorkingDirectory) ? null : config.WorkingDirectory, ref si, out pi))
                throw new Win32Exception();
            Native.CloseHandle(pi.hThread);
            Log("started supervisor pid " + pi.dwProcessId + " in session " + session);
            return new Child(pi.dwProcessId, pi.hProcess);
        }
        finally
        {
            if (environment != IntPtr.Zero) Native.DestroyEnvironmentBlock(environment);
            if (primary != IntPtr.Zero) Native.CloseHandle(primary);
            Native.CloseHandle(userToken);
        }
    }

    // ---- log ------------------------------------------------------------------------

    static readonly object logLock = new object();

    static void Log(string text)
    {
        try
        {
            lock (logLock)
            {
                Directory.CreateDirectory(Home);
                var path = Path.Combine(Home, "guardian.log");
                if (File.Exists(path) && new FileInfo(path).Length > 1000000)
                    File.Copy(path, path + ".1", true);
                if (File.Exists(path) && new FileInfo(path).Length > 1000000)
                    File.Delete(path);
                File.AppendAllText(path, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + text + Environment.NewLine, Encoding.UTF8);
            }
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}

static class Native
{
    public const int WTSActive = 0, WTSDisconnected = 4;
    public const uint MAXIMUM_ALLOWED = 0x02000000, SYNCHRONIZE = 0x00100000, PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    public const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400, CREATE_NO_WINDOW = 0x08000000;
    public const int STARTF_USESHOWWINDOW = 0x00000001;

    [StructLayout(LayoutKind.Sequential)]
    public struct WTS_SESSION_INFO { public int SessionId; public IntPtr pWinStationName; public int State; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO
    {
        public int cb; public string lpReserved, lpDesktop, lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    public static extern bool WTSEnumerateSessions(IntPtr server, int reserved, int version, out IntPtr sessions, out int count);
    [DllImport("wtsapi32.dll")]
    public static extern void WTSFreeMemory(IntPtr memory);
    [DllImport("wtsapi32.dll", SetLastError = true)]
    public static extern bool WTSQueryUserToken(int session, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool DuplicateTokenEx(IntPtr token, uint access, IntPtr attributes, int impersonationLevel, int tokenType, out IntPtr newToken);
    [DllImport("userenv.dll", SetLastError = true)]
    public static extern bool CreateEnvironmentBlock(out IntPtr environment, IntPtr token, bool inherit);
    [DllImport("userenv.dll", SetLastError = true)]
    public static extern bool DestroyEnvironmentBlock(IntPtr environment);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcessAsUser(IntPtr token, string application, StringBuilder commandLine, IntPtr processAttributes,
        IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string directory, ref STARTUPINFO startup, out PROCESS_INFORMATION info);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr handle);
}
