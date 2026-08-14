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
  const invoke = async (cmd) => {
    if (cmd === 'plugin:sql|load') return 'sqlite:cockpit.db'
    if (cmd === 'plugin:sql|select') return []
    if (cmd === 'plugin:sql|execute') return [0, 0]
    if (cmd === 'plugin:event|listen') return 1
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
