# Browser Harness

How to run the cockpit UI in a plain Chromium page for DOM-level debugging, and the diagnostic
recipes that come with it.

> One of four harnesses — see [HARNESSES.md](HARNESSES.md) for which to use when.

Vitest runs against jsdom/node and cannot reproduce anything involving real layout, real text
selection, or the browser's own commit behaviour. The Tauri app can, but it is a black box —
no DevTools protocol, no scripted input. This harness closes that gap: the same web bundle,
served by `bun run dev`, driven from Chromium.

## When to reach for it

- Text selection, caret, or clipboard behaviour
- Scroll/resize/layout bugs, measured rather than reasoned about
- "It re-renders but I can't see why" — DOM mutation forensics
- Anything you were about to explain with a theory instead of evidence

Not for: window or menu behaviour — that is [NATIVE_UI_HARNESS.md](NATIVE_UI_HARNESS.md).

Not for file I/O or SQLite persistence either, but that no longer means "go run the real app and
squint". [REMOTE_UI_HARNESS.md](REMOTE_UI_HARNESS.md) (`bun run dev:remote`) keeps everything below
— Chromium, Playwright, devtools — and swaps the stub for a socket into the live app process, so the
same session reads the real database. Trade-off is a ~40s rebuild instead of HMR, so stay here while
the canned data isn't what's in your way.

## Setup

The web bundle refuses to boot outside Tauri — the Tauri JS API reads `window.__TAURI_INTERNALS__`
eagerly and throws `undefined is not an object (evaluating 'window.__TAURI_INTERNALS__.metadata')`
before the shell mounts. [`scripts/tauri-browser-stub.js`](../scripts/tauri-browser-stub.js)
provides the minimum stub to get past that.

```bash
bun run dev   # from apps/cockpit — serves on http://localhost:1420
```

The dev server installs the stub for you — [`scripts/vite-plugin-tauri-stub.js`](../scripts/vite-plugin-tauri-stub.js)
inlines it at the top of `index.html` on `serve` only, so opening the URL in any browser boots.
Under `tauri dev` the real IPC bridge is already there and the stub no-ops, and production builds
never see it.

A harness that navigates to a bundle the dev server did not serve still installs it itself:

```js
import { installTauriStub } from './scripts/tauri-browser-stub.js'

await page.addInitScript(installTauriStub) // must precede any page script
await page.goto('http://localhost:1420')
```

Every SQL read returns empty, so stores start blank and nothing persists across a reload. Seed
state through the UI.

Commands with no browser equivalent — file dialogs, `fs`, `http` — resolve to `null` and log a
`[tauri-stub] unhandled command` warning. Two of those on boot (`plugin:http|fetch*`, the update
check) are expected. A warning naming a command your feature depends on means you are testing a
stub, not the app — switch to [REMOTE_UI_HARNESS.md](REMOTE_UI_HARNESS.md), which answers those
commands for real without giving up the browser.

## Gotchas found the hard way

- **Monaco needs time to settle.** Switching a tool into Split mode reflows the pane for a while
  after the DOM looks ready. Measuring immediately produced a false "still broken" reading;
  ~1800ms of settle time made Split, Preview, and back-to-Split all behave identically.
- **Aim drags near the top of a paragraph's box, not its vertical centre.** `prose` line-height and
  margins make a one-line `<p>` report a box roughly twice the height of its text, so `y + height/2`
  lands in empty space below the line and selects nothing — which reads exactly like "the selection
  bug is back". `y + 12` works. Cross-check with `page.mouse.dblclick`, which is less sensitive to
  this (though a double-click on container padding selects `"\n"` and looks like its own failure).
- **Confirm the DOM can hold a selection at all** before believing a negative result: set a `Range`
  programmatically and re-read it after a delay. If that holds but your synthetic input doesn't, the
  bug is in your coordinates, not in the app.
- **Toolbar buttons collide by name.** `getByRole('button', { name: 'Templates' })` matched three
  elements; pass `{ exact: true }`.
