<#
.SYNOPSIS
  Shared Win32 interop for the Windows native-UI harness.

.DESCRIPTION
  Backs window.ps1, mouse.ps1, and verify-window-controls.ps1. Nothing here is part of the app
  build; it exists to drive and inspect the *real* Tauri window, which neither vitest (no layout)
  nor the browser harness (no window) can do.

  This is the Windows counterpart to mouse.swift + window.sh. See
  documentation/NATIVE_UI_HARNESS.md.

  Two Windows-specific hazards are handled here rather than left to callers:

  1. DPI. Window rects and cursor positions are physical pixels, but the app lays out in CSS
     pixels. At 150% scaling a control 31 CSS px from the right edge is 46 physical px from it.
     Get-DevdrivrWindow reports the per-window scale factor and Get-DevdrivrControlPoint applies it,
     so button coordinates are correct on any monitor. Ignoring this is the single most likely way
     to produce a confident false "the button does nothing".

  2. Input integrity. Synthetic input is silently discarded when the target process runs at a
     higher integrity level than this one (UIPI), when the session is locked, or while a UAC
     secure desktop is up. Test-SyntheticInput proves the channel works before any result is
     believed — the analogue of macOS Accessibility permission.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not ('DevDrivr.Native' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace DevDrivr {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  // The real INPUT is a union of MOUSEINPUT/KEYBDINPUT/HARDWAREINPUT. Declaring the mouse arm
  // directly gives the correct size and alignment for mouse-only use on both x64 and x86; a
  // hand-rolled smaller struct makes SendInput return 0 with no other symptom.
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public MOUSEINPUT mi; }

  public static class Native {
    public const uint INPUT_MOUSE = 0;
    public const uint MOUSEEVENTF_MOVE = 0x0001;
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
    public const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;

    public const int SW_RESTORE = 9;
    public const int SW_MINIMIZE = 6;

    // DwmGetWindowAttribute: the frame Windows actually paints, excluding the invisible resize
    // border that GetWindowRect includes on some window styles.
    public const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;

    public const uint ES_CONTINUOUS = 0x80000000;
    public const uint ES_DISPLAY_REQUIRED = 0x00000002;
    public const uint ES_SYSTEM_REQUIRED = 0x00000001;

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll")]
    public static extern IntPtr GetThreadDpiAwarenessContext();

    [DllImport("user32.dll")]
    public static extern uint GetAwarenessFromDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsZoomed(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attr, out RECT value, int size);

    [DllImport("kernel32.dll")]
    public static extern uint SetThreadExecutionState(uint esFlags);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    /// Top-level windows owned by a PID. Deliberately not Process.MainWindowHandle: that caches
    /// its answer, returns 0 during startup, and cannot tell you when a *second* window appears.
    public static IntPtr[] TopLevelWindows(uint pid) {
      List<IntPtr> found = new List<IntPtr>();
      EnumWindows((hWnd, lParam) => {
        uint owner;
        GetWindowThreadProcessId(hWnd, out owner);
        // GetWindow(hWnd, GW_OWNER=4) filters tool/popup windows owned by the main one.
        if (owner == pid && GetWindow(hWnd, 4) == IntPtr.Zero) found.Add(hWnd);
        return true;
      }, IntPtr.Zero);
      return found.ToArray();
    }

    public static string WindowTitle(IntPtr hWnd) {
      StringBuilder sb = new StringBuilder(512);
      GetWindowTextW(hWnd, sb, sb.Capacity);
      return sb.ToString();
    }

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    public const int VK_LBUTTON = 0x01;

    /// Left button press or release at the current cursor position.
    ///
    /// Built here rather than in PowerShell on purpose. `$evt.mi.dwFlags = ...` in PowerShell
    /// assigns to a *copy* of the nested value type and is silently discarded, so dwFlags stays 0.
    /// SendInput then accepts a flagless mouse event and returns 1 — success — while delivering
    /// nothing. Cursor movement kept working via SetCursorPos, so the app appeared to receive hover
    /// but ignore every click: an entirely fictional "the window controls are dead".
    public static uint SendMouseButton(bool down) {
      INPUT[] inputs = new INPUT[1];
      inputs[0].type = INPUT_MOUSE;
      inputs[0].mi.dwFlags = down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
      return SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    /// Absolute move through SendInput. Coordinates are normalised to 0..65535 over the whole
    /// virtual desktop, so this handles negative-origin secondary monitors. Used to prove the
    /// flag plumbing works without clicking anything.
    public static uint SendMouseMoveAbsolute(int x, int y, int vsLeft, int vsTop, int vsWidth, int vsHeight) {
      INPUT[] inputs = new INPUT[1];
      inputs[0].type = INPUT_MOUSE;
      inputs[0].mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK;
      inputs[0].mi.dx = (int)Math.Round((x - vsLeft) * 65535.0 / vsWidth);
      inputs[0].mi.dy = (int)Math.Round((y - vsTop) * 65535.0 / vsHeight);
      return SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    // SM_XVIRTUALSCREEN / SM_YVIRTUALSCREEN / SM_CXVIRTUALSCREEN / SM_CYVIRTUALSCREEN
    public static int[] VirtualScreen() {
      return new int[] { GetSystemMetrics(76), GetSystemMetrics(77), GetSystemMetrics(78), GetSystemMetrics(79) };
    }
  }
}
'@
}

# ---------------------------------------------------------------------------------------------
# Layout constants — must track the components, or every coordinate is quietly wrong.
# ---------------------------------------------------------------------------------------------

# src/components/shell/TitleBar.tsx: h-11 bar, pr-2 right padding.
$script:BarHeightCss = 44
$script:BarPaddingRightCss = 8

# src/components/shell/WindowControls.tsx (WindowsControls): three h-8 w-[46px] buttons, in DOM
# order minimize, maximize, close, laid out left-to-right against the right edge of the bar.
$script:ControlWidthCss = 46
$script:ControlOrder = @('minimize', 'maximize', 'close')

# src/components/shell/WindowResizeHandles.tsx: fixed strips at z-39, above the title bar. The
# North edge owns the top 4px of the full window width and the NorthEast corner owns a 10x10 box.
# Clicks inside either start a resize instead of hitting a button, which reads exactly like a dead
# control. Assert-ControlPointIsClickable rejects such points instead of returning a false result.
$script:ResizeEdgeCss = 4
$script:ResizeCornerCss = 10

function Initialize-DpiAwareness {
  <#
    .SYNOPSIS
      Make this process per-monitor DPI aware so window rects and cursor coordinates agree.
    .DESCRIPTION
      PowerShell 7 is already per-monitor-v2 aware via its manifest, so the call usually fails with
      no effect — that is fine and expected. What matters is that we never proceed while *unaware*:
      in that state Windows lies to us about both rects and cursor positions under scaling, and
      every coordinate the harness computes lands in the wrong place.
  #>
  [CmdletBinding()]
  param()

  # DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
  [void][DevDrivr.Native]::SetProcessDpiAwarenessContext([IntPtr]::new(-4))

  $awareness = [DevDrivr.Native]::GetAwarenessFromDpiAwarenessContext(
    [DevDrivr.Native]::GetThreadDpiAwarenessContext()
  )
  # DPI_AWARENESS_UNAWARE = 0, SYSTEM_AWARE = 1, PER_MONITOR_AWARE = 2
  if ($awareness -eq 0) {
    throw 'This process is DPI-unaware; window and cursor coordinates would be wrong under display scaling. Run the harness from PowerShell 7 (pwsh).'
  }
  $awareness
}

function Get-DevdrivrWindow {
  <#
    .SYNOPSIS
      Locate the app window and return its geometry, state, and DPI scale.
    .PARAMETER ProcessName
      Defaults to the dev binary. The process is `devdrivr` (Cargo package name); `devdrivr` is the
      *window title* and also appears in editor titles, so matching on it finds the wrong thing.
    .PARAMETER TitleLike
      Disambiguates when the process owns more than one top-level window.
  #>
  [CmdletBinding()]
  param(
    [string]$ProcessName = $(if ($env:DEVDRIVR_PROC) { $env:DEVDRIVR_PROC } else { 'devdrivr' }),
    [string]$TitleLike = 'devdrivr'
  )

  [void](Initialize-DpiAwareness)

  $procs = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
  if ($procs.Count -eq 0) {
    throw "No process named '$ProcessName'. Start the app with ``bun run tauri dev`` (or set DEVDRIVR_PROC for a packaged build)."
  }

  $candidates = foreach ($proc in $procs) {
    foreach ($hWnd in [DevDrivr.Native]::TopLevelWindows([uint32]$proc.Id)) {
      # A minimized window keeps WS_VISIBLE, so this does not exclude the minimize test's target.
      if (-not [DevDrivr.Native]::IsWindowVisible($hWnd)) { continue }
      $title = [DevDrivr.Native]::WindowTitle($hWnd)
      if ([string]::IsNullOrWhiteSpace($title)) { continue }
      [pscustomobject]@{ Handle = $hWnd; Title = $title; ProcessId = $proc.Id }
    }
  }
  $candidates = @($candidates)

  if ($candidates.Count -eq 0) {
    throw "Process '$ProcessName' is running but owns no visible top-level window yet. Wait for the window to appear."
  }

  $match = @($candidates | Where-Object { $_.Title -like "*$TitleLike*" })
  $chosen = if ($match.Count -gt 0) { $match[0] } else { $candidates[0] }
  $hWnd = $chosen.Handle

  $rect = [DevDrivr.RECT]::new()
  if (-not [DevDrivr.Native]::GetWindowRect($hWnd, [ref]$rect)) {
    throw "GetWindowRect failed for handle $hWnd."
  }

  # Prefer the DWM frame: for some styles GetWindowRect includes an invisible resize border, and
  # anchoring button coordinates to a phantom edge shifts every click outward.
  $frame = [DevDrivr.RECT]::new()
  $usedFrame = $false
  if ([DevDrivr.Native]::DwmGetWindowAttribute(
      $hWnd, [DevDrivr.Native]::DWMWA_EXTENDED_FRAME_BOUNDS, [ref]$frame, 16) -eq 0) {
    $usedFrame = $true
  }
  else {
    $frame = $rect
  }

  $dpi = [DevDrivr.Native]::GetDpiForWindow($hWnd)
  if ($dpi -eq 0) { $dpi = 96 }

  [pscustomobject]@{
    Handle      = $hWnd
    ProcessId   = $chosen.ProcessId
    Title       = $chosen.Title
    X           = $frame.Left
    Y           = $frame.Top
    Width       = $frame.Right - $frame.Left
    Height      = $frame.Bottom - $frame.Top
    WindowRect  = "$($rect.Left) $($rect.Top) $($rect.Right - $rect.Left) $($rect.Bottom - $rect.Top)"
    UsedDwmFrame = $usedFrame
    Dpi         = $dpi
    Scale       = [math]::Round($dpi / 96, 4)
    IsMinimized = [DevDrivr.Native]::IsIconic($hWnd)
    IsMaximized = [DevDrivr.Native]::IsZoomed($hWnd)
    IsForeground = ([DevDrivr.Native]::GetForegroundWindow() -eq $hWnd)
  }
}

function Get-DevdrivrWindowState {
  [CmdletBinding()]
  param([Parameter(Mandatory)][pscustomobject]$Window)
  if ($Window.IsMinimized) { 'minimized' }
  elseif ($Window.IsMaximized) { 'maximized' }
  else { 'normal' }
}

function Get-DevdrivrControlPoint {
  <#
    .SYNOPSIS
      Physical screen coordinates of a title-bar window control.
    .DESCRIPTION
      Derived from the live window rect and its DPI scale on every call. Never cache the result:
      the rect changes on any move, maximize, restore, or monitor change, and a stale coordinate
      lands in empty space and reads as a broken control.
    .PARAMETER Control
      minimize | maximize | close, or 'dragregion' for the empty centre of the bar.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][pscustomobject]$Window,
    [Parameter(Mandatory)][ValidateSet('minimize', 'maximize', 'close', 'dragregion')][string]$Control
  )

  $scale = $Window.Scale
  $y = $Window.Y + [int][math]::Round(($script:BarHeightCss / 2) * $scale)

  if ($Control -eq 'dragregion') {
    # Centre of the bar is occupied by the command palette, so aim between the left icon cluster
    # and the palette rather than at the midpoint.
    $x = $Window.X + [int][math]::Round(180 * $scale)
    return [pscustomobject]@{ X = $x; Y = $y; Control = $Control }
  }

  # Buttons are flush to the right edge, inside the bar's 8px right padding, laid out
  # minimize | maximize | close from left to right. Offset from the right edge to a button centre
  # is therefore padding + (slots to its right * width) + half a width.
  $index = [array]::IndexOf($script:ControlOrder, $Control)
  $slotsToRight = ($script:ControlOrder.Count - 1) - $index
  $offsetCss = $script:BarPaddingRightCss + ($slotsToRight * $script:ControlWidthCss) + ($script:ControlWidthCss / 2)
  $x = $Window.X + $Window.Width - [int][math]::Round($offsetCss * $scale)

  [pscustomobject]@{ X = $x; Y = $y; Control = $Control }
}

