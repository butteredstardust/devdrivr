import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useUiStore } from '@/stores/ui.store'
import { useMruTabSwitcher } from '@/hooks/useMruTabSwitcher'

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
}))

function seedTabs(count: number) {
  const tabs = Array.from({ length: count }, (_, i) => ({
    id: `tab-${i + 1}`,
    toolId: `tool-${i + 1}`,
  }))
  useUiStore.setState({ tabs, activeTabId: tabs[0]?.id ?? null, tabMru: tabs.map((t) => t.id) })
  return tabs
}

/** Ctrl held down for the whole press, as the real gesture has it. */
function ctrlTab(options: { shift?: boolean } = {}) {
  act(() => {
    window.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Tab',
        ctrlKey: true,
        shiftKey: options.shift ?? false,
        bubbles: true,
        cancelable: true,
      })
    )
  })
}

function releaseCtrl() {
  act(() => {
    window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Control', bubbles: true }))
  })
}

const activeId = () => useUiStore.getState().activeTabId

beforeEach(() => {
  cleanup()
  useUiStore.setState({ tabs: [], activeTabId: null, tabMru: [] })
})

describe('useMruTabSwitcher', () => {
  it('flips to the previously used tab', () => {
    seedTabs(3)
    // Worked in tab-3, then came back to tab-1 — MRU top is tab-1, then tab-3.
    useUiStore.setState({ activeTabId: 'tab-1', tabMru: ['tab-1', 'tab-3', 'tab-2'] })
    renderHook(() => useMruTabSwitcher())

    ctrlTab()

    expect(activeId()).toBe('tab-3')
  })

  it('walks further down the stack while Ctrl stays down, instead of ping-ponging', () => {
    seedTabs(3)
    useUiStore.setState({ activeTabId: 'tab-1', tabMru: ['tab-1', 'tab-3', 'tab-2'] })
    renderHook(() => useMruTabSwitcher())

    ctrlTab()
    ctrlTab()

    expect(activeId()).toBe('tab-2')
  })

  it('starts a fresh cycle from the landing tab once Ctrl is released', () => {
    seedTabs(3)
    useUiStore.setState({ activeTabId: 'tab-1', tabMru: ['tab-1', 'tab-3', 'tab-2'] })
    renderHook(() => useMruTabSwitcher())

    ctrlTab()
    releaseCtrl()
    // The store's MRU now has tab-3 on top, so the next cycle flips back.
    ctrlTab()

    expect(activeId()).toBe('tab-1')
  })

  it('walks backwards with Shift', () => {
    seedTabs(3)
    useUiStore.setState({ activeTabId: 'tab-1', tabMru: ['tab-1', 'tab-3', 'tab-2'] })
    renderHook(() => useMruTabSwitcher())

    ctrlTab({ shift: true })

    expect(activeId()).toBe('tab-2')
  })

  it('wraps around the end of the stack', () => {
    seedTabs(2)
    useUiStore.setState({ activeTabId: 'tab-1', tabMru: ['tab-1', 'tab-2'] })
    renderHook(() => useMruTabSwitcher())

    ctrlTab()
    ctrlTab()

    expect(activeId()).toBe('tab-1')
  })

  it('reaches tabs the MRU never recorded, as a restored session has', () => {
    seedTabs(3)
    // Restored sessions only know about the tab that was active.
    useUiStore.setState({ activeTabId: 'tab-1', tabMru: ['tab-1'] })
    renderHook(() => useMruTabSwitcher())

    ctrlTab()
    expect(activeId()).toBe('tab-2')
    ctrlTab()
    expect(activeId()).toBe('tab-3')
  })

  it('leaves plain Tab alone, so focus traversal still works', () => {
    seedTabs(2)
    renderHook(() => useMruTabSwitcher())

    act(() => {
      window.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      )
    })

    expect(activeId()).toBe('tab-1')
  })

  it('does nothing with a single tab, leaving Ctrl+Tab to the browser', () => {
    seedTabs(1)
    renderHook(() => useMruTabSwitcher())
    const event = new window.KeyboardEvent('keydown', {
      key: 'Tab',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })

    act(() => void window.dispatchEvent(event))

    expect(event.defaultPrevented).toBe(false)
    expect(activeId()).toBe('tab-1')
  })

  it('abandons a cycle held across a window blur, which never sees its keyup', () => {
    seedTabs(3)
    useUiStore.setState({ activeTabId: 'tab-1', tabMru: ['tab-1', 'tab-3', 'tab-2'] })
    renderHook(() => useMruTabSwitcher())

    ctrlTab()
    act(() => void window.dispatchEvent(new window.Event('blur')))
    // A stale snapshot would resume at tab-2; a fresh one flips back to tab-1.
    ctrlTab()

    expect(activeId()).toBe('tab-1')
  })

  it('stops listening once unmounted', () => {
    seedTabs(2)
    const { unmount } = renderHook(() => useMruTabSwitcher())

    unmount()
    ctrlTab()

    expect(activeId()).toBe('tab-1')
  })
})
