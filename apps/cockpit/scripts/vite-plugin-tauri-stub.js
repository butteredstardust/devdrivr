import { installTauriStub } from './tauri-browser-stub.js'

/**
 * Dev-only: inline the `window.__TAURI_INTERNALS__` stub at the top of index.html.
 *
 * Opening http://localhost:1420 in a normal browser used to die on
 * `undefined is not an object (evaluating 'window.__TAURI_INTERNALS__.metadata')`
 * because the stub existed but only scripted harnesses ever installed it. The
 * page has no way to inject it for a human with a browser, so the dev server does.
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
    name: 'cockpit:tauri-browser-stub',
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
