# Native UI Harness

Tools for testing the **real** Tauri window on macOS and Windows — client-side decorations, the
drag region, window controls, edge resizing, and IPC health.

This is the counterpart to [BROWSER_HARNESS.md](BROWSER_HARNESS.md). The browser harness stubs the
Tauri API and runs the UI in Chromium; it is faster and has devtools, but it cannot tell you
anything about window behaviour, because none of it is real there. Everything documented in this
file exists because a bug was invisible in both vitest and the browser harness.

Files live in [`scripts/native-ui/`](../scripts/native-ui/).

| File                         | Platform | Purpose                                                             |
| ---------------------------- | -------- | ------------------------------------------------------------------- |
| `mouse.swift`                | macOS    | CGEvent mouse driver — move/click/dblclick/drag, plus `permissions` |
| `window.sh`                  | macOS    | Bounds, minimized state, raise, single-instance check, screenshots  |
| `mouse.ps1`                  | Windows  | SendInput mouse driver, plus `selftest` for the input channel       |
| `window.ps1`                 | Windows  | Bounds, DPI scale, min/max state, control coordinates, screenshots  |
| `native.psm1`                | Windows  | Shared Win32 interop behind the two Windows scripts                 |
| `verify-window-controls.ps1` | Windows  | Automated pass/fail run over every title-bar control                |
| `DebugProbe.tsx`             | both     | In-app overlay: event targets, rejections, timed IPC health check   |

The two platforms are not interchangeable, and not only for tooling reasons: `WindowControls`
renders a **different component** on each. macOS gets `MacTrafficLights` on the left, Windows and
Linux get `WindowsControls` on the right, and the two sit in differently-positioned wrappers. A
control bug on one platform says nothing about the other — the Windows regression below existed
while macOS was fine.

---

## macOS setup

Grant **Accessibility** (to post events) and **Screen Recording** (to capture) to the terminal or
agent that will drive the tests: System Settings → Privacy & Security. Without Accessibility the
synthetic events are dropped with no error, and every result reads as "the app ignores clicks".

The grant lands on the app at the top of the process tree, not on `/tmp/mouse` — running from a VS
Code terminal it is **Visual Studio Code** in the Accessibility list, from Terminal it is
**Terminal**. `mouse permissions` raises the system dialog, which a dropped CGEvent never does.

```bash
cd apps/cockpit
swiftc -O -o /tmp/mouse scripts/native-ui/mouse.swift
chmod +x scripts/native-ui/window.sh
/tmp/mouse permissions                # ALWAYS run this first — prompts if the grant is missing
bun run tauri dev          # process name is `cockpit`, window title is `devdrivr`
scripts/native-ui/window.sh solo      # exactly one build running?
scripts/native-ui/window.sh awake     # stop the display sleeping mid-run
```

### The screenshot lies if something is in front

`bounds` finds a window by _process_; `screencapture -R` photographs whatever is on top at those
coordinates. Measure one window while another covers it and you get a truthful rectangle around
somebody else's pixels — a real screenshot of the wrong app, with nothing to tip you off.

This has produced two confident, wrong findings, both in the session that added rounded corners:
"synthetic clicks are being dropped" (the window was behind the editor, and Accessibility turned out
to be granted all along) and "the corners are square when zoomed" (that was a second, older build of
cockpit running alongside the dev one).

`shot` now raises the window before capturing. When capturing a rect by hand, raise it yourself with
`window.sh front` — and run `window.sh solo` first, because an installed release and a dev build are
indistinguishable in a screenshot and only one of them has your change in it.

Mount the probe when you need it, and remove it afterwards:

```bash
cp scripts/native-ui/DebugProbe.tsx src/app/__DebugProbe.tsx
# App.tsx: import { DebugProbe } from './__DebugProbe'  +  <DebugProbe /> before the closing </div>
```

## Driving the window (macOS)

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

---

## Windows setup

No permission dialog to grant, unlike macOS Accessibility — but synthetic input is discarded just
as silently, so the equivalent preflight still matters.

```powershell
cd apps/cockpit
bun install                              # a partial node_modules fails `tauri dev` at the vite step
bun run tauri dev                        # process is `cockpit`, window title is `devdrivr`

pwsh -File scripts/native-ui/mouse.ps1 selftest    # ALWAYS run this first
```

`selftest` moves the cursor, reads it back, and posts a press/release pair. If it fails, every
subsequent finding is a harness artefact rather than a bug. The three causes:

- **UIPI integrity mismatch.** The app is elevated and the shell is not (or vice versa). Windows
  drops the input with no error. Run both at the same integrity level.
- **Locked session.** No cursor movement and black screenshots.
- **UAC secure desktop.** Anything on it swallows all synthetic input until dismissed.

### Driving the window

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

