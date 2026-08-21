/**
 * The non-IPC half of `window.__TAURI_INTERNALS__`, for the remote-UI bundle.
 *
 * `tauri-remote-ui` replaces `invoke` and `listen`, but parts of the Tauri JS API reach for the
 * globals directly instead of going through a command: `getCurrentWindow()` reads
 * `__TAURI_INTERNALS__.metadata.currentWindow.label` at module scope, which is why an otherwise
 * working remote page dies on `Cannot read properties of undefined (reading 'metadata')` before
 * the shell mounts.
 *
 * This deliberately does **not** define `invoke`. The shim decides which transport to use by
 * testing `__TAURI_INTERNALS__.invoke`, so defining it — even as a stub — would silently route
 * every call back into a dead end instead of over the WebSocket, and the whole point of the remote
 * bridge is that the calls are real. Same reason this cannot just reuse
 * `scripts/tauri-browser-stub.js`: that file exists to fake IPC, this one exists to get out of its
 * way.
 */
export function installRemoteUiGlobals() {
  // Belt and braces: if this bundle is ever opened inside the native webview, Tauri's own bridge is
  // already installed and overwriting it would break the app outright.
  if (window.__TAURI_INTERNALS__) return

  window.__TAURI_INTERNALS__ = {
    // Callbacks are registered on `window` by numeric id and invoked by name from the Rust side.
    // Over the socket nothing calls back this way today, but `Channel` constructs one eagerly, so
    // it has to exist for the module to load.
    transformCallback: (cb) => {
      const id = Math.floor(Math.random() * 1e9)
      window['_' + id] = cb
      return id
    },
    unregisterCallback: (id) => {
      delete window['_' + id]
    },
    // No asset protocol over plain HTTP; return the path so a caller gets something inert rather
    // than a thrown error from an undefined function.
    convertFileSrc: (filePath) => filePath,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
    },
  }

  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
}