- **Tools you have visited stay mounted.** Switching tools does not unmount the previous one; it
  collapses to zero height. So `document.querySelector('.monaco-editor')` can return a hidden
  editor from two tools ago and report `height: 0`, and a locator can fail strict mode against a
  toolbar the user cannot see. Filter to what is on screen:
  `[...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().height > 0)`.
- **Monaco has no editable `<textarea>` to type into.** This build uses an edit context; the only
  `textarea` in the page is a read-only IME shim, so `fill()` times out with "element is not
  editable". Drive the content through the API instead — `window.monaco.editor.getModels()` and
  `.getEditors()` are both reachable from `page.evaluate`, and `setValue` fires the same change
  event the tool listens to. Pick the editor by visibility, not by index.
- **Results are debounced.** Lint, compile and format land ~1–2s after the model changes. Reading
  the output straight after `setValue` reports the previous run, which reads exactly like "the
  setting had no effect".

## Driving the app as an agent

The harness rewards evidence and punishes assumption, so the failure mode to guard against is
reporting something you inferred rather than saw.

- **Reproduce before reporting.** Do the interaction twice. An HMR reload can drop the app back to
  the launcher, and a selector that "does not match any elements" then means the page moved on, not
  that the control is missing.
- **Ask whether the user can reach it.** The window is created with `minWidth: 800` /
  `minHeight: 500` ([`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json)); a defect that only
  appears at 250px tall is real for the browser and remote-ui paths but unreachable in the desktop
  app, and the report should say which.
- **A green Vitest run is not evidence about layout, focus or fonts.** jsdom implements none of
  them. It will happily report a `visibility: hidden` element as focused — that exact gap hid a
  dead keyboard path in `Popover` behind a passing assertion.
- **Prefer one `page.evaluate` that returns a fact over a screenshot you interpret.** "Right edges
  align to within 1.5px" is checkable; "looks aligned" is not.
- Artifacts land in the gitignored `.playwright-mcp/`, so nothing you capture reaches a commit.

## Recipe: who is rewriting my DOM?

This pair is what identified the React 19 `dangerouslySetInnerHTML` bug (see below). Run both in the
page, then reproduce the interaction.

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

Watch the subtree and correlate with selection loss:

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

A `same: true` write immediately followed by `COLLAPSED` means something is re-setting identical
markup and taking the selection with it.

## The React 19 identity rule

React 19's `updateProperties` compares `dangerouslySetInnerHTML` by **object identity**, not by the
`__html` string inside it — React 18 compared the string. An inline `{ __html: html }` literal is a
fresh object every render, so React re-sets `innerHTML` every render, rebuilding the whole subtree
even when the markup is byte-identical. That destroys any text selection inside it.

Always memoise the payload:

```tsx
const htmlProp = useMemo(() => ({ __html: html }), [html])
return <div dangerouslySetInnerHTML={htmlProp} />
```

All five call sites in the app follow this pattern: `MarkdownPreview`, `NotesDrawer`,
`MermaidEditor`, `RegexTester`, `DiffViewer`. Keep it that way when adding a sixth.

The identity rule can be asserted in Vitest even though the selection bug itself cannot — re-render
with the same `html` and check the DOM node is the same object:

```tsx
const paragraph = container.querySelector('p')
rerender(<MarkdownPreview html={html} /* ...changed sibling prop... */ />)
expect(container.querySelector('p')).toBe(paragraph)
```

## Measuring token contrast across every theme

The themes are CSS classes on `<html>`, so all 22 can be measured in one pass without reloading:
apply each class, read the computed value of the tokens off a probe element, then flatten the
foreground's alpha against the backdrop before computing the WCAG ratio. Skipping that flatten step
is the easy mistake — most `--color-text-muted` tokens carry `α0.6`, and comparing the raw `rgba`
against the surface reports a contrast the user never sees.

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

Take the theme list from `ALL_THEMES` in `src/lib/theme.ts` rather than typing it out — a name that
doesn't match a real class silently falls back to `:root`, and the run reports the default theme's
numbers under 20 different labels instead of failing.
