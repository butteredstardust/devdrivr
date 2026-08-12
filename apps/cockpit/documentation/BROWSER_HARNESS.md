# Browser Harness

How to run the cockpit UI in a plain Chromium page for DOM-level debugging, and the diagnostic
recipes that come with it.

Vitest runs against jsdom/node and cannot reproduce anything involving real layout, real text
selection, or the browser's own commit behaviour. The Tauri app can, but it is a black box —
no DevTools protocol, no scripted input. This harness closes that gap: the same web bundle,
served by `bun run dev`, driven from Chromium.

## When to reach for it

- Text selection, caret, or clipboard behaviour
- Scroll/resize/layout bugs, measured rather than reasoned about
- "It re-renders but I can't see why" — DOM mutation forensics
- Anything you were about to explain with a theory instead of evidence

Not for: file I/O, SQLite persistence, window/menu behaviour, or shortcuts that go through Rust.
Those need the real app.

## Setup

The web bundle refuses to boot outside Tauri — the Tauri JS API reads `window.__TAURI_INTERNALS__`
eagerly and throws `Cannot read properties of undefined (reading 'metadata')` before the shell
mounts. [`scripts/tauri-browser-stub.js`](../scripts/tauri-browser-stub.js) provides the minimum
stub to get past that.

```bash
bun run dev   # from apps/cockpit — serves on http://localhost:1420
```

```js
import { installTauriStub } from './scripts/tauri-browser-stub.js'

await page.addInitScript(installTauriStub) // must precede any page script
await page.goto('http://localhost:1420')
```

Every SQL read returns empty, so stores start blank and nothing persists across a reload. Seed
state through the UI.

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
