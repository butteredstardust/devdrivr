# Native UI Harness

Use this harness to validate the real Tauri window on macOS and Windows. It covers client-side decorations, drag regions, window controls, edge resizing, and IPC health.

> Use [HARNESSES.md](HARNESSES.md) to select a harness.

Use [REMOTE_UI_HARNESS.md](REMOTE_UI_HARNESS.md) first for real IPC with Chromium automation. Use this harness when the test needs a native window or platform input.

Files are in [scripts/native-ui/](../scripts/native-ui/).

| File                       | Platform | Purpose                                                                |
| -------------------------- | -------- | ---------------------------------------------------------------------- |
| mouse.swift                | macOS    | CGEvent mouse driver: move, click, double-click, drag, and permissions |
| window.sh                  | macOS    | Bounds, minimized state, raise, single-instance check, and screenshots |
| mouse.ps1                  | Windows  | SendInput mouse driver and input self-test                             |
| window.ps1                 | Windows  | Bounds, DPI scale, state, control coordinates, and screenshots         |
| native.psm1                | Windows  | Shared Win32 interop for Windows scripts                               |
| verify-window-controls.ps1 | Windows  | Automated pass/fail check for title-bar controls                       |
| DebugProbe.tsx             | both     | In-app overlay for targets, rejections, and timed IPC health checks    |

The macOS and Windows controls use different components and positions. Validate a control on each supported platform.

## macOS prerequisites and setup

WARNING: Grant Accessibility before you send synthetic input. Without it, macOS removes events without an error.

Grant Accessibility and Screen Recording to the terminal or agent that runs the test. Use System Settings → Privacy & Security. Grant permission to the app at the process-tree top. This is Visual Studio Code for its terminal and Terminal for its terminal.

Run the permissions command before the test. It opens the system dialog when the permission is missing.

```bash
cd .
swiftc -O -o /tmp/mouse scripts/native-ui/mouse.swift
chmod +x scripts/native-ui/window.sh
/tmp/mouse permissions                # ALWAYS run this first — prompts if the grant is missing
bun run tauri dev          # process name is `devdrivr`, window title is `devdrivr`
scripts/native-ui/window.sh solo      # exactly one build running?
scripts/native-ui/window.sh awake     # stop the display sleeping mid-run
```

WARNING: Check that one devdrivr window is running before screenshots or input. An installed release and a dev build can look identical.

bounds finds a window by process. screencapture -R captures the pixels currently above that rectangle. Run window.sh solo first. Use window.sh front before a manual capture. shot raises the window before capture.

Mount the probe only when needed. Remove it after the test.

```bash
cp scripts/native-ui/DebugProbe.tsx src/app/__DebugProbe.tsx
# App.tsx: import { DebugProbe } from './__DebugProbe'  +  <DebugProbe /> before the closing </div>
```

## Drive the macOS window

Read the bounds before each interaction. Bounds change after move, zoom, minimize, or restore.

```bash
scripts/native-ui/window.sh bounds      # -> "220 130 900 600"  (x y w h, top-left origin)
scripts/native-ui/window.sh titlebar    # same x/y, height 44
scripts/native-ui/window.sh minimized   # -> true | false
scripts/native-ui/window.sh front       # raise it — do this before any hand-rolled screencapture
scripts/native-ui/window.sh shot /tmp/a.png

/tmp/mouse click 260 152                # traffic lights: x+13/+33/+53, y+22
/tmp/mouse dblclick 600 152             # zoom / restore via the drag region
/tmp/mouse drag 600 152 900 400         # move the window
/tmp/mouse drag 1120 430 1240 430       # resize from the East edge
```

Check the event target before you report a dead control. A settings panel can place a full-screen scrim above the window. The probe shows this as tgt=DIV top=DIV.

Validate synthetic input against a control window, such as a browser. If that window responds and devdrivr does not, the result is valid.

Keep the display awake. A sleeping display can produce black PNGs or could not create image from rect.

Do not poll a stalled IPC queue repeatedly. Restart the app for a clean baseline. Then use the probe's default 4s pass.

## Windows prerequisites and setup

WARNING: Run the input self-test before you send synthetic input. Windows can remove input without an error.

Use a complete node_modules directory. A partial install fails tauri dev at the Vite step.

```powershell
cd .
bun install                              # a partial node_modules fails `tauri dev` at the vite step
bun run tauri dev                        # process is `devdrivr`, window title is `devdrivr`

pwsh -File scripts/native-ui/mouse.ps1 selftest    # ALWAYS run this first
```