function Assert-ControlPointIsClickable {
  <#
    .SYNOPSIS
      Reject a target that a resize handle would intercept before it is clicked.
    .DESCRIPTION
      WindowResizeHandles renders fixed strips at z-39 above the title bar: the top 4 CSS px of the
      full width, and 10x10 corners. A click inside one starts a resize, so the control appears
      dead. Failing loudly here beats recording a false negative.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][pscustomobject]$Window,
    [Parameter(Mandatory)][pscustomobject]$Point
  )

  $scale = $Window.Scale
  $edge = [int][math]::Round($script:ResizeEdgeCss * $scale)
  $corner = [int][math]::Round($script:ResizeCornerCss * $scale)

  $offsetY = $Point.Y - $Window.Y
  $offsetRight = ($Window.X + $Window.Width) - $Point.X
  $offsetLeft = $Point.X - $Window.X

  if ($offsetY -lt $edge) {
    throw "Target $($Point.Control) at $($Point.X),$($Point.Y) is inside the ${edge}px North resize strip; a click there resizes instead of activating the control."
  }
  if ($offsetY -lt $corner -and ($offsetRight -lt $corner -or $offsetLeft -lt $corner)) {
    throw "Target $($Point.Control) at $($Point.X),$($Point.Y) is inside a ${corner}px corner resize handle."
  }
  $true
}

