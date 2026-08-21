/**
 * Build-only: route `invoke` and `listen` through the remote-UI WebSocket instead of Tauri IPC.
 *
 * `tauri-remote-ui` ships shims for those two functions and expects you to import them by hand.
 * Cockpit cannot: `@tauri-apps/plugin-sql`, `plugin-fs`, `plugin-http` and `plugin-dialog` each
 * reach for `invoke` themselves, deep inside node_modules, and those are exactly the calls worth
 * exercising from a browser. So the swap happens at resolution time, for every importer at once.
 *
 * A plain Vite `alias` does not work here, twice over. The shim module exports *only* `invoke`,
 * while plugin-sql imports `{ Resource, Channel, invoke }` — aliasing the whole module turns those
 * into build errors. And the shim itself imports `@tauri-apps/api/core` to fall back on when a real
 * Tauri runtime is present, so a blanket alias would resolve it to itself. This instead generates a
 * facade that re-exports the genuine module and overrides the one binding (an explicit re-export
 * shadows a `export *` of the same name), and skips any importer that lives inside the shim.
 *
 * Build-only on purpose. Under `vite serve` the page is loaded by the native webview, where
 * `hasTauriRuntime()` is true and the shims delegate to real IPC anyway — and by a plain browser
 * with `vite-plugin-tauri-stub` installed, where the stub sets `__TAURI_INTERNALS__`, which the
 * shims would read as a real runtime and quietly use instead of the socket. Keeping the two apart
 * means neither can be mistaken for the other.
 *
 * Known gap: `Channel` still goes through `__TAURI_INTERNALS__.transformCallback`, which has no
 * WebSocket equivalent. Streaming APIs built on it will fail in the browser; request/response ones
 * are fine. Nothing in cockpit uses one today.
 */

import { installRemoteUiGlobals } from './tauri-remote-globals.js'

/**
 * Real module → the shim to take bindings from, and which bindings.
 *
 * The names are listed rather than star-re-exported because two `export *` declarations that both
 * carry an `invoke` make the name ambiguous, and an ambiguous name is not an error at bundle time —
 * it simply stops being exported, and the failure surfaces much later as an undefined import.
 */
const OVERRIDES = {
  '@tauri-apps/api/core': { from: 'tauri-remote-ui/api/core', names: ['invoke'] },
  '@tauri-apps/api/event': { from: 'tauri-remote-ui/api/event', names: ['listen'] },
}

const PREFIX = '\0remote-ui:'

/** Used to spot a relative import that originated inside the Tauri API package itself. */
const API_PKG = '@tauri-apps/api'

export function remoteUiPlugin() {
  // Opt-in per invocation, not per mode: `bun run build` produces the bundle that gets shipped and
  // must never contain an AGPL package or a socket transport, and it runs in the same `build` mode
  // that `dev:remote` does. The env var is what distinguishes them.
  if (!process.env.COCKPIT_REMOTE_UI) return { name: 'cockpit:remote-ui' }

  /** Resolved absolute id of each real module, so the facade can re-export it without recursing. */
  const real = new Map()

  return {
    name: 'cockpit:remote-ui',
    apply: 'build',
    enforce: 'pre',

    // Head-prepended as a classic script so it runs before the entry module, which reads the Tauri
    // globals while it is still evaluating.
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { 'data-remote-ui': 'globals' },
          children: `(${installRemoteUiGlobals.toString()})()`,
          injectTo: 'head-prepend',
        },
      ]
    },

    async resolveId(source, importer) {
      // The shim's own fallback import, and the facade's re-export, must reach the genuine module.
      if (importer && (importer.includes('tauri-remote-ui') || importer.startsWith(PREFIX))) {
        return null
      }
      // Matching the bare specifier is not enough: inside `@tauri-apps/api`, `window.js` imports
      // `invoke` from `./core.js` relatively, so `getCurrentWindow().setFocus()` would keep the
      // untouched `invoke` and reach for `__TAURI_INTERNALS__.invoke`, which does not exist on the
      // remote page. The decision has to be made on the resolved file, not on how it was spelled.
      if (!(source in OVERRIDES) && !(source.startsWith('.') && importer?.includes(API_PKG))) {
        return null
      }
      const resolved = await this.resolve(source, importer, { skipSelf: true })
      // Not installed is not this plugin's problem to report — let the normal resolver say so.
      if (!resolved) return null

      const path = resolved.id.replace(/\\/g, '/')
      const key = Object.keys(OVERRIDES).find((name) => path.endsWith(`${name}.js`))
      if (!key) return null
      real.set(key, resolved.id)
      return `${PREFIX}${key}`
    },

    load(id) {
      if (!id.startsWith(PREFIX)) return null
      const source = id.slice(PREFIX.length)
      const target = real.get(source)
      if (!target) return null
      const { from, names } = OVERRIDES[source]
      // An explicit re-export shadows the same name arriving via `export *`, so the shim wins for
      // `invoke`/`listen` while everything else — `Resource`, `Channel`, `convertFileSrc` — passes
      // through from the genuine module untouched.
      return [
        `export * from ${JSON.stringify(target)}`,
        `export { ${names.join(', ')} } from ${JSON.stringify(from)}`,
      ].join('\n')
    },
  }
}
