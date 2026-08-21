# Remote UI Harness

How to drive the **running** cockpit app from a plain Chromium page — real database, real
filesystem, real MCP server — using the `tauri-remote-ui` bridge.

> Not sure this is the one you want? See [HARNESSES.md](HARNESSES.md). Short version: use
> [BROWSER_HARNESS.md](BROWSER_HARNESS.md) for layout and interaction, this for anything where the
> stub's canned data is in the way.

## When to reach for it

- A bug that only appears with real rows, or only after a reload
- SQLite reads/writes, migrations, the notes / history / snippets / API-history stores
- Anything the browser stub logs `[tauri-stub] unhandled command "…"` for
- The MCP server, file dialogs, `fs`, `http`
- Any time you want Playwright to click through the app and have the clicks _mean_ something

Not for: window chrome, dragging, resizing, global shortcuts — those are Native only. Not for tight
layout iteration either; there is no HMR here, so use the browser harness for that.

## Setup

```bash
cd apps/cockpit
bun run dev:remote
```

Wait for `remote-ui: http://127.0.0.1:9090 -> window main` in the output, then open
<http://127.0.0.1:9090> in any browser, or point Playwright at it. No init script and no stub —
unlike the browser harness, the page boots on its own.

Two things start, and both are needed:

- `tauri dev --features remote-ui` — the app. Its native window still loads the Vite dev server on
  :1420 with full HMR, exactly as usual.
- `vite build --watch` — writes `dist/` in development mode with sourcemaps. **This** is what the
  browser at :9090 loads, because the bridge serves static files off disk and cannot proxy a dev
  server (and the WebSocket must be same-origin, so the browser cannot just load :1420 instead).

So there are two copies of the frontend against one app process. The native window is live; the
browser copy trails it by one rebuild, roughly 40 seconds. Both talk to the same database.

Ctrl-C stops both — [`scripts/dev-remote.sh`](../scripts/dev-remote.sh) traps the signal, because an
orphaned watcher quietly rewriting `dist/` under the next run is a genuinely confusing failure.

## Licensing — read this before touching the wiring

`tauri-remote-ui` is **AGPL-3.0-only**. Cockpit is MIT. Linking an AGPL crate into a distributed
binary would put the whole app under that copyleft, so the bridge is gated twice:

- **Rust:** an `optional` dependency behind the `remote-ui` Cargo feature, plus a `compile_error!`
  in `src-tauri/src/lib.rs` under `cfg(all(feature = "remote-ui", not(debug_assertions)))`. A
  release build with the feature set fails to compile rather than silently shipping.
- **Frontend:** [`scripts/vite-plugin-remote-ui.js`](../scripts/vite-plugin-remote-ui.js) is gated
  on the `COCKPIT_REMOTE_UI` environment variable, not on build mode — `bun run build` produces the
  shipped bundle in the same `build` mode `dev:remote` uses, so mode alone cannot tell them apart.

Consequences, all of them deliberate:

- Never move the crate into `[dependencies]` proper or add the feature to `tauri build`.
- It is **not** in `src/lib/acknowledgments.ts`. That tab lists what ships; this does not ship.
- If you change either gate, the licensing question comes back — verify with:

  ```bash
  cd src-tauri && cargo check --release --features remote-ui   # must FAIL
  cd .. && bun run build && grep -r "remote_ui_ws" dist/        # must find nothing
  ```

There is also **no authentication, authorization or TLS** in the plugin. It binds to `127.0.0.1`
(`OriginType::Localhost`, the default) and that is deliberately not configurable here — a wider
scope would hand anyone on the network the ability to invoke every command the app exposes.

## How it works

The remote page does not stream the native UI. It loads its own copy of the bundle, and only the
IPC is forwarded:

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

Because the round-trip goes _through_ the native webview, the app must be running and its `main`
window must exist. `enable_application_ui()` keeps that window usable while a browser is connected;
without it the plugin replaces it with a blocking screen.

### The frontend swap

The npm half of `tauri-remote-ui` exports replacement `invoke` and `listen` functions and expects
you to import them by hand. Cockpit cannot: `@tauri-apps/plugin-sql`, `plugin-fs`, `plugin-http` and
`plugin-dialog` each reach for `invoke` themselves, deep in `node_modules`, and those are exactly
the calls worth exercising. So the swap happens at module-resolution time for every importer at
once. Two things about that are non-obvious, and both cost an hour to find:

- **It cannot be a Vite `alias`.** The shim exports _only_ `invoke`, while `plugin-sql` imports
  `{ Resource, Channel, invoke }` — aliasing the whole module turns those into build errors. And the
  shim itself imports `@tauri-apps/api/core` for its in-Tauri fallback, so a blanket alias resolves
  to itself. Instead the plugin generates a facade that re-exports the genuine module and shadows
  the single binding (an explicit re-export wins over `export *` of the same name; two `export *`
  would make it _ambiguous_, which is not a build error — the name just silently stops existing).
- **Matching is on the resolved file, not the specifier.** `@tauri-apps/api/window.js` imports
  `invoke` from `'./core.js'` relatively. Spelled that way it slips past a bare-specifier match, so
  `getCurrentWindow()` keeps the untouched `invoke` and dies on `__TAURI_INTERNALS__.invoke is not
a function`.

### Why the page defines `metadata` but not `invoke`

[`scripts/tauri-remote-globals.js`](../scripts/tauri-remote-globals.js) installs a partial
`window.__TAURI_INTERNALS__` — `metadata`, `transformCallback`, `unregisterCallback`,
`convertFileSrc` — because `getCurrentWindow()` reads `metadata.currentWindow.label` at module scope
and the page otherwise dies on `Cannot read properties of undefined (reading 'metadata')` before the
shell mounts.

It pointedly does **not** define `invoke`. The shim decides which transport to use by testing
`__TAURI_INTERNALS__.invoke`, so defining it — even as a stub — routes every call into a dead end
instead of over the socket, and the entire point of this harness is that the calls are real. This is
also why [`scripts/tauri-browser-stub.js`](../scripts/tauri-browser-stub.js) cannot be reused here:
that file exists to fake IPC, this one exists to get out of its way.

## Gotchas

- **You are looking at the last build, not the last save.** If a change isn't showing up, check the
  `vite build --watch` output before doubting the code. This is the single most likely confusion.
- **A probe writes to your real database.** Seeding fifty rows to test a list is fifty rows you now
  own. Use the browser harness when you want a clean slate every reload.
- **`Channel` does not work.** It goes through `__TAURI_INTERNALS__.transformCallback`, which has no
  WebSocket equivalent. Request/response commands are fine; streaming ones are not. Nothing in
  cockpit uses one today — if that changes, this harness stops covering it.
- **Only the `main` window is bridged.** Multi-window support is on the plugin's roadmap, not in it.
- **Sourcemaps are on and the build is in development mode**, so stack traces and React component
  names are readable. That is the point; don't "optimise" `dev-remote.sh` into a production build.

## Verifying it works

A quick end-to-end check that exercises the whole chain — static serve, socket, `window.eval`, a
real command, and a real database read:

```js
await page.goto('http://127.0.0.1:9090')
// Settings → About reads the version through `invoke('plugin:app|version')`, so a real
// version number here means the full round-trip is live.
await page.getByRole('button', { name: 'Open settings' }).click()
await page.locator('button:has-text("About")').click()
await expect(page.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible()
```

If the shell renders with your actual notes, history count and theme rather than an empty app, the
bridge is working. If it renders empty, you are somehow on the stub.
