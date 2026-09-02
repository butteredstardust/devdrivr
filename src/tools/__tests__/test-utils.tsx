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
