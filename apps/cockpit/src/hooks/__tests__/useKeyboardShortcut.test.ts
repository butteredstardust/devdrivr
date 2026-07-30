import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'

vi.mock('@/lib/platform', () => ({
  detectPlatform: () => 'mac' as const,
}))

function dispatchKey(target: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new window.KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

const EDITABLE_TARGETS: Array<[string, () => HTMLElement]> = [
  ['input', () => document.createElement('input')],
  ['textarea', () => document.createElement('textarea')],
  [
    'contenteditable descendant',
    () => {
      const editable = document.createElement('div')
      editable.setAttribute('contenteditable', 'true')
      const element = document.createElement('span')
      editable.append(element)
      document.body.append(editable)
      return element
    },
  ],
  [
    'Monaco editor',
    () => {
      const editor = document.createElement('div')
      editor.className = 'monaco-editor'
      const element = document.createElement('div')
      editor.append(element)
      document.body.append(editor)
      return element
    },
  ],
]

describe('useKeyboardShortcut', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('runs matching modifier shortcuts and prevents their browser default', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcut({ key: 'k', mod: true }, handler))

    const event = dispatchKey(document.body, { key: 'k', metaKey: true })

    expect(handler).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it.each(EDITABLE_TARGETS)(
    'allows modifier shortcuts from an editable %s target',
    (_name, createTarget) => {
      const handler = vi.fn()
      renderHook(() => useKeyboardShortcut({ key: 's', mod: true }, handler))
      const target = createTarget()
      if (!target.isConnected) document.body.append(target)

      dispatchKey(target, { key: 's', metaKey: true })

      expect(handler).toHaveBeenCalledOnce()
    }
  )

  it.each(EDITABLE_TARGETS)(
    'ignores non-modifier shortcuts from an editable %s target',
    (_name, createTarget) => {
      const handler = vi.fn()
      renderHook(() => useKeyboardShortcut({ key: 'Escape' }, handler))
      const target = createTarget()
      if (!target.isConnected) document.body.append(target)

      dispatchKey(target, { key: 'Escape' })
      dispatchKey(document.body, { key: 'Escape' })

      expect(handler).toHaveBeenCalledOnce()
    }
  )

  it('handles a direct contenteditable target', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcut({ key: 'Escape' }, handler))
    const target = document.createElement('div')
    target.setAttribute('contenteditable', 'true')
    document.body.append(target)

    dispatchKey(target, { key: 'Escape' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('removes its listener on unmount so repeated mounts do not duplicate dispatch', () => {
    const firstHandler = vi.fn()
    const first = renderHook(() => useKeyboardShortcut({ key: 'k', mod: true }, firstHandler))
    first.unmount()

    const secondHandler = vi.fn()
    renderHook(() => useKeyboardShortcut({ key: 'k', mod: true }, secondHandler))

    act(() => {
      dispatchKey(document.body, { key: 'k', metaKey: true })
    })

    expect(firstHandler).not.toHaveBeenCalled()
    expect(secondHandler).toHaveBeenCalledOnce()
  })
})