# ---------------------------------------------------------------------------------------------
# Synthetic input
# ---------------------------------------------------------------------------------------------

function Set-MousePosition {
  [CmdletBinding()]
  param([Parameter(Mandatory)][int]$X, [Parameter(Mandatory)][int]$Y)
  # SetCursorPos rather than SendInput's normalised absolute move: the 0..65535 virtual-desktop
  # mapping rounds, and a 1-2px error is enough to miss a small control or land in a resize strip.
  if (-not [DevDrivr.Native]::SetCursorPos($X, $Y)) {
    throw "SetCursorPos($X, $Y) failed (win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())). A locked session or UAC secure desktop blocks cursor movement."
  }
}

function Get-MousePosition {
  [CmdletBinding()]
  param()
  $point = [DevDrivr.POINT]::new()
  [void][DevDrivr.Native]::GetCursorPos([ref]$point)
  [pscustomobject]@{ X = $point.X; Y = $point.Y }
}

function Send-MouseButton {
  <#
    .SYNOPSIS
      Press and/or release the left button at the current cursor position.
  #>
  [CmdletBinding()]
  param([ValidateSet('down', 'up')][Parameter(Mandatory)][string]$Action)

  # Delegated to C#. Filling the INPUT struct from PowerShell cannot work: `$evt.mi.dwFlags = ...`
  # writes to a copy of the nested value type, leaving dwFlags at 0, and SendInput then reports
  # success for an event that does nothing. See Native.SendMouseButton.
  $sent = [DevDrivr.Native]::SendMouseButton($Action -eq 'down')
  if ($sent -ne 1) {
    throw "SendInput was blocked (win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())). The target process is probably running at a higher integrity level than this shell — run both elevated or both unelevated."
  }
}

