/**
 * Minimal `window.__TAURI_INTERNALS__` stub so the cockpit web bundle boots in a
 * plain Chromium page (Playwright, DevTools MCP, `vite dev` in a normal browser).
 *
 * Without it the app throws `Cannot read properties of undefined (reading
 * 'metadata')` during startup: the Tauri JS API reads `__TAURI_INTERNALS__`
 * eagerly, and the SQL plugin calls fail before the shell ever mounts.
 *
 * Scope: enough to *render* the UI for DOM-level debugging (selection, layout,
 * re-render behaviour). Persistence is faked — every SQL read returns empty, so
 * stores start blank and nothing survives a reload. Not a substitute for
 * running the real app when testing anything that touches disk or the DB.
 *
 * `bun run dev` installs this automatically (see scripts/vite-plugin-tauri-stub.js), so
 * opening http://localhost:1420 in any browser just works. Scripted harnesses that
 * navigate to a built bundle still install it themselves.
 *
 * Usage with Playwright (must run before any page script):
 *
 *   import { installTauriStub } from './scripts/tauri-browser-stub.js'
 *   await page.addInitScript(installTauriStub)
 *   await page.goto('http://localhost:5173')
 *
 * Usage from the Playwright MCP `browser_run_code_unsafe` tool: paste the body
 * of `installTauriStub` into an `addInitScript` call — it is deliberately
 * self-contained and dependency-free so it survives copy/paste.
 *
 * See documentation/BROWSER_HARNESS.md for the full workflow.
 */
export function installTauriStub() {
  // Under the real app Tauri installs its own IPC bridge before any page script,
  // so this is a no-op there and the dev server can inject it unconditionally.
  if (window.__TAURI_INTERNALS__) return

  const invoke = async (cmd, args) => {
    if (cmd === 'plugin:sql|load') return 'sqlite:cockpit.db'
    if (cmd === 'plugin:sql|select') return []
    if (cmd === 'plugin:sql|execute') return [0, 0]
    // Custom Rust command: db.ts batches writes through it and ignores the result.
    if (cmd === 'db_execute_batch') return null
    if (cmd === 'plugin:event|listen') return 1
    // Custom Rust commands the shell calls on boot. Returning null here left the
    // updater store parsing `undefined` and the MCP panel stuck on "checking".
    if (cmd === 'get_platform_info') return ['macos', 'aarch64']
    if (cmd === 'mcp_status' || cmd === 'mcp_apply_settings' || cmd === 'mcp_stop') {
      const settings = args?.settings ?? {}
      const host = settings.host ?? '127.0.0.1'
      const port = settings.port ?? 17347
      return {
        running: false,
        host,
        port,
        url: `http://${host}:${port}/mcp`,
        lastError: null,
      }
    }
    // External links: the real app hands these to the OS. A browser harness has no OS to hand
    // them to, so record them for assertions and leave the page where it is.
    if (cmd === 'plugin:opener|open_url') {
      window.__tauriStubOpenedUrls = window.__tauriStubOpenedUrls ?? []
      window.__tauriStubOpenedUrls.push(args?.url ?? null)
      return null
    }
    if (cmd === 'window_is_maximized' || cmd === 'window_toggle_maximize') return false
    if (
      cmd === 'window_focus' ||
      cmd === 'window_minimize' ||
      cmd === 'window_close' ||
      cmd === 'window_start_resize'
    ) {
      return null
    }
    // Window-control layer (client-side decorations): boot-time reads resolve to sane
    // defaults, mutating calls resolve to void. Nothing here actually moves/resizes the
    // Chromium window — window/menu behaviour still needs the real app (see
    // documentation/BROWSER_HARNESS.md).
    if (cmd === 'plugin:window|is_maximized') return false
    if (cmd === 'plugin:window|is_focused') return true
    if (
      cmd === 'plugin:window|toggle_maximize' ||
      cmd === 'plugin:window|maximize' ||
      cmd === 'plugin:window|unmaximize' ||
      cmd === 'plugin:window|minimize' ||
      cmd === 'plugin:window|unminimize' ||
      cmd === 'plugin:window|close' ||
      cmd === 'plugin:window|start_resize_dragging' ||
      cmd === 'plugin:window|start_dragging'
    ) {
      return null
    }
    // Everything else — file dialogs, fs, http — has no browser equivalent here.
    // Resolving silently makes those look like they worked, so say so instead.
    console.warn(`[tauri-stub] unhandled command "${cmd}" — resolved as null. Use the real app.`)
    return null
  }

  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback: (cb) => {
      const id = Math.floor(Math.random() * 1e9)
      window['_' + id] = cb
      return id
    },
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
    },
  }

  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
}
