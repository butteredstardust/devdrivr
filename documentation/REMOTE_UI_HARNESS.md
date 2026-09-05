# Remote UI Harness

Use this harness to drive the running app from Chromium with real IPC. It accesses the real database, filesystem, and MCP server through tauri-remote-ui.

> Use [HARNESSES.md](HARNESSES.md) to select a harness. Use [BROWSER_HARNESS.md](BROWSER_HARNESS.md) for fast layout and interaction checks with stubbed IPC.

## When to use it

- Data is wrong with real rows or after reload.
- You need SQLite reads, writes, migrations, or store persistence.
- The Browser harness logs [tauri-stub] unhandled command "…".
- You need the MCP server, file dialogs, fs, or http.
- You need browser automation with real IPC.

Use [NATIVE_UI_HARNESS.md](NATIVE_UI_HARNESS.md) for window chrome, dragging, resizing, and global shortcuts. Use Browser for tight layout work. Remote UI has no HMR.

## Prerequisites and setup

Run the remote development command before you open Chromium. It runs the app and the static build watcher.

```bash
cd .
bun run dev:remote
```

Wait for remote-ui: http://127.0.0.1:9090 -> window main. Then open <http://127.0.0.1:9090> or point Playwright to it.

Do not add an init script. Do not install the Browser harness stub. The page supplies the required globals.

The command runs both required processes:

- tauri dev --features remote-ui runs the app. Its native window loads the Vite server on :1420 with HMR.
- vite build --watch writes development output and sourcemaps to dist/. Chromium at :9090 loads this output.

The native window and Chromium use one app process and one database. Chromium reflects the last completed build. A save takes roughly 40 seconds to rebuild.

Ctrl-C stops both processes. scripts/dev-remote.sh handles the signal and prevents an orphaned watcher from updating dist/.

## Licensing and network limits

WARNING: tauri-remote-ui is AGPL-3.0-only. Do not include it in a distributed release. It has no authentication, authorization, or TLS.

Two gates keep the harness out of a release build:

- **Rust.** The dependency is optional, behind the `remote-ui` Cargo feature. A `compile_error!` in
  `src-tauri/src/lib.rs` fires under `cfg(all(feature = "remote-ui", not(debug_assertions)))`. A
  release build with the feature set fails to compile rather than shipping silently.
- **Frontend.** [`scripts/vite-plugin-remote-ui.js`](../scripts/vite-plugin-remote-ui.js) is gated on
  the `DEVDRIVR_REMOTE_UI` environment variable, not on build mode. `bun run build` produces the
  shipped bundle in the same `build` mode `dev:remote` uses, so mode alone cannot tell them apart.

Do not add the feature to `tauri build`. Do not add the crate to `[dependencies]`. Do not add it to
`src/lib/acknowledgments.ts`.

Validate both release gates when you change this wiring:

```bash
cd src-tauri && cargo check --release --features remote-ui   # must FAIL
cd .. && bun run build && grep -r "remote_ui_ws" dist/        # must find nothing
```

The plugin binds to 127.0.0.1 through OriginType::Localhost. Do not widen that scope without reviewing the command access it enables.

## How the harness works

Chromium loads a separate frontend bundle. The harness forwards IPC only.

```
Chromium (:9090) ──invoke()──▶ WebSocket ──▶ Rust plugin
                                               │  window.eval() on the native webview
                                               ▼
                                   real __TAURI_INTERNALS__.invoke
                                               │
                                               ▼
                                    SQLite / fs / MCP / commands
                        ◀── result emitted back over the socket ───
```

The app must run and its main window must exist. enable_application_ui() keeps that window usable while Chromium is connected.

## Frontend IPC replacement

The harness replaces invoke and listen at module resolution. It must replace every importer. Tauri plugins call invoke inside their dependencies.

Do not use a Vite alias. The shim exports only invoke. Plugin imports also require Resource and Channel. The shim imports @tauri-apps/api/core for its in-Tauri fallback.

Match the resolved file, not only the import specifier. @tauri-apps/api/window.js imports invoke from './core.js'. A bare-specifier match leaves that call unchanged.

## Required remote globals

scripts/tauri-remote-globals.js installs metadata, transformCallback, unregisterCallback, and convertFileSrc on window.**TAURI_INTERNALS**. getCurrentWindow() needs metadata.currentWindow.label before the shell mounts.

Do not define invoke in these globals. The shim checks **TAURI_INTERNALS**.invoke to select its transport. A stub routes calls away from the socket.

Do not reuse scripts/tauri-browser-stub.js. That file stubs IPC. This harness must forward IPC.

## Operating rules

- Check the vite build --watch output when a change is missing. Chromium shows the last build, not the last save.
- WARNING: Test actions write to your real database. Use Browser when you need empty state after reload.
- Do not use Channel. It uses **TAURI_INTERNALS**.transformCallback, which has no WebSocket equivalent.
- Use request/response commands only. Streaming commands are not covered by this harness.
- Use the main window only. The bridge does not support additional windows.
- Keep sourcemaps and the development build. They keep stack traces and component names readable.

## Validate the connection

Run this check after the remote page is available. It validates static output, the socket, window.eval, a real command, and a database read.

```js
await page.goto('http://127.0.0.1:9090')
// Settings → About reads the version through `invoke('plugin:app|version')`, so a real
// version number here means the full round-trip is live.
await page.getByRole('button', { name: 'Open settings' }).click()
await page.locator('button:has-text("About")').click()
await expect(page.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible()
```

Check for the actual notes, history count, and theme. An empty app indicates the Browser stub, not Remote UI.
