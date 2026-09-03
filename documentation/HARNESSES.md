# Which Harness?

devdrivr has four ways to exercise the UI. They are not ranked — each one can see things the others
are blind to, and each one will happily give you a confident wrong answer about the things it
cannot see. This page is the routing table; the linked documents are the how-to.

| Harness                                                      | Command              | Real IPC? | Real layout & input?   | Real window? | HMR | Speed        |
| ------------------------------------------------------------ | -------------------- | --------- | ---------------------- | ------------ | --- | ------------ |
| **Vitest** ([TESTING.md](TESTING.md))                        | `bunx vitest run`    | mocked    | no (jsdom)             | no           | n/a | seconds      |
| **Browser** ([BROWSER_HARNESS.md](BROWSER_HARNESS.md))       | `bun run dev`        | **stub**  | yes (Chromium)         | no           | yes | instant      |
| **Remote UI** ([REMOTE_UI_HARNESS.md](REMOTE_UI_HARNESS.md)) | `bun run dev:remote` | **yes**   | yes (Chromium)         | no           | no  | ~40s/rebuild |
| **Native** ([NATIVE_UI_HARNESS.md](NATIVE_UI_HARNESS.md))    | `bun run tauri dev`  | yes       | yes, but hard to drive | **yes**      | yes | slow, manual |

## Start from the symptom

| The bug is about…                                                  | Use           |
| ------------------------------------------------------------------ | ------------- |
| Pure logic, formatting, parsing, a reducer, a store transition     | Vitest        |
| Text selection, caret, clipboard                                   | Browser       |
| Scroll, resize, measured layout, overflow, focus order             | Browser       |
| "It re-renders and I can't see why"                                | Browser       |
| Contrast/theming across all 32 themes                              | Browser       |
| Data that is wrong _after_ a reload, or only wrong with real rows  | **Remote UI** |
| SQLite reads/writes, migrations, the notes/history/snippets stores | **Remote UI** |
| Anything the stub logs `[tauri-stub] unhandled command` for        | **Remote UI** |
| The MCP server, file dialogs, `fs`, `http`                         | **Remote UI** |
| Title-bar controls, drag region, edge resize, rounded corners      | Native        |
| Global shortcuts, menus, fullscreen, multi-monitor, DPI            | Native        |
| "Works in Chromium, broken in the app"                             | Native        |

## The one-paragraph version

**Vitest** is the default and should stay that way — but it has no layout engine and no real event
dispatch, so it will certify code that cannot run in any browser. It has done exactly that twice
(see [BROWSER_HARNESS.md](BROWSER_HARNESS.md)).

**Browser** is Vitest's opposite: real Chromium, real pixels, real pointer and keyboard events,
against the same React code — but `window.__TAURI_INTERNALS__` is a stub, so every SQL read returns
empty and nothing survives a reload. Perfect for how the UI _behaves_, useless for what it _holds_.

**Remote UI** is the browser harness with the stub removed: the page still runs in Chromium and is
still fully automatable, but `invoke` and `listen` are forwarded over a WebSocket into the live app
process, so you are looking at the real database, the real filesystem and the real MCP server. The
price is a build step instead of HMR. Reach for it the moment the canned data is what's in your way.

**Native** is the only one that is actually the product. Everything about the window itself —
chrome, dragging, resizing, the OS — exists only here, and driving it needs platform-specific
synthetic input with an Accessibility grant on macOS.

## Why there are three and not one

The obvious question is why the remote bridge doesn't just replace the stub. Two reasons:

1. **No HMR.** `tauri-remote-ui` serves static files off disk and cannot proxy the Vite dev server,
   so `dev:remote` runs `vite build --watch` alongside. A save costs ~40 seconds instead of nothing.
   For iterating on a layout fix that is the difference between pleasant and unbearable.
2. **The stub is deterministic.** Empty tables and canned command results are a _feature_ when you
   are debugging rendering: the same page every time, no state carried over from the last run, and
   no risk of a probe writing to the database you actually use.

And neither replaces Native, because neither has a window.

## Rules that apply to all of them

- **A green Vitest run is not evidence about layout, focus, or input.** Confirm in Chromium first.
- **A working browser session is not evidence about persistence.** The stub returns `[]` and means
  it.
- **Neither is evidence about window behaviour.** `WindowControls` even renders a different
  component per platform.
- **Get geometry from `getBoundingClientRect()`, never from a guess** — a probe clicking the wrong
  `y` looks exactly like the bug you are hunting.
