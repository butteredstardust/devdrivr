# Which Harness?

Use this page to select a harness. Use the linked harness guide for setup and procedures.

| Harness                                                      | Command              | Real IPC? | Real layout & input?   | Real window? | HMR | Speed        |
| ------------------------------------------------------------ | -------------------- | --------- | ---------------------- | ------------ | --- | ------------ |
| **Vitest** ([TESTING.md](TESTING.md))                        | `bunx vitest run`    | mocked    | no (jsdom)             | no           | n/a | seconds      |
| **Browser** ([BROWSER_HARNESS.md](BROWSER_HARNESS.md))       | `bun run dev`        | **stub**  | yes (Chromium)         | no           | yes | instant      |
| **Remote UI** ([REMOTE_UI_HARNESS.md](REMOTE_UI_HARNESS.md)) | `bun run dev:remote` | **yes**   | yes (Chromium)         | no           | no  | ~40s/rebuild |
| **Native** ([NATIVE_UI_HARNESS.md](NATIVE_UI_HARNESS.md))    | `bun run tauri dev`  | yes       | yes, but hard to drive | **yes**      | yes | slow, manual |

## Select by symptom

| Symptom                                                            | Harness       |
| ------------------------------------------------------------------ | ------------- |
| Pure logic, formatting, parsing, a reducer, or a store transition  | Vitest        |
| Text selection, caret, or clipboard                                | Browser       |
| Scroll, resize, measured layout, overflow, or focus order          | Browser       |
| A render that needs DOM inspection                                 | Browser       |
| Contrast or theming across all 32 themes                           | Browser       |
| Data is wrong after a reload or with real rows                     | **Remote UI** |
| SQLite reads, writes, migrations, or notes/history/snippets stores | **Remote UI** |
| The stub logs `[tauri-stub] unhandled command`                     | **Remote UI** |
| MCP server, file dialogs, `fs`, or `http`                          | **Remote UI** |
| Title-bar controls, drag region, edge resize, or rounded corners   | Native        |
| Global shortcuts, menus, fullscreen, multi-monitor, or DPI         | Native        |
| It works in Chromium but not in the app                            | Native        |

## Harness limits

**Vitest** validates logic. It has no layout engine or browser event dispatch. Use Chromium to validate layout, focus, or input.

**Browser** uses Chromium with stubbed IPC. It validates UI behavior with real pixels and browser input. SQL reads return empty data. State does not persist after reload.

**Remote UI** uses Chromium with real IPC. It reads the real database, filesystem, and MCP server. It uses a build step instead of HMR.

**Native** runs the delivered window. Use it to validate window behavior and platform input. macOS requires Accessibility permission for synthetic input.

## Choose Browser or Remote UI

Use Browser for fast, repeatable layout and interaction checks. The stub provides empty tables and canned command results. It does not change your database.

Use Remote UI when stubbed data or commands block the test. It serves static build output. A save takes ~40 seconds to rebuild.

Neither Chromium harness has a native window. Use Native for window behavior.

## Rules for every harness

- A passing Vitest run does not validate layout, focus, or input. Check these in Chromium.
- A working Browser session does not validate persistence. The stub returns `[]`.
- A Chromium harness does not validate window behavior. `WindowControls` renders a platform-specific component.
- Use `getBoundingClientRect()` to get geometry. Do not estimate coordinates.
