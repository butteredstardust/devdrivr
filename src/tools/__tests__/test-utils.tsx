import { render, cleanup } from '@testing-library/react'
import { useToolStateCache } from '@/stores/tool-state.store'
import { afterEach, beforeEach } from 'vitest'
import type { ComponentType } from 'react'

// Match existing test convention: cleanup between tests
afterEach(cleanup)

// Initialize stores before each test
beforeEach(() => {
  // Ensure the store is properly initialized
  if (useToolStateCache.getState()) {
    useToolStateCache.setState({ cache: new Map() })
  }
})

export function renderTool(Component: ComponentType) {
  // Only set state if the store is available and has the method
  if (useToolStateCache.setState) {
    useToolStateCache.setState({ cache: new Map() })
  }
  return render(<Component />)
}

/** Give toolbars deterministic widths before render because jsdom has no layout engine. */
export function installNarrowToolbarLayout(toolbarWidth = 260) {
  const originalRect = Element.prototype.getBoundingClientRect
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  const originalResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'toolbar' ? toolbarWidth : 0
    },
  })
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const width = this.hasAttribute('data-toolbar-group') ? 140 : 80
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0 } as DOMRect
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: undefined,
  })

  return () => {
    Element.prototype.getBoundingClientRect = originalRect
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
    }
    if (originalResizeObserver) {
      Object.defineProperty(globalThis, 'ResizeObserver', originalResizeObserver)
    } else {
      Reflect.deleteProperty(globalThis, 'ResizeObserver')
    }
  }
}
