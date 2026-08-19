import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceEmptyState } from '@/components/shell/WorkspaceEmptyState'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { DEFAULT_SETTINGS } from '@/types/models'
import { formatShortcut } from '@/lib/shortcut-label'

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
}))

beforeEach(() => {
  cleanup()
  useUiStore.setState({ tabs: [], activeTabId: null, activeTool: '', recentToolIds: [] })
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, pinnedToolIds: [] })
  vi.clearAllMocks()
})

describe('WorkspaceEmptyState', () => {
  it('shows the base copy and mod+K hint with no chips when nothing is pinned or recent', () => {
    render(<WorkspaceEmptyState />)
    expect(screen.getByText('Select a tool to get started')).toBeInTheDocument()
    // Asserted through formatShortcut rather than against a literal "⌘K": jsdom's user agent is
    // not a Mac, so the hint correctly says Ctrl+K here, which is the whole point of the change.
    expect(
      screen.getByText(`Use the sidebar or press ${formatShortcut('mod+k')}`)
    ).toBeInTheDocument()
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument()
    expect(screen.queryByText('Recent')).not.toBeInTheDocument()
  })

  it('renders pinned tools as clickable chips', () => {
    useSettingsStore.setState({ pinnedToolIds: ['json-tools'] })
    render(<WorkspaceEmptyState />)
    expect(screen.getByText('Pinned')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open JSON Tools' })).toBeInTheDocument()
  })

  it('renders recently used tools as clickable chips, excluding pinned duplicates', () => {
    useSettingsStore.setState({ pinnedToolIds: ['json-tools'] })
    useUiStore.setState({ recentToolIds: ['json-tools', 'jwt-decoder'] })
    render(<WorkspaceEmptyState />)
    expect(screen.getByText('Recent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open JWT Decoder' })).toBeInTheDocument()
    // json-tools is pinned, so it should only appear once (in the Pinned row)
    expect(screen.getAllByRole('button', { name: 'Open JSON Tools' })).toHaveLength(1)
  })

  it('opens the tool when a chip is clicked', () => {
    useSettingsStore.setState({ pinnedToolIds: ['jwt-decoder'] })
    render(<WorkspaceEmptyState />)
    fireEvent.click(screen.getByRole('button', { name: 'Open JWT Decoder' }))
    expect(useUiStore.getState().activeTool).toBe('jwt-decoder')
    expect(useUiStore.getState().tabs.some((t) => t.toolId === 'jwt-decoder')).toBe(true)
  })
})
