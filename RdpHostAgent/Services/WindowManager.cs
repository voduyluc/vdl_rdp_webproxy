using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
using Newtonsoft.Json;

namespace RdpHostAgent.Services
{
    public class WindowInfo
    {
        [JsonProperty("hwnd")]
        public long Hwnd { get; set; }
        [JsonProperty("title")]
        public string Title { get; set; } = "";
        [JsonProperty("processName")]
        public string ProcessName { get; set; } = "";
        [JsonProperty("rect")]
        public WindowRect Rect { get; set; } = new();
    }

    public class WindowRect
    {
        [JsonProperty("x")]
        public int X { get; set; }
        [JsonProperty("y")]
        public int Y { get; set; }
        [JsonProperty("width")]
        public int Width { get; set; }
        [JsonProperty("height")]
        public int Height { get; set; }
    }

    public static class WindowManager
    {
        // === User32 ===
        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder strText, int maxCount);

        [DllImport("user32.dll")]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);

        [DllImport("user32.dll")]
        private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll")]
        private static extern bool MoveWindow(IntPtr hWnd, int x, int y, int nWidth, int nHeight, bool bRepaint);

        [DllImport("user32.dll")]
        private static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        // === WTS (Session 0 bypass) ===
        [DllImport("wtsapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool WTSEnumerateSessionsW(
            IntPtr hServer, uint Reserved, uint Version,
            out IntPtr ppSessionInfo, out int pCount);

        [DllImport("wtsapi32.dll")]
        private static extern void WTSFreeMemory(IntPtr pMemory);

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr phToken);

        // === Advapi32 / Userenv / Kernel32 (Session 0 bypass) ===
        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool DuplicateTokenEx(
            IntPtr hExistingToken, uint dwDesiredAccess,
            IntPtr lpTokenAttributes, int ImpersonationLevel,
            int TokenType, out IntPtr phNewToken);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool CreateEnvironmentBlock(
            out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CreateProcessAsUserW(
            IntPtr hToken,
            string? lpApplicationName,
            string lpCommandLine,
            IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes,
            bool bInheritHandles,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string? lpCurrentDirectory,
            ref STARTUPINFOW lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CreatePipe(
            out IntPtr hReadPipe, out IntPtr hWritePipe,
            ref SECURITY_ATTRIBUTES lpPipeAttributes, uint nSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetHandleInformation(IntPtr hObject, uint dwMask, uint dwFlags);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll")]
        private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

        // === Structs ===
        [StructLayout(LayoutKind.Sequential)]
        private struct RECT { public int Left, Top, Right, Bottom; }

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int X, Y; }

        [StructLayout(LayoutKind.Sequential)]
        private struct WINDOWPLACEMENT
        {
            public int length;
            public int flags;
            public int showCmd;
            public POINT ptMinPosition;
            public POINT ptMaxPosition;
            public RECT rcNormalPosition;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct WTS_SESSION_INFO_W
        {
            public uint SessionId;
            public IntPtr pWinStationName; // LPWSTR - pointer only, not marshaled as string
            public int State;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct STARTUPINFOW
        {
            public int cb;
            public IntPtr lpReserved;
            public IntPtr lpDesktop;
            public IntPtr lpTitle;
            public uint dwX, dwY, dwXSize, dwYSize;
            public uint dwXCountChars, dwYCountChars;
            public uint dwFillAttribute;
            public uint dwFlags;
            public ushort wShowWindow;
            public ushort cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput, hStdOutput, hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess, hThread;
            public uint dwProcessId, dwThreadId;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct SECURITY_ATTRIBUTES
        {
            public int nLength;
            public IntPtr lpSecurityDescriptor;
            public int bInheritHandle; // Win32 BOOL = 4 bytes
        }

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        // === Constants ===
        private const int SW_RESTORE = 9;
        private const int SW_MAXIMIZE = 3;
        private const int SW_SHOWMINIMIZED = 2;
        private const int SW_SHOWMAXIMIZED = 3;
        private const int SM_CXVIRTUALSCREEN = 78;
        private const int SM_CYVIRTUALSCREEN = 79;
        private const int GWL_STYLE = -16;
        private const int WS_SIZEBOX = 0x00040000;
        private const int WS_MAXIMIZEBOX = 0x00010000;
        private const int WTSActive = 0;
        private const int WTSConnected = 1;
        private const uint STARTF_USESTDHANDLES = 0x00000100;
        private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        private const uint CREATE_NO_WINDOW = 0x08000000;
        private const uint HANDLE_FLAG_INHERIT = 0x00000001;
        private const uint TOKEN_ALL_ACCESS = 0xF01FF;
        private const int SecurityImpersonation = 2;
        private const int TokenPrimary = 1;
        private const uint WAIT_OBJECT_0 = 0;

        private static readonly HashSet<string> ExcludedTitles = new(StringComparer.OrdinalIgnoreCase)
        {
            "Program Manager", "Windows Input Experience", "Microsoft Text Input Application"
        };

        // === Session 0 detection ===
        private static bool IsInSession0 => Process.GetCurrentProcess().SessionId == 0;

        private static List<uint> GetActiveUserSessions()
        {
            var result = new List<uint>();
            if (!WTSEnumerateSessionsW(IntPtr.Zero, 0, 1, out IntPtr pInfo, out int count))
                return result;
            try
            {
                int sz = Marshal.SizeOf<WTS_SESSION_INFO_W>();
                for (int i = 0; i < count; i++)
                {
                    var info = Marshal.PtrToStructure<WTS_SESSION_INFO_W>(pInfo + i * sz);
                    if (info.SessionId != 0 && (info.State == WTSActive || info.State == WTSConnected))
                        result.Add(info.SessionId);
                }
            }
            finally { WTSFreeMemory(pInfo); }
            return result;
        }

        // Launches the current executable in the given user session with the given args,
        // captures stdout, and returns it. Returns null on failure.
        private static string? RunHelperInSession(uint sessionId, string helperArgs, int timeoutMs = 8000)
        {
            string? exePath = Environment.ProcessPath
                ?? Process.GetCurrentProcess().MainModule?.FileName;
            if (string.IsNullOrEmpty(exePath)) return null;

            if (!WTSQueryUserToken(sessionId, out IntPtr userToken)) return null;

            IntPtr primaryToken = IntPtr.Zero;
            IntPtr envBlock = IntPtr.Zero;
            IntPtr hWrite = IntPtr.Zero;
            IntPtr hRead = IntPtr.Zero;
            IntPtr desktopStr = IntPtr.Zero;

            try
            {
                if (!DuplicateTokenEx(userToken, TOKEN_ALL_ACCESS, IntPtr.Zero,
                    SecurityImpersonation, TokenPrimary, out primaryToken))
                    return null;

                CreateEnvironmentBlock(out envBlock, primaryToken, false);

                var secAttrs = new SECURITY_ATTRIBUTES
                {
                    nLength = Marshal.SizeOf<SECURITY_ATTRIBUTES>(),
                    bInheritHandle = 1
                };
                if (!CreatePipe(out hRead, out hWrite, ref secAttrs, 0)) return null;
                SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0); // don't inherit the read end

                desktopStr = Marshal.StringToHGlobalUni("winsta0\\default");
                var si = new STARTUPINFOW
                {
                    cb = Marshal.SizeOf<STARTUPINFOW>(),
                    lpDesktop = desktopStr,
                    dwFlags = STARTF_USESTDHANDLES,
                    hStdInput = IntPtr.Zero,
                    hStdOutput = hWrite,
                    hStdError = IntPtr.Zero
                };

                string cmdLine = $"\"{exePath}\" {helperArgs}";
                uint flags = CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW;
                bool created = CreateProcessAsUserW(
                    primaryToken, null, cmdLine,
                    IntPtr.Zero, IntPtr.Zero, true, flags,
                    envBlock != IntPtr.Zero ? envBlock : IntPtr.Zero,
                    null, ref si, out PROCESS_INFORMATION pi);

                // Parent must close write end so ReadToEnd detects EOF when child exits
                CloseHandle(hWrite);
                hWrite = IntPtr.Zero;

                if (!created) return null;

                string? output = null;
                try
                {
                    // Read runs on thread pool; the child process will write small JSON and exit
                    using var safeRead = new SafeFileHandle(hRead, ownsHandle: true);
                    hRead = IntPtr.Zero; // SafeFileHandle owns it now
                    using var stream = new FileStream(safeRead, FileAccess.Read, 4096, isAsync: false);
                    using var reader = new StreamReader(stream, Encoding.UTF8);
                    var readTask = Task.Run(() => reader.ReadToEnd());

                    WaitForSingleObject(pi.hProcess, (uint)timeoutMs);
                    output = readTask.Wait(2000) ? readTask.Result : null;
                }
                finally
                {
                    CloseHandle(pi.hProcess);
                    CloseHandle(pi.hThread);
                }
                return output;
            }
            finally
            {
                if (hWrite != IntPtr.Zero) CloseHandle(hWrite);
                if (hRead != IntPtr.Zero) CloseHandle(hRead);
                if (primaryToken != IntPtr.Zero) CloseHandle(primaryToken);
                if (envBlock != IntPtr.Zero) DestroyEnvironmentBlock(envBlock);
                if (desktopStr != IntPtr.Zero) Marshal.FreeHGlobal(desktopStr);
                CloseHandle(userToken);
            }
        }

        // === Public API ===

        public static List<WindowInfo> GetVisibleWindows()
        {
            // Windows Services run in Session 0 where EnumWindows cannot see user-session windows.
            // Launch a helper process in the active user session to enumerate them instead.
            if (IsInSession0)
            {
                var allWindows = new List<WindowInfo>();
                foreach (uint sessionId in GetActiveUserSessions())
                {
                    try
                    {
                        string? json = RunHelperInSession(sessionId, "--get-windows");
                        if (!string.IsNullOrWhiteSpace(json))
                        {
                            var list = JsonConvert.DeserializeObject<List<WindowInfo>>(json);
                            if (list != null) allWindows.AddRange(list);
                        }
                    }
                    catch { }
                }
                return allWindows;
            }

            return EnumVisibleWindows();
        }

        // Direct enumeration — only valid in a user session (non-Session-0).
        public static List<WindowInfo> EnumVisibleWindows()
        {
            var windows = new List<WindowInfo>();
            EnumWindows((hWnd, _) =>
            {
                if (!IsWindowVisible(hWnd)) return true;

                int length = GetWindowTextLength(hWnd);
                if (length == 0) return true;

                var title = new StringBuilder(length + 1);
                GetWindowText(hWnd, title, title.Capacity);
                var titleStr = title.ToString();
                if (string.IsNullOrWhiteSpace(titleStr) || ExcludedTitles.Contains(titleStr)) return true;

                GetWindowRect(hWnd, out RECT rect);
                int w = rect.Right - rect.Left;
                int h = rect.Bottom - rect.Top;
                if (w <= 0 || h <= 0) return true;

                GetWindowThreadProcessId(hWnd, out uint pid);
                string processName = "";
                try { processName = Process.GetProcessById((int)pid).ProcessName; } catch { }

                windows.Add(new WindowInfo
                {
                    Hwnd = hWnd.ToInt64(),
                    Title = titleStr,
                    ProcessName = processName,
                    Rect = new WindowRect { X = rect.Left, Y = rect.Top, Width = w, Height = h }
                });
                return true;
            }, IntPtr.Zero);
            return windows;
        }

        // Focuses the window and optionally resizes it.
        // targetWidth/targetHeight = desired window size in screen pixels (from client viewport * sizePercent).
        // If not provided, the window is maximized (if resizable).
        // Returns (rect, resizable): updated window bounds and whether the window can be resized.
        public static (WindowRect? rect, bool resizable) FocusWindow(long hwnd, int? targetWidth = null, int? targetHeight = null)
        {
            // In Session 0, Win32 window APIs cannot target user-session windows.
            // Delegate to a helper process running in the user's session.
            if (IsInSession0)
            {
                string args = $"--focus-window {hwnd}";
                if (targetWidth.HasValue && targetHeight.HasValue)
                    args += $" {targetWidth.Value} {targetHeight.Value}";

                foreach (uint sessionId in GetActiveUserSessions())
                {
                    try
                    {
                        string? json = RunHelperInSession(sessionId, args);
                        if (string.IsNullOrWhiteSpace(json)) continue;
                        var r = JsonConvert.DeserializeObject<FocusResult>(json);
                        if (r?.Rect != null) return (r.Rect, r.Resizable);
                    }
                    catch { }
                }
                return (null, false);
            }

            return FocusWindowDirect(hwnd, targetWidth, targetHeight);
        }

        // Direct focus — only valid in a user session.
        public static (WindowRect? rect, bool resizable) FocusWindowDirect(long hwnd, int? targetWidth = null, int? targetHeight = null)
        {
            var hWnd = new IntPtr(hwnd);
            if (!IsWindowVisible(hWnd)) return (null, false);

            var wp = new WINDOWPLACEMENT { length = Marshal.SizeOf<WINDOWPLACEMENT>() };
            if (GetWindowPlacement(hWnd, ref wp))
            {
                bool minimized = wp.showCmd == SW_SHOWMINIMIZED;
                bool maximized = wp.showCmd == SW_SHOWMAXIMIZED;
                if (minimized || (maximized && targetWidth.HasValue))
                    ShowWindow(hWnd, SW_RESTORE);
            }

            SetForegroundWindow(hWnd);
            BringWindowToTop(hWnd);

            int style = GetWindowLong(hWnd, GWL_STYLE);
            bool resizable = (style & (WS_SIZEBOX | WS_MAXIMIZEBOX)) != 0;

            if (resizable)
            {
                if (targetWidth.HasValue && targetHeight.HasValue)
                {
                    int deskW = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                    int deskH = GetSystemMetrics(SM_CYVIRTUALSCREEN);
                    int w = Math.Clamp(targetWidth.Value, 100, deskW);
                    int h = Math.Clamp(targetHeight.Value, 100, deskH);
                    int x = Math.Max(0, (deskW - w) / 2);
                    int y = Math.Max(0, (deskH - h) / 2);
                    MoveWindow(hWnd, x, y, w, h, true);
                }
                else
                {
                    ShowWindow(hWnd, SW_MAXIMIZE);
                }
            }

            GetWindowRect(hWnd, out RECT rect);
            int rw = rect.Right - rect.Left;
            int rh = rect.Bottom - rect.Top;
            var windowRect = rw > 0 && rh > 0
                ? new WindowRect { X = rect.Left, Y = rect.Top, Width = rw, Height = rh }
                : null;
            return (windowRect, resizable);
        }

        public static WindowRect GetDesktopSize() => new()
        {
            X = 0,
            Y = 0,
            Width = GetSystemMetrics(SM_CXVIRTUALSCREEN),
            Height = GetSystemMetrics(SM_CYVIRTUALSCREEN)
        };

        // Used for JSON deserialization of --focus-window helper output
        private class FocusResult
        {
            [JsonProperty("rect")]
            public WindowRect? Rect { get; set; }
            [JsonProperty("resizable")]
            public bool Resizable { get; set; }
        }
    }
}
