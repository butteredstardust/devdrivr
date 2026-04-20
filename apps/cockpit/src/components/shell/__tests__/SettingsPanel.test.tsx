import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from '@/components/shell/SettingsPanel'
import { useHistoryStore } from '@/stores/history.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { DEFAULT_MCP_PERMISSIONS, useMcpStore } from '@/stores/mcp.store'
import { useUiStore } from '@/stores/ui.store'
import { DEFAULT_SETTINGS } from '@/types/models'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({
    running: true,
    host: '127.0.0.1',
    port: 17347,
    url: 'http://127.0.0.1:17347/mcp',
    lastError: null,
  }),
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('0.1.0'),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: true })
  useNotesStore.setState({
    notes: [
      {
        id: 'note-1',
        title: 'Test note',
        content: '',
        color: 'yellow',
        pinned: false,
        poppedOut: false,
        createdAt: 1,
        updatedAt: 1,
        tags: [],
        sortOrder: 1024,
      },
    ],
    clearAll: vi.fn().mockResolvedValue(undefined),
  })
  useSnippetsStore.setState({ snippets: [], clearAll: vi.fn().mockResolvedValue(undefined) })
  useHistoryStore.setState({ entries: [], clearAll: vi.fn().mockResolvedValue(undefined) })
  useUiStore.setState({
    settingsPanelOpen: true,
    addToast: vi.fn(),
  })
  useMcpStore.setState({
    initialized: true,
    pending: false,
    settings: {
      enabled: true,
      host: '127.0.0.1',
      port: 17347,
      apiKey: 'test-key',
      permissions: DEFAULT_MCP_PERMISSIONS,
      apiRequestsExposeSecrets: false,
    },
    status: {
      running: true,
      host: '127.0.0.1',
      port: 17347,
      url: 'http://127.0.0.1:17347/mcp',
      lastError: null,
    },
    refreshStatus: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn().mockResolvedValue(undefined),
  })
})

afterEach(cleanup)

describe('SettingsPanel', () => {
  it('uses dialog semantics and reports destructive action success', async () => {
    const clearNotes = useNotesStore.getState().clearAll
    const addToast = useUiStore.getState().addToast

    render(<SettingsPanel />)

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear Notes (1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm clear?' }))

    await waitFor(() => expect(clearNotes).toHaveBeenCalledTimes(1))
    expect(addToast).toHaveBeenCalledWith('Notes cleared', 'success')
  })

  it('rejects invalid MCP port input with feedback', async () => {
    const addToast = useUiStore.getState().addToast
    const updateSettings = useMcpStore.getState().updateSettings

    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'MCP' }))
    const portInput = screen.getByRole('spinbutton')
    fireEvent.change(portInput, { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(addToast).toHaveBeenCalledWith(
      'MCP port must be a number between 1024 and 65535',
      'error'
    )
    expect(updateSettings).not.toHaveBeenCalled()

    fireEvent.change(portInput, { target: { value: '70000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(addToast).toHaveBeenCalledWith('MCP port must be between 1024 and 65535', 'error')
    expect(updateSettings).not.toHaveBeenCalled()
  })
})
