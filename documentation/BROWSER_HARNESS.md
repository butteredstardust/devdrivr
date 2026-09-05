# Browser Harness

Use this harness to validate DOM behavior in Chromium. It runs the web bundle with stubbed Tauri IPC.

> Use [HARNESSES.md](HARNESSES.md) to select a harness.

## When to use it

- Text selection, caret, or clipboard behavior
- Scroll, resize, measured layout, overflow, or focus order
- DOM mutations and render behavior
- README screenshots (see [Regenerate the README screenshots](#regenerate-the-readme-screenshots))

Use [NATIVE_UI_HARNESS.md](NATIVE_UI_HARNESS.md) for windows, menus, drag regions, and edge resize.

Use [REMOTE_UI_HARNESS.md](REMOTE_UI_HARNESS.md) for file I/O, SQLite persistence, or real IPC. Remote UI uses Chromium with real data, but rebuilds take ~40 seconds.

## Prerequisites and setup

Run the Vite dev server before you open Chromium. The server installs the Tauri stub.

```bash
bun run dev   # from . — serves on http://localhost:1420
```

Open `http://localhost:1420` in Chromium. The bundle needs `window.__TAURI_INTERNALS__` before the shell mounts. The dev server injects [`scripts/tauri-browser-stub.js`](../scripts/tauri-browser-stub.js) through [`scripts/vite-plugin-tauri-stub.js`](../scripts/vite-plugin-tauri-stub.js).

`tauri dev` supplies real IPC, so the stub does nothing. Production builds do not include the stub.

Install the stub yourself when a harness does not use the dev server. Add the init script before page code runs.

```js
import { installTauriStub } from './scripts/tauri-browser-stub.js'

await page.addInitScript(installTauriStub) // must precede any page script
await page.goto('http://localhost:1420')
```

WARNING: SQL reads return empty data. Stores are empty. A reload removes test state. Seed state through the UI.

`plugin:http|fetch` uses the page's `fetch`. CORS applies in this harness. Endpoints without `Access-Control-Allow-Origin` fail with an opaque `TypeError`.

File dialogs and `fs` resolve to `null`. The stub logs `[tauri-stub] unhandled command` for unsupported commands. Use Remote UI when that command is required.

## Operating rules

- Wait ~1800ms after a Monaco Split-mode change. The pane can still reflow after the DOM is ready.
- Start a paragraph drag near its top. `y + 12` works better than `y + height/2` for a one-line `<p>`.
- Set and re-read a `Range` before you report a selection failure. A retained range indicates a coordinate problem.
- Use `{ exact: true }` for repeated toolbar button names.
- Filter selectors to visible tools. Inactive tools remain mounted at zero height.
- Use the Monaco API through `page.evaluate`. The visible `textarea` is a read-only IME shim.
- Select Monaco editors by visible pane heading or x-coordinate. Do not select them by index.
- Wait 1–2s after Monaco changes. Lint, compile, and format results are debounced.

Visit each tool once before you measure it. A cold dependency cache can reload the page during Vite optimization.

```
[vite] ✨ new dependencies optimized: prettier/standalone, …
[vite] ✨ optimized dependencies changed. reloading
```

Wait for that reload to finish. Then run the test again. A failure that does not repeat after cache warmup is not an app failure.

## Report observed results

Repeat the interaction before you report it. HMR can return the app to the launcher.

Check whether the desktop window can reach the tested size. The minimum window size is `minWidth: 800` and `minHeight: 500` ([`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json)). State the harness when a condition is unreachable in the app.

Vitest does not validate layout, focus, or fonts. Use `page.evaluate` for measurable facts. For example, report an edge difference of 1.5px instead of visual alignment.

Read the console before you report a crash. Record the exact error, selector, input, and waits. A mounted tool only validates routing. Change a setting and check that the output changes.

Artifacts are stored in the gitignored `.playwright-mcp/` directory.

## Recipe: identify DOM writes

Install both probes in the page. Then repeat the interaction.

Trap `innerHTML` writes and capture the stack:

```js
const proto = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
Object.defineProperty(Element.prototype, 'innerHTML', {
  ...proto,
  set(value) {
    if (this.matches?.('.prose')) {
      console.log('innerHTML write', {
        len: value.length,
        same: value === this.innerHTML, // `true` = a pointless rewrite
        stack: new Error().stack,
      })
    }
    proto.set.call(this, value)
  },
})
```

Watch the subtree and selection:

```js
new MutationObserver((records) => {
  for (const r of records) {
    console.log(r.type, [...r.removedNodes].map((n) => n.nodeName).join('/'))
  }
}).observe(document.querySelector('.prose'), { childList: true, subtree: true })

document.addEventListener('selectionchange', () => {
  const s = window.getSelection()
  console.log(s.isCollapsed ? 'COLLAPSED' : 'range', s.toString().slice(0, 40))
})
```

A `same: true` write followed by `COLLAPSED` indicates a repeated markup write that removes the selection.

## React 19 identity rule

React 19 compares `dangerouslySetInnerHTML` by object identity. An inline `{ __html: html }` value creates an object on every render. React then resets `innerHTML`, even when the markup is unchanged.

Memoize the payload:

```tsx
const htmlProp = useMemo(() => ({ __html: html }), [html])
return <div dangerouslySetInnerHTML={htmlProp} />
```

Use this pattern for `MarkdownPreview`, `NotesDrawer`, `MermaidEditor`, `RegexTester`, and `DiffViewer`. Use it for each new call site.

Validate node identity in Vitest. The selection behavior itself needs Chromium.

```tsx
const paragraph = container.querySelector('p')
rerender(<MarkdownPreview html={html} /* ...changed sibling prop... */ />)
expect(container.querySelector('p')).toBe(paragraph)
```

## Measure theme contrast

Use the CSS classes on `<html>` to measure themes without reload. Apply each class. Read the token colors. Flatten foreground alpha against the surface before you calculate the WCAG ratio.

```js
await page.evaluate(() => {
  const themes = [
    /* ALL_THEMES from src/lib/theme.ts */
  ]
  const html = document.documentElement
  const original = html.className
  const probe = document.body.appendChild(document.createElement('div'))
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/)
    const p = m[1].split(',').map(Number)
    return [p[0], p[1], p[2], p[3] ?? 1]
  }
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]))
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  const get = (n) => {
    probe.style.color = `var(${n})`
    return parse(getComputedStyle(probe).color)
  }
  const out = themes.map((t) => {
    html.className = t
    const fg = get('--color-text-muted')
    const surface = get('--color-surface')
    return { t, onSurface: +ratio(over(fg, surface), surface).toFixed(2) }
  })
  html.className = original
  probe.remove()
  return out.sort((a, b) => a.onSurface - b.onSurface)
})
```

Use `ALL_THEMES` from `src/lib/theme.ts`. A missing class silently uses `:root` and gives invalid results.

## Regenerate the README screenshots

Start the dev server first. The capture script drives this harness and needs the server running.

```bash
bun run dev          # leave running
bun run screenshots  # writes to screenshots/
```

[`scripts/capture-screenshots.mjs`](../scripts/capture-screenshots.mjs) is the fullest worked
example of driving this harness. Read it before you write a new automation against Chromium.
