import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesDrawer } from '@/components/shell/NotesDrawer'
import { useHistoryStore } from '@/stores/history.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { DEFAULT_SETTINGS, type Note } from '@/types/models'

const testNote: Note = {
  id: 'note-1',
  title: 'Test note',
  content: 'Use this as input',
  color: 'yellow',
  pinned: false,
  poppedOut: false,
  createdAt: 1,
  updatedAt: 1,
  tags: ['api'],
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, notesDrawerOpen: true, notesDrawerWidth: 320 })
  useNotesStore.setState({
    notes: [testNote],
    initialized: true,
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  })
  useHistoryStore.setState({ entries: [] })
  useUiStore.setState({ lastAction: null, pendingSendTo: null })
})

afterEach(cleanup)

describe('NotesDrawer', () => {
  it('labels compact note actions for assistive technology', () => {
    render(<NotesDrawer />)

    expect(screen.getByRole('button', { name: 'Copy Test note content' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use Test note as input' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pin Test note' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Test note' })).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Resize notes drawer' })).toHaveAttribute(
      'aria-orientation',
      'vertical'
    )
  })

  it('uses labelled, larger color swatches while editing', () => {
    render(<NotesDrawer />)

    fireEvent.click(screen.getByText('Test note'))

    const yellow = screen.getByRole('button', { name: 'Set note color to yellow' })
    const blue = screen.getByRole('button', { name: 'Set note color to blue' })

    expect(yellow).toHaveAttribute('aria-pressed', 'true')
    expect(blue).toHaveAttribute('aria-pressed', 'false')
    expect(yellow.className).toContain('min-h-6')
    expect(yellow.className).toContain('min-w-6')
  })
})