function Invoke-MouseClick {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][int]$X,
    [Parameter(Mandatory)][int]$Y,
    [int]$Count = 1
  )
  Set-MousePosition -X $X -Y $Y
  Start-Sleep -Milliseconds 60   # let the webview process the hover before the press
  for ($i = 0; $i -lt $Count; $i++) {
    if ($i -gt 0) { Start-Sleep -Milliseconds 90 }  # inside the 500ms system double-click interval
    Send-MouseButton -Action down
    Start-Sleep -Milliseconds 40
    Send-MouseButton -Action up
  }
}

function Invoke-MouseDrag {
  <#
    .SYNOPSIS
      Press, move in interpolated steps, release.
    .DESCRIPTION
      The intermediate motion is the point. Tauri's injected drag script and Windows' own resize
      tracking both need movement while the button is held; a bare down-at-A / up-at-B moves
      nothing and reads as "drag doesn't work".
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][int]$FromX,
    [Parameter(Mandatory)][int]$FromY,
    [Parameter(Mandatory)][int]$ToX,
    [Parameter(Mandatory)][int]$ToY,
    [int]$Steps = 25
  )
  Set-MousePosition -X $FromX -Y $FromY
  Start-Sleep -Milliseconds 60
  Send-MouseButton -Action down
  Start-Sleep -Milliseconds 90
  for ($step = 1; $step -le $Steps; $step++) {
    $t = $step / $Steps
    Set-MousePosition -X ([int][math]::Round($FromX + ($ToX - $FromX) * $t)) `
      -Y ([int][math]::Round($FromY + ($ToY - $FromY) * $t))
    Start-Sleep -Milliseconds 16
  }
  Start-Sleep -Milliseconds 90
  Send-MouseButton -Action up
}

function Test-SyntheticInput {
  <#
    .SYNOPSIS
      Prove synthetic input reaches the desktop before trusting any test result.
    .DESCRIPTION
      Three independent checks, none of which depend on the app:

        1. SetCursorPos moves the cursor where it was told.
        2. A SendInput *absolute move* lands on target — this proves dwFlags survives the trip into
           the struct, which a PowerShell-side INPUT fill silently fails to do.
        3. A press is observable in GetAsyncKeyState(VK_LBUTTON) and a release clears it — this
           proves button events actually enter the input stream.

      Check 3 exists because an earlier version asserted only that SendInput returned 1. It does
      that for a flagless no-op event, so the harness reported healthy input while delivering no
      clicks at all, and every window control looked broken. Never weaken this to a return-code
      check: a false pass here turns the whole harness into a fabricator of bugs.
  #>
  [CmdletBinding()]
  param()

  [void](Initialize-DpiAwareness)
  $origin = Get-MousePosition
  try {
    $target = [pscustomobject]@{ X = $origin.X + 7; Y = $origin.Y + 5 }
    Set-MousePosition -X $target.X -Y $target.Y
    Start-Sleep -Milliseconds 120
    $observed = Get-MousePosition
    if ($observed.X -ne $target.X -or $observed.Y -ne $target.Y) {
      throw "SetCursorPos did not move the cursor where it was told: asked for $($target.X),$($target.Y), got $($observed.X),$($observed.Y). Something is filtering or remapping input."
    }

    $vs = [DevDrivr.Native]::VirtualScreen()
    $moveTarget = [pscustomobject]@{ X = $origin.X + 13; Y = $origin.Y + 11 }
    if ([DevDrivr.Native]::SendMouseMoveAbsolute(
        $moveTarget.X, $moveTarget.Y, $vs[0], $vs[1], $vs[2], $vs[3]) -ne 1) {
      throw 'SendInput rejected an absolute move.'
    }
    Start-Sleep -Milliseconds 120
    $moved = Get-MousePosition
    # Normalisation to 0..65535 rounds, so allow a couple of pixels.
    if ([math]::Abs($moved.X - $moveTarget.X) -gt 2 -or [math]::Abs($moved.Y - $moveTarget.Y) -gt 2) {
      throw "SendInput accepted a move that had no effect: asked for $($moveTarget.X),$($moveTarget.Y), cursor is at $($moved.X),$($moved.Y). The INPUT flags are not reaching the API."
    }

    # A press/release pair *is* a click somewhere on screen. It happens at the cursor's current
    # position, a few pixels from where the caller left it.
    Send-MouseButton -Action down
    Start-Sleep -Milliseconds 40
    $pressed = ([DevDrivr.Native]::GetAsyncKeyState([DevDrivr.Native]::VK_LBUTTON) -band 0x8000) -ne 0
    Send-MouseButton -Action up
    Start-Sleep -Milliseconds 40
    $released = ([DevDrivr.Native]::GetAsyncKeyState([DevDrivr.Native]::VK_LBUTTON) -band 0x8000) -eq 0

    if (-not $pressed) {
      throw 'SendInput reported success but the left button never registered as pressed. Synthetic clicks are not reaching the desktop: check for a UIPI integrity mismatch (app elevated, shell not), a locked session, or a UAC secure desktop.'
    }
    if (-not $released) {
      throw 'The left button stayed down after a release event. The input stream is in a bad state; move the physical mouse and re-run.'
    }
    $true
  }
  finally {
    Set-MousePosition -X $origin.X -Y $origin.Y
  }
}

# ---------------------------------------------------------------------------------------------
# Observation helpers
# ---------------------------------------------------------------------------------------------

function Wait-DevdrivrWindowState {
  <#
    .SYNOPSIS
      Poll until the window reaches a state, or time out.
    .DESCRIPTION
      Window state changes are asynchronous: the click crosses into the webview, out through IPC to
      Rust, and back into the OS. Reading the state immediately after clicking reports the old
      value and manufactures a failure.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][ValidateSet('normal', 'minimized', 'maximized', 'gone')][string]$State,
    [int]$TimeoutMs = 4000,
    [string]$ProcessName = $(if ($env:DEVDRIVR_PROC) { $env:DEVDRIVR_PROC } else { 'devdrivr' })
  )

  $deadline = [datetime]::UtcNow.AddMilliseconds($TimeoutMs)
  $last = 'unknown'
  do {
    try {
      $window = Get-DevdrivrWindow -ProcessName $ProcessName
      $last = Get-DevdrivrWindowState -Window $window
      if ($last -eq $State) { return [pscustomobject]@{ Reached = $true; State = $last; Window = $window } }
    }
    catch {
      # No process or no window: that *is* the 'gone' state.
      $last = 'gone'
      if ($State -eq 'gone') { return [pscustomobject]@{ Reached = $true; State = 'gone'; Window = $null } }
    }
    Start-Sleep -Milliseconds 120
  } while ([datetime]::UtcNow -lt $deadline)

  [pscustomobject]@{ Reached = $false; State = $last; Window = $null }
}

function Restore-DevdrivrWindow {
  <#
    .SYNOPSIS
      Bring the window back to normal state and focus, out of band from the UI under test.
  #>
  [CmdletBinding()]
  param([Parameter(Mandatory)][pscustomobject]$Window)
  [void][DevDrivr.Native]::ShowWindow($Window.Handle, [DevDrivr.Native]::SW_RESTORE)
  [void][DevDrivr.Native]::SetForegroundWindow($Window.Handle)
  Start-Sleep -Milliseconds 350
}

function Save-DevdrivrScreenshot {
  <#
    .SYNOPSIS
      Screenshot cropped to the window, scaled down for reading.
    .DESCRIPTION
      GDI screen capture returns black on a locked session or a disconnected RDP session — the
      Windows analogue of macOS's slept-display problem. A black PNG is a capture failure, not
      evidence about the app.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][pscustomobject]$Window,
    [string]$Path = (Join-Path ([IO.Path]::GetTempPath()) 'native-ui-shot.png'),
    [int]$ScaleToWidth = 1200
  )

  Add-Type -AssemblyName System.Drawing

  $bitmap = [System.Drawing.Bitmap]::new($Window.Width, $Window.Height)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CopyFromScreen($Window.X, $Window.Y, 0, 0, $bitmap.Size)
    }
    finally { $graphics.Dispose() }

    if ($ScaleToWidth -gt 0 -and $Window.Width -gt $ScaleToWidth) {
      $height = [int][math]::Round($Window.Height * ($ScaleToWidth / $Window.Width))
      $scaled = [System.Drawing.Bitmap]::new($bitmap, $ScaleToWidth, $height)
      try { $scaled.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png) }
      finally { $scaled.Dispose() }
    }
    else {
      $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
  }
  finally { $bitmap.Dispose() }

  $Path
}

function Set-DisplayAwake {
  <#
    .SYNOPSIS
      Hold the display on for the length of a harness run.
    .DESCRIPTION
      SetThreadExecutionState is scoped to the calling thread, so this only lasts while the shell
      lives. It does not defeat a *locked* session, which is the failure mode that actually blacks
      out captures — lock the screen and nothing here will save the run.
  #>
  [CmdletBinding()]
  param()
  $flags = [DevDrivr.Native]::ES_CONTINUOUS -bor
  [DevDrivr.Native]::ES_DISPLAY_REQUIRED -bor
  [DevDrivr.Native]::ES_SYSTEM_REQUIRED
  $previous = [DevDrivr.Native]::SetThreadExecutionState($flags)
  if ($previous -eq 0) { throw 'SetThreadExecutionState failed.' }
  $true
}

function Get-ForegroundProcessName {
  [CmdletBinding()]
  param()
  $hWnd = [DevDrivr.Native]::GetForegroundWindow()
  if ($hWnd -eq [IntPtr]::Zero) { return '(none)' }
  # Not $pid: that automatic variable is read-only and the assignment would throw.
  $procId = [uint32]0
  [void][DevDrivr.Native]::GetWindowThreadProcessId($hWnd, [ref]$procId)
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($proc) { $proc.ProcessName } else { "(pid $procId)" }
}

Export-ModuleMember -Function @(
  'Initialize-DpiAwareness'
  'Get-DevdrivrWindow'
  'Get-DevdrivrWindowState'
  'Get-DevdrivrControlPoint'
  'Assert-ControlPointIsClickable'
  'Set-MousePosition'
  'Get-MousePosition'
  'Send-MouseButton'
  'Invoke-MouseClick'
  'Invoke-MouseDrag'
  'Test-SyntheticInput'
  'Wait-DevdrivrWindowState'
  'Restore-DevdrivrWindow'
  'Save-DevdrivrScreenshot'
  'Set-DisplayAwake'
  'Get-ForegroundProcessName'
)
