import { installTauriStub } from './tauri-browser-stub.js'

/**
 * Dev-only: inline the `window.__TAURI_INTERNALS__` stub at the top of index.html.
 *
 * A normal browser requires this stub before Tauri code reads `window.__TAURI_INTERNALS__.metadata`.
 * The page cannot inject the stub, so the dev server does.
 *
 * The script is injected head-prepend as a classic (non-module, non-deferred)
 * script, so it runs before /src/main.tsx, which reaches for the Tauri API during
 * module evaluation. Under `tauri dev` the real bridge is already installed and
 * `installTauriStub` returns immediately, so the same HTML serves both.
 *
 * Dev only: a production bundle runs inside Tauri, where a stub would mask a real
 * IPC failure as an app that boots and silently persists nothing.
 */
export function tauriStubPlugin() {
  return {
    name: 'devdrivr:tauri-browser-stub',
    apply: 'serve',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { 'data-tauri-stub': 'dev' },
          children: `(${installTauriStub.toString()})()`,
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}