selftest moves the cursor, reads it, and sends a press/release pair. Stop when it fails. Check these conditions:

- UIPI integrity mismatch: run the app and shell at the same integrity level.
- Locked session: input does not move the cursor and screenshots are black.
- UAC secure desktop: remove it before you send input.

## Drive the Windows window

Use window.ps1 button <name>. It uses the live rectangle and DPI scale. It rejects a point that a resize handle intercepts.

```powershell
$w = 'scripts/native-ui/window.ps1'
pwsh -File $w bounds            # -> "-3413 413 1296 1531"  (x y w h, PHYSICAL px)
pwsh -File $w dpi               # -> "dpi=144 scale=1.5"
pwsh -File $w state             # -> normal | minimized | maximized
pwsh -File $w buttons           # every control's target point, clickability checked
pwsh -File $w button close      # -> "x y" for one control
pwsh -File $w raw               # GetWindowRect vs. the DWM frame
pwsh -File $w shot C:\temp\a.png
pwsh -File $w info              # everything in one object

pwsh -File scripts/native-ui/mouse.ps1 click 1234 445
pwsh -File scripts/native-ui/mouse.ps1 dblclick 1234 445
pwsh -File scripts/native-ui/mouse.ps1 drag 900 445 1100 505
```

For a packaged build, override the process name: $env:DEVDRIVR_PROC = 'devdrivr'.

## Run the Windows control check

Start the dev app before this check. The default run closes the app during its final check.

```powershell
bun run tauri dev
pwsh -File scripts/native-ui/verify-window-controls.ps1              # last check closes the app
pwsh -File scripts/native-ui/verify-window-controls.ps1 -SkipClose   # leave it running
```

The check validates minimize, maximize, restore-via-maximize, double-click zoom and restore, drag-region movement, and close. It checks OS state through IsIconic, IsZoomed, and window destruction. It does not check the DOM.

Failures create a cropped screenshot in %TEMP%\devdrivr-native-ui\. The command returns exit code 1 when a check fails.

## Windows operating rules

Coordinates are physical pixels. The app uses CSS pixels. At 150% scaling, multiply CSS offsets by the scale. Use GetDpiForWindow or window.ps1.

Anchor coordinates to the DWM frame. GetWindowRect includes an invisible resize border. Use DWMWA_EXTENDED_FRAME_BOUNDS for visible bounds.

The top 4px and the 10×10 corners belong to WindowResizeHandles. They are fixed at z-39 above the title bar. A click there begins resize. Assert-ControlPointIsClickable validates target points.

Read the bounds before every interaction. Poll for a state change instead of reading it immediately. Wait-devdrivrWindowState uses a timeout.

Do not use $input or $pid for variables. They are PowerShell automatic variables.

Pass a struct instance to Marshal.SizeOf. Do not pass [DevDrivr.INPUT].

Windows can refuse SetForegroundWindow for a background process. The first click can activate the window. Click the window once and run the check again.

## IPC health check

Custom Tauri commands and plugin commands use independent dispatch. Check both command types when you validate IPC health.

| Command                     | Normal result | Result after a stalled plugin dispatch |
| --------------------------- | ------------- | -------------------------------------- |
| get_platform_info (custom)  | ~1ms          | ~10ms OK                               |
| plugin:window\|scale_factor | ~1ms          | never responds                         |
| plugin:sql\|load            | ~1ms          | never responds                         |

devdrivr persists through plugin:sql. A stalled plugin dispatch can leave the UI responsive while persistence stops. Use the probe to check custom, plugin:window, and plugin:sql commands independently.

Title-bar lifecycle operations use dedicated Rust commands in src-tauri/src/window_commands.rs. useWindowControls uses browser focus and resize events. It performs one trailing custom-command reconciliation after resize bursts.

## Control and input validation

The drag region can cover a control. Check OS state after each click. Hover only confirms pointer targeting. It does not validate the control handler.

Do not accept a check when the window already has the expected state. Change the state first. Then validate the transition.

On macOS, decorations: false removes native edge resizing. Use WindowResizeHandles on every platform.

On Windows, decorations: false can leave an invisible resize border in GetWindowRect. Use DWMWA_EXTENDED_FRAME_BOUNDS.

For a title-bar input, keep the focused input mounted. A replacement modal input can separate WKWebView DOM focus from the native first responder.

Use explicit .catch for window calls that run without await. The probe reports unhandled rejections.
