import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExternalLinks } from '@/hooks/useExternalLinks'

const openUrl = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }))

function clickAnchor(
  html: string,
  init: MouseEventInit = {},
  onContainerClick?: (event: MouseEvent) => void
) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  if (onContainerClick) container.addEventListener('click', onContainerClick)
  const anchor = container.querySelector('a')!
  const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, ...init })
  anchor.dispatchEvent(event)
  container.remove()
  return event
}

describe('useExternalLinks', () => {
  beforeEach(() => {
    openUrl.mockClear()
    renderHook(() => useExternalLinks())
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens an external link in the browser instead of navigating the webview', () => {
    const event = clickAnchor('<a href="https://example.com/docs">docs</a>')
    expect(event.defaultPrevented).toBe(true)
    expect(openUrl).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('opens mailto links through the OS', () => {
    clickAnchor('<a href="mailto:someone@example.com">mail</a>')
    expect(openUrl).toHaveBeenCalledWith('mailto:someone@example.com')
  })

  it('leaves in-page anchors to scroll the document', () => {
    const event = clickAnchor('<a href="#section">jump</a>')
    expect(event.defaultPrevented).toBe(false)
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('blocks same-origin navigation without opening anything', () => {
    const event = clickAnchor('<a href="/index.html">self</a>')
    expect(event.defaultPrevented).toBe(true)
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('ignores schemes the OS should not be handed', () => {
    const event = clickAnchor('<a href="file:///etc/passwd">file</a>')
    expect(event.defaultPrevented).toBe(false)
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('defers to a surface that already claimed the click', () => {
    // The Markdown preview prevents default to start editing a block containing a link; opening
    // the browser as well would yank the app out from under that edit.
    const event = clickAnchor('<a href="https://example.com">link</a>', {}, (e) =>
      e.preventDefault()
    )
    expect(event.defaultPrevented).toBe(true)
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('ignores non-primary buttons', () => {
    clickAnchor('<a href="https://example.com">link</a>', { button: 1 })
    expect(openUrl).not.toHaveBeenCalled()
  })
})
