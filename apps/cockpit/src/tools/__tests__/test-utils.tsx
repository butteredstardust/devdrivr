import { render, cleanup } from '@testing-library/react'
import { useToolStateCache } from '@/stores/tool-state.store'
import { afterEach } from 'vitest'
import type { ComponentType } from 'react'

// Match existing test convention: cleanup between tests
afterEach(cleanup)

export function renderTool(Component: ComponentType) {
  useToolStateCache.setState({ cache: new Map() })
  return render(<Component />)
}
