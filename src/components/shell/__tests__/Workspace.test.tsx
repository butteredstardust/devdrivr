import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Workspace } from '@/components/shell/Workspace'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
}))

const useFileDropZone = vi.fn(() => ({ isDragging: false }))
vi.mock('@/hooks/useFileDropZone', () => ({
  useFileDropZone: (...args: unknown[]) => useFileDropZone(...(args as [])),
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
      // The image tool and Notes run their own native drop listener.
      ownsFileDrop: id === 'image-tool' || id === 'notes',
    }
  },
  // Mirrors the real registry's derived sets for the two tool ids these tests use.
  MONACO_TOOL_IDS: new Set(['json-tools']),
  OPEN_FILE_TOOL_IDS: new Set(['json-tools']),
  SAVE_FILE_TOOL_IDS: new Set(['json-tools']),
}))

beforeEach(() => {
  cleanup()
  useUiStore.setState({ tabs: [], activeTabId: null, activeTool: '', tabMru: [] })
  vi.clearAllMocks()
})

/** Opens `toolIds` as tabs, with the last one active. */
function openTabs(...toolIds: string[]) {
  const tabs = toolIds.map((toolId, i) => ({
    id: `tab-${i}`,
    toolId,
    stateKey: toolId,
  }))
  const active = tabs[tabs.length - 1]?.id ?? null
  useUiStore.setState({
    tabs,
    activeTabId: active,
    activeTool: toolIds[toolIds.length - 1] ?? '',
    tabMru: [...tabs].reverse().map((t) => t.id),
  })
  return tabs
}

describe('Workspace overflow behavior', () => {
  it('bounds Monaco tools so editor hit testing does not depend on workspace scrolling', () => {
    openTabs('json-tools')

    render(<Workspace />)

    const host = screen.getByTestId('tool-json-tools').parentElement
    expect(host?.className).toContain('overflow-hidden')
    expect(host?.className).not.toContain('overflow-auto')
  })

  it('keeps a scroll fallback for tools that do not embed Monaco', () => {
    openTabs('hash-generator')

    render(<Workspace />)

    const host = screen.getByTestId('tool-hash-generator').parentElement
    expect(host?.className).toContain('overflow-auto')
    expect(host?.className).not.toContain('overflow-hidden')
  })
})

describe('file drop ownership', () => {
  // A tool that owns its drop reads binary data through its own Tauri listener.
  // The shell listener only reads text, so it must not claim the drop and must
  // not answer with "File drop is not supported by the active tool".
  it('leaves the drop to a tool that owns it', () => {
    openTabs('image-tool')

    render(<Workspace />)

    expect(useFileDropZone).not.toHaveBeenCalled()
  })

  it('keeps the shell listener for every other tool', () => {
    openTabs('json-tools')

    render(<Workspace />)

    expect(useFileDropZone).toHaveBeenCalled()
  })
})

describe('keep-alive', () => {
  it('leaves a backgrounded tool mounted so its work survives the switch', () => {
    const tabs = openTabs('json-tools', 'base64')

    render(<Workspace />)

    // Both trees exist; only the active one is displayed.
    expect(screen.getByTestId('tool-json-tools')).toBeInTheDocument()
    expect(screen.getByTestId('tool-base64')).toBeInTheDocument()
    expect(screen.getByTestId('tool-json-tools').parentElement?.className).toBe('hidden')
    expect(screen.getByTestId('tool-base64').parentElement?.className).not.toBe('hidden')
    expect(tabs).toHaveLength(2)
  })

  it('tears down the least recently used tab once the limit is passed', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    useUiStore.setState({
      tabs: ids.map((id) => ({ id, toolId: id, stateKey: id })),
      activeTabId: 'e',
      activeTool: 'e',
      // Most recent first: e is active, a has gone longest without a visit.
      tabMru: ['e', 'd', 'c', 'b', 'a'],
    })

    render(<Workspace />)

    for (const id of ['e', 'd', 'c', 'b']) {
      expect(screen.getByTestId(`tool-${id}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('tool-a')).not.toBeInTheDocument()
  })

  it('mounts the active tab even when the recency list has not caught up', () => {
    useUiStore.setState({
      tabs: [
        { id: 'x', toolId: 'x', stateKey: 'x' },
        { id: 'y', toolId: 'y', stateKey: 'y' },
      ],
      activeTabId: 'y',
      activeTool: 'y',
      tabMru: ['x'],
    })

    render(<Workspace />)

    expect(screen.getByTestId('tool-y')).toBeInTheDocument()
  })

  it('shows the empty state when the active tab points at a tool that is gone', () => {
    useUiStore.setState({
      tabs: [{ id: 'ghost', toolId: '', stateKey: '' }],
      activeTabId: 'ghost',
      activeTool: '',
      tabMru: ['ghost'],
    })

    render(<Workspace />)

    expect(screen.getByText('Select a tool to get started')).toBeInTheDocument()
  })
})
