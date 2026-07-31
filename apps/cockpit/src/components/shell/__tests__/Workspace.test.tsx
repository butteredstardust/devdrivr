import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Workspace } from '@/components/shell/Workspace'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
}))

vi.mock('@/hooks/useFileDropZone', () => ({
  useFileDropZone: () => ({ isDragging: false }),
}))

vi.mock('@/components/shell/WorkspaceTabStrip', () => ({
  WorkspaceTabStrip: () => <div data-testid="workspace-tabs" />,
}))

vi.mock('@/app/tool-registry', () => ({
  getToolById: (id: string) => {
    if (!id) return undefined
    function MockTool() {
      return <div data-testid={`tool-${id}`} />
    }
    return {
      id,
      name: id,
      icon: '•',
      description: '',
      component: MockTool,
    }
  },
  // Mirrors the real registry's derived sets for the two tool ids these tests use.
  MONACO_TOOL_IDS: new Set(['json-tools']),
  OPEN_FILE_TOOL_IDS: new Set(['json-tools']),
  SAVE_FILE_TOOL_IDS: new Set(['json-tools']),
}))

beforeEach(() => {
  cleanup()
  useUiStore.setState({ tabs: [], activeTabId: null, activeTool: '' })
  vi.clearAllMocks()
})

describe('Workspace overflow behavior', () => {
  it('bounds Monaco tools so editor hit testing does not depend on workspace scrolling', () => {
    useUiStore.setState({ activeTool: 'json-tools' })

    render(<Workspace />)

    const host = screen.getByTestId('tool-json-tools').parentElement
    expect(host?.className).toContain('overflow-hidden')
    expect(host?.className).not.toContain('overflow-auto')
  })

  it('keeps a scroll fallback for tools that do not embed Monaco', () => {
    useUiStore.setState({ activeTool: 'hash-generator' })

    render(<Workspace />)

    const host = screen.getByTestId('tool-hash-generator').parentElement
    expect(host?.className).toContain('overflow-auto')
    expect(host?.className).not.toContain('overflow-hidden')
  })
})
