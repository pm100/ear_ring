# The Android Emulator's Qt window on Windows can end up positioned above the top
# edge of the screen (its title bar - the only thing you can grab to drag it back
# down - ends up off-screen, along with the rest of the window).
#
# Observed timeline (150% display scaling): the emulator creates its window at
# (0, 0), then ~0.5 s later relocates it to a large negative Y (e.g. -672) and
# renames it "Android Emulator - <avd>:<port>". So checking the window ONCE, as
# soon as it appears, sees a harmless (0, 0) and misses the real move. Instead
# this keeps enforcing a fully-on-screen position until the window has stayed
# put for a few seconds, then exits.
#
# All coordinates are physical pixels (this process is made DPI-aware) so they
# match what the emulator itself uses; a DPI-unaware process gets virtualised
# coordinates and would mis-place the window at 125%/150% scaling.
#
# Non-fatal: gives up after a timeout if no window shows up (e.g. a future
# emulator UI change), so it never blocks startup for long.
# Plain ASCII only in this file (no em dashes/smart quotes): Windows PowerShell
# 5.1's `-File` reads .ps1 files using the system codepage unless there's a BOM,
# so a stray multi-byte UTF-8 character silently corrupts nearby string literals.
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class EarRingWin32 {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action, uint param, out RECT r, uint winIni);
    public struct RECT { public int Left, Top, Right, Bottom; }

    public static void MakeDpiAware() { SetProcessDPIAware(); }

    // Primary-monitor work area (screen minus taskbar), physical pixels.
    public static int[] WorkArea() {
        RECT r; SystemParametersInfo(0x0030, 0, out r, 0);
        return new int[] { r.Left, r.Top, r.Right, r.Bottom };
    }

    // The visible top-level window of any of these processes whose title starts
    // with "Android Emulator" (the main skin window; the 81px-wide "Emulator"
    // toolbar is a separate window that the emulator keeps attached to it).
    public static IntPtr FindMainWindow(int[] pids) {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr h, IntPtr l) {
            uint pid; GetWindowThreadProcessId(h, out pid);
            if (Array.IndexOf(pids, (int)pid) < 0 || !IsWindowVisible(h)) return true;
            StringBuilder sb = new StringBuilder(256); GetWindowText(h, sb, 256);
            if (sb.ToString().StartsWith("Android Emulator")) { found = h; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static int[] Rect(IntPtr h) {
        RECT r; GetWindowRect(h, out r);
        return new int[] { r.Left, r.Top, r.Right, r.Bottom };
    }

    public static void MoveTo(IntPtr h, int x, int y) {
        // SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE
        SetWindowPos(h, IntPtr.Zero, x, y, 0, 0, 0x0001 | 0x0004 | 0x0010);
    }
}
"@

[EarRingWin32]::MakeDpiAware()

# Covers both the emulator's own launcher and the underlying qemu process, which
# is what actually owns the window, depending on acceleration backend.
$procNames = @('emulator', 'qemu-system-x86_64', 'qemu-system-aarch64')
$timeout = 60      # give up if the window never appears / never settles
$settle = 8        # seconds the window must stay put before we call it done
$deadline = (Get-Date).AddSeconds($timeout)
$stableSince = $null
$lastRect = ''
$moves = 0

while ((Get-Date) -lt $deadline) {
    $pids = @(Get-Process -Name $procNames -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $hwnd = [IntPtr]::Zero
    if ($pids.Count -gt 0) { $hwnd = [EarRingWin32]::FindMainWindow([int[]]$pids) }

    if ($hwnd -ne [IntPtr]::Zero) {
        $r = [EarRingWin32]::Rect($hwnd)
        $wa = [EarRingWin32]::WorkArea()
        $w = $r[2] - $r[0]
        $h = $r[3] - $r[1]

        # Fully inside the work area, or - if the window is taller/wider than the
        # screen can show - at least anchored to its top-left so the title bar is
        # reachable. Centre horizontally (leaving room for the toolbar on the right).
        $wantX = $wa[0] + [int](($wa[2] - $wa[0] - $w) / 2)
        $wantY = $wa[1]
        $onScreen = ($r[0] -ge $wa[0]) -and ($r[1] -ge $wa[1]) -and ($r[2] -le $wa[2]) -and ($r[3] -le $wa[3])
        if (-not $onScreen -and ($h -gt ($wa[3] - $wa[1]) -or $w -gt ($wa[2] - $wa[0]))) {
            # Can't fit at all: only require the title bar to be visible.
            $onScreen = ($r[1] -ge $wa[1]) -and ($r[0] -ge $wa[0])
        }

        if (-not $onScreen) {
            Write-Host "Emulator window off-screen at ($($r[0]), $($r[1])) size ${w}x${h} - moving to ($wantX, $wantY)."
            [EarRingWin32]::MoveTo($hwnd, $wantX, $wantY)
            $moves++
            $stableSince = $null
        } else {
            $key = "$($r[0]),$($r[1]),$w,$h"
            if ($key -ne $lastRect -or -not $stableSince) { $stableSince = Get-Date; $lastRect = $key }
            elseif (((Get-Date) - $stableSince).TotalSeconds -ge $settle) {
                Write-Host "Emulator window on-screen and stable at ($($r[0]), $($r[1])) ($moves correction(s))."
                exit 0
            }
        }
    }
    Start-Sleep -Milliseconds 250
}

Write-Host "Could not confirm a settled emulator window position within ${timeout}s (non-fatal)."
exit 0