Use `window.ps1 button <name>` instead of computing coordinates by hand. It derives them from the
live rect and the window's DPI scale, and refuses to return a point a resize handle would intercept.

For a packaged build, override the process name: `$env:COCKPIT_PROC = 'devdrivr'`.

### The automated run

```powershell
bun run tauri dev
pwsh -File scripts/native-ui/verify-window-controls.ps1              # last check closes the app
pwsh -File scripts/native-ui/verify-window-controls.ps1 -SkipClose   # leave it running
```

Seven checks: minimize, maximize, restore-via-maximize, double-click zoom and restore on the drag
region, a drag that moves the window, and close. Each one clicks a real control and then asserts
against the **OS** — `IsIconic`, `IsZoomed`, window destroyed — never against the DOM, because a
click the drag region absorbs leaves the DOM looking perfectly healthy. Failures write a cropped
screenshot to `%TEMP%\cockpit-native-ui\`. Exit code is 1 if anything failed.

The drag-region checks are not incidental. The fix for the regression below works by raising the
control cluster above the drag layer, so dragging is the thing most at risk from it.

## Windows rules that cost time to learn

**Coordinates are physical pixels; the app lays out in CSS pixels.** This machine runs at 150%
scaling, so a control 31 CSS px from the right edge sits 46 physical px from it. Get the scale from
`GetDpiForWindow` and multiply — `window.ps1` does. Hard-coding CSS offsets misses every button by
a third of the bar and reads as "the controls are dead".

**Anchor to the DWM frame, not `GetWindowRect`.** `GetWindowRect` includes an invisible resize
border — measured 7px per side here — so right-edge-relative coordinates drift outward. `window.ps1
raw` shows both; `DWMWA_EXTENDED_FRAME_BOUNDS` is what the user sees.

**The top 4px and the 10×10 corners belong to `WindowResizeHandles`.** They are `fixed` at `z-39`,
above the title bar. A click there starts a resize, so the control underneath looks broken.
`Assert-ControlPointIsClickable` fails loudly rather than returning a false negative.

**Re-read the bounds before every interaction** — same rule as macOS, same reason.

**Poll for the state change; don't read it immediately.** The click crosses into WebView2, out
through IPC to Rust, and back into the OS. An instant read returns the old value and manufactures a
failure. `Wait-CockpitWindowState` polls with a timeout.

**`$input` and `$pid` are PowerShell automatic variables.** Assigning to `$pid` throws outright;
`$input` breaks in subtler ways. Both bit this harness during development.

**`Marshal.SizeOf` needs the struct instance, not the type.** Passing `[DevDrivr.INPUT]` resolves to
the object overload and throws about `System.RuntimeType`.

**Windows may refuse `SetForegroundWindow` from a background process.** If the app is not focused,
the first click can be consumed by activation. The verify script warns when it detects this; click
the window once yourself and re-run.

## Rules that cost time to learn (macOS)

**Re-read the bounds before every single interaction.** They change after any move, zoom, minimize,
or restore. Clicking cached coordinates lands in empty space and produces confident, entirely false
findings — "double-click never restores", "the green light does nothing". Both were coordinate
errors, not bugs.

**`process "cockpit"`, not `process "devdrivr"`.** `devdrivr` is the window title and also appears
in editor window titles, so it can match a completely unrelated app.

**Check what the click actually hit before believing a control is dead.** An open settings panel
puts a full-screen scrim over everything; the probe shows this instantly as `tgt=DIV top=DIV`.

**Validate the input method against a control window.** Before concluding "edge resize doesn't
work", run the identical synthetic drag on an ordinary window (a browser). If that one resizes and
the app's doesn't, the finding is real. This is what turned the resize-handle bug from a suspicion
into a fact.

**Keep the display awake.** A slept display makes `screencapture` return all-black PNGs or fail with
`could not create image from rect`. `window.sh awake` handles it.

**Don't probe a wedged IPC queue hard.** Polling several commands a second adds to the jam and makes
the reading ambiguous. Restart the app for a clean baseline, then use the probe's default 4s pass.

## The IPC deadlock (why the probe splits custom vs. plugin commands)

Tauri routes custom `#[tauri::command]` handlers and plugin commands through different dispatch.
They fail **independently**, and that asymmetry is what made this bug so hard to see:

| Command                       | Before | After one traffic-light click |
| ----------------------------- | ------ | ----------------------------- |
| `get_platform_info` (custom)  | ~1ms   | ~10ms OK                      |
| `plugin:window\|scale_factor` | ~1ms   | never responds                |
| `plugin:sql\|load`            | ~1ms   | never responds                |

Cockpit persists everything through `plugin:sql`, so the app kept rendering perfectly while
**silently writing nothing to disk** for the rest of the process's life. Nothing in the UI showed
it. The original cause was `useWindowControls` issuing `plugin:window|is_maximized` reads from a
native resize-event listener; macOS emits a continuous stream of resize events during a zoom
animation, which can flood and permanently deadlock plugin dispatch.

