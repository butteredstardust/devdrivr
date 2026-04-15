import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from '@/components/shell/SettingsPanel'
import { useHistoryStore } from '@/stores/history.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useUiStore } from '@/stores/ui.store'
import { DEFAULT_SETTINGS } from '@/types/models'

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
})
