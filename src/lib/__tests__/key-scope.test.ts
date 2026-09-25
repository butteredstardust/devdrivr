import { afterEach, describe, expect, it } from 'vitest'
import { isKeyEventForTool } from '@/lib/key-scope'

function keydownFrom(target: EventTarget): KeyboardEvent {
  let received: KeyboardEvent | null = null
  const capture = (event: Event) => {
    received = event as KeyboardEvent
  }
  window.addEventListener('keydown', capture)
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))
  window.removeEventListener('keydown', capture)
  if (!received) throw new Error('keydown did not reach window')
  return received
}

function mount(html: string): void {
  document.body.innerHTML = html
}

function byId(id: string): Element {
  const element = document.getElementById(id)
  if (!element) throw new Error(`missing #${id}`)
  return element
}

describe('isKeyEventForTool', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('accepts keys from inside the tool, including its own inputs', () => {
    mount('<div id="tool"><input id="search" /><textarea id="editor"></textarea></div>')
    const root = byId('tool')
    expect(isKeyEventForTool(keydownFrom(byId('search')), root)).toBe(true)
    expect(isKeyEventForTool(keydownFrom(byId('editor')), root)).toBe(true)
  })

  it('accepts keys when nothing has focus', () => {
    mount('<div id="tool"></div>')
    expect(isKeyEventForTool(keydownFrom(document.body), byId('tool'))).toBe(true)
  })

  it('accepts keys from neutral shell chrome, such as a focused sidebar button', () => {
    mount('<nav><button id="sidebar-item">Snippets</button></nav><div id="tool"></div>')
    expect(isKeyEventForTool(keydownFrom(byId('sidebar-item')), byId('tool'))).toBe(true)
  })

  it('rejects keys typed into an editor outside the tool', () => {
    mount(
      `<div id="tool"></div>
       <aside data-key-scope="notes-drawer"><textarea id="note"></textarea></aside>
       <input id="other-input" />
       <div id="monaco-edit-context" role="textbox" tabindex="0"></div>`
    )
    const root = byId('tool')
    expect(isKeyEventForTool(keydownFrom(byId('note')), root)).toBe(false)
    expect(isKeyEventForTool(keydownFrom(byId('other-input')), root)).toBe(false)
    expect(isKeyEventForTool(keydownFrom(byId('monaco-edit-context')), root)).toBe(false)
  })

  it('rejects keys from anywhere in a key scope, not only its editors', () => {
    mount(
      `<div id="tool"></div>
       <aside data-key-scope="notes-drawer"><button id="note-card">Note</button></aside>`
    )
    expect(isKeyEventForTool(keydownFrom(byId('note-card')), byId('tool'))).toBe(false)
  })

  it('rejects keys from a dialog outside the tool', () => {
    mount('<div id="tool"></div><div role="dialog"><button id="confirm">OK</button></div>')
    expect(isKeyEventForTool(keydownFrom(byId('confirm')), byId('tool'))).toBe(false)
  })

  it('checks only the target when the tool root is not mounted', () => {
    mount('<button id="plain">Plain</button><input id="field" />')
    expect(isKeyEventForTool(keydownFrom(byId('plain')), null)).toBe(true)
    expect(isKeyEventForTool(keydownFrom(byId('field')), null)).toBe(false)
  })
})
