import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  sortOrder: 1024,
}

const secondNote: Note = {
  ...testNote,
  id: 'note-2',
  title: 'Second note',
  content: 'Second content',
  tags: [],
  sortOrder: 2048,
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, notesDrawerOpen: true, notesDrawerWidth: 320 })
  useNotesStore.setState({
    notes: [testNote],
    initialized: true,
    update: vi.fn().mockResolvedValue(undefined),
    reorder: vi.fn().mockResolvedValue(undefined),
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
    expect(screen.getByRole('button', { name: 'Move Test note up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move Test note down' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drag Test note to reorder' })).toBeInTheDocument()
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

  it('shows search result counts and clears search input', async () => {
    useNotesStore.setState({ notes: [testNote, secondNote] })
    render(<NotesDrawer />)

    fireEvent.change(screen.getByPlaceholderText('Search notes...'), {
      target: { value: 'Second' },
    })

    await waitFor(() => expect(screen.getByText('1 of 2 notes')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Clear notes search' }))
    expect(screen.getByPlaceholderText('Search notes...')).toHaveValue('')
  })

  it('calls reorder when a note is dropped onto another note', () => {
    const reorder = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({ notes: [testNote, secondNote], reorder })
    render(<NotesDrawer />)

    const data = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
      getData: vi.fn((type: string) => data.get(type) ?? ''),
    }
    const secondCard = screen.getByTestId('note-card-note-2')
    const firstDragHandle = screen.getByRole('button', { name: 'Drag Test note to reorder' })
    Object.defineProperty(secondCard, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    })

    fireEvent.dragStart(firstDragHandle, { dataTransfer })
    fireEvent.dragOver(secondCard, { dataTransfer, clientY: 80 })
    fireEvent.drop(secondCard, { dataTransfer })

    expect(reorder).toHaveBeenCalledWith('note-1', 'note-2', 'after')
  })

  it('supports keyboard-accessible move controls', () => {
    const reorder = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({ notes: [testNote, secondNote], reorder })
    render(<NotesDrawer />)

    fireEvent.click(screen.getByRole('button', { name: 'Move Test note down' }))

    expect(reorder).toHaveBeenCalledWith('note-1', 'note-2', 'after')
    expect(screen.getByRole('button', { name: 'Move Test note up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Second note down' })).toBeDisabled()
  })
})