The durable fix keeps the unified client-side title bar but removes its lifecycle operations from
the window plugin entirely. Close, minimize, maximize, focus, and edge resize now use dedicated
Rust commands in `src-tauri/src/window_commands.rs`. `useWindowControls` observes ordinary browser
focus/resize events and performs a single trailing custom-command reconciliation after resize
bursts. This means title-bar activity cannot jam the SQL plugin queue.

To reproduce the historical failure, check out a revision before the Rust command bridge, mount
the probe, note the three baseline timings, click the green traffic light once, and watch the two
plugin lanes flip to `NO RESPONSE` while `custom` stays fine.

## Findings so far — Windows

Recorded against Tauri 2.10.3 / WebView2 / Windows 11 Pro 26200, at 150% display scaling.

- **The drag layer swallowed every Windows window control.** `TitleBar.tsx` renders
  `data-tauri-drag-region` as `absolute inset-0`. A positioned element with `z-index: auto` paints
  above every _non-positioned_ sibling regardless of DOM order, and the Windows control cluster was
  `ml-auto flex items-center` — static. So all three buttons sat under the drag layer and clicks
  started a window drag instead. The macOS cluster is `absolute`, which is why only Windows broke.
  Fixed by making the cluster `relative`. `verify-window-controls.ps1` reproduces it exactly: revert
  the class and the three control checks fail while all three drag-region checks still pass.
- **Hover proves hit-testing; state proves the handler.** With the bug present the close button still
  turned red on hover, because `onMouseEnter` fires on the element the cursor is over even when a
  sibling layer would win the click. Do not read a hover response as "the button works".
- **A vacuous pass is the harness's worst failure mode.** An assertion of the form "wait until the
  window is normal" passes instantly when the window is _already_ normal, so
  "maximize restores the window" reported PASS while maximize was completely broken. Every check now
  refuses to run when the window already holds the expected state.
- **`decorations: false` leaves an invisible resize border in `GetWindowRect`.** Measured 7-9px per
  side. Right-edge-anchored coordinates drift outward unless you use
  `DWMWA_EXTENDED_FRAME_BOUNDS`.
- **Verified working, no action needed:** minimize, maximize and restore via the button, double-click
  zoom and restore on the drag region, dragging the window from the bar, close, and the
  `custom`/`plugin:window`/`plugin:sql` IPC lanes all responding in 1-4ms throughout — the macOS
  deadlock has no Windows counterpart in this build.

### The harness bug that faked an app bug

Worth reading before trusting any run, because the false result was completely convincing: the app
accepted hover but ignored every click, on the title bar _and_ on the sidebar, while IPC was healthy.

The cause was in the harness. PowerShell cannot assign through a value-type member chain —
`$evt.mi.dwFlags = ...` mutates a temporary copy of the nested `MOUSEINPUT` and throws the write
away. `dwFlags` stayed `0`, so `SendInput` was handed a flagless mouse event, **returned 1 for it**,
and delivered nothing. Cursor positioning went through `SetCursorPos`, which kept working — hence
hover without clicks.

Two lessons are now baked into the code. `INPUT` structs are filled in C# (`Native.SendMouseButton`),
not PowerShell. And `Test-SyntheticInput` no longer trusts a return code: it asserts a SendInput
absolute move actually lands, and that `GetAsyncKeyState(VK_LBUTTON)` observes the press and the
release. The old check passed happily throughout the failure.

The general rule from the macOS section applies verbatim and would have caught it in one step:
**validate the input method against a control window.** Clicking Notepad and confirming it takes the
foreground is a two-line check that no app logic can influence.

## Findings so far — macOS

Recorded against Tauri 2.10.3 / macOS 15, on branch `feat/ui-polish-phase-2`.

- **`decorations: false` disables native edge resizing on macOS.** It does not merely clear the
  `NSWindowStyleMask.titled` bit while leaving edge tracking intact. Dragging every edge and corner
  at ±3px around the frame moved nothing; the window could not be resized at all. Hence
  `WindowResizeHandles` mounts on every platform, macOS included.
- **The unhandled-rejection listener earns its place.** Window calls written `void win.minimize()`
  swallow every error; the probe is how they surface. The hook now uses explicit `.catch`.
- **A title-bar launcher must be the real focused input.** Replacing a clicked title-bar button
  with a modal input left WKWebView DOM focus and the native first responder out of sync. The
  unified bar now keeps its search input mounted permanently and expands results beneath that same
  field, so a physical click and subsequent typing target one native control.
- **Verified working, no action needed:** drag from the bar, double-click zoom _and_ restore, green
  maximize toggle both ways, minimize (`AXMinimized` true), close, focus dimming, the left-cluster
  icon buttons, and the 44px bar layout with the drag region confined to the bar itself.
