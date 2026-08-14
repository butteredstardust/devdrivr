# Native UI Harness

Tools for testing the **real** Tauri window on macOS — client-side decorations, the drag region,
window controls, edge resizing, and IPC health.

This is the counterpart to [BROWSER_HARNESS.md](BROWSER_HARNESS.md). The browser harness stubs the
Tauri API and runs the UI in Chromium; it is faster and has devtools, but it cannot tell you
anything about window behaviour, because none of it is real there. Everything documented in this
file exists because a bug was invisible in both vitest and the browser harness.

Files live in [`scripts/native-ui/`](../scripts/native-ui/).

| File             | Purpose                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `mouse.swift`    | CGEvent mouse driver — move/click/dblclick/drag with real motion  |
| `window.sh`      | Window bounds, minimized state, cropped screenshots, keep-awake   |
| `DebugProbe.tsx` | In-app overlay: event targets, rejections, timed IPC health check |

---

## Setup

Grant **Accessibility** (to post events) and **Screen Recording** (to capture) to the terminal or
agent that will drive the tests: System Settings → Privacy & Security. Without Accessibility the
synthetic events are dropped with no error, and every result reads as "the app ignores clicks".

```bash
cd apps/cockpit
swiftc -O -o /tmp/mouse scripts/native-ui/mouse.swift
chmod +x scripts/native-ui/window.sh
bun run tauri dev          # process name is `cockpit`, window title is `devdrivr`
scripts/native-ui/window.sh awake     # stop the display sleeping mid-run
```

Mount the probe when you need it, and remove it afterwards:

```bash
cp scripts/native-ui/DebugProbe.tsx src/app/__DebugProbe.tsx
# App.tsx: import { DebugProbe } from './__DebugProbe'  +  <DebugProbe /> before the closing </div>
```

## Driving the window

```bash
scripts/native-ui/window.sh bounds      # -> "220 130 900 600"  (x y w h, top-left origin)
scripts/native-ui/window.sh titlebar    # same x/y, height 44
scripts/native-ui/window.sh minimized   # -> true | false
scripts/native-ui/window.sh shot /tmp/a.png

/tmp/mouse click 260 152                # traffic lights: x+13/+33/+53, y+22
/tmp/mouse dblclick 600 152             # zoom / restore via the drag region
/tmp/mouse drag 600 152 900 400         # move the window
/tmp/mouse drag 1120 430 1240 430       # resize from the East edge
```

## Rules that cost time to learn

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
it. The cause was `useWindowControls` issuing one `isMaximized()` round trip per `onResized` event;
macOS emits a continuous stream of those during a zoom animation, which floods and permanently
deadlocks plugin dispatch. Fixed with a 200ms trailing debounce plus an in-flight guard — see
`src/hooks/useWindowControls.ts`, and the regression tests in
`src/hooks/__tests__/useWindowControls.test.ts`.

To reproduce or re-verify: mount the probe, note the three baseline timings, click the green
traffic light once, and watch the two plugin lanes flip to `NO RESPONSE` while `custom` stays fine.

## Findings so far

Recorded against Tauri 2.10.3 / macOS 15, on branch `feat/ui-polish-phase-2`.

- **`decorations: false` disables native edge resizing on macOS.** It does not merely clear the
  `NSWindowStyleMask.titled` bit while leaving edge tracking intact. Dragging every edge and corner
  at ±3px around the frame moved nothing; the window could not be resized at all. Hence
  `WindowResizeHandles` mounts on every platform, macOS included.
- **The unhandled-rejection listener earns its place.** Window calls written `void win.minimize()`
  swallow every error; the probe is how they surface. The hook now uses explicit `.catch`.
- **Verified working, no action needed:** drag from the bar, double-click zoom _and_ restore, green
  maximize toggle both ways, minimize (`AXMinimized` true), close, focus dimming, the left-cluster
  icon buttons, and the 44px bar layout with the drag region confined to the bar itself.
