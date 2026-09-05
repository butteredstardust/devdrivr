import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import NotesWorkspace from '@/tools/notes/NotesWorkspace'
import { useNotesStore } from '@/stores/notes.store'
import { useUiStore } from '@/stores/ui.store'
import { useFoldersStore } from '@/stores/folders.store'
import { dispatchToolAction } from '@/lib/tool-actions'
import type { Note } from '@/types/models'

const note: Note = {
  id: 'note-1',
  title: 'Release plan',
  content:
    '# Ship it\n\n| Step | Owner |\n| --- | --- |\n| Test | Ada |\n\n- [ ] Verify\n\n```ts\nconst ready = true\n```',
  color: 'yellow',
  pinned: false,
  poppedOut: false,
  tags: ['release'],
  createdAt: 1,
  updatedAt: 1,
  sortOrder: 1024,
  folderId: 'notes-inbox',
}

const realActions = {
  add: useNotesStore.getState().add,
  edit: useNotesStore.getState().edit,
  update: useNotesStore.getState().update,
  flushPending: useNotesStore.getState().flushPending,
  remove: useNotesStore.getState().remove,
}

function arrangeNotes() {
  const edit = vi.fn((id: string, patch: Partial<Pick<Note, 'title' | 'content'>>) => {
    useNotesStore.setState((state) => ({
      notes: state.notes.map((existing) =>
        existing.id === id ? { ...existing, ...patch, updatedAt: existing.updatedAt + 1 } : existing
      ),
      pendingSaveIds: [id],
    }))
  })
  const flushPending = vi.fn().mockImplementation(async () => {
    useNotesStore.setState({ pendingSaveIds: [] })
  })
  useNotesStore.setState({
    notes: [note],
    initialized: true,
    pendingSaveIds: [],
    saveErrorIds: [],
    edit,
    flushPending,
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  })
  return { edit, flushPending }
}

beforeEach(() => {
  vi.clearAllMocks()
  arrangeNotes()
  useUiStore.setState({ lastAction: null, dirtyTabIds: [] })
  useFoldersStore.setState({
    folders: [
      {
        id: 'notes-inbox',
        name: 'Inbox',
        parentId: null,
        kind: 'notes',
        sortOrder: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    initialized: true,
    create: vi.fn(),
    update: vi.fn(),
    move: vi.fn(),
  })
})

describe('Notes workspace', () => {
  it('opens a searchable note library with all three editor modes', async () => {
    render(<NotesWorkspace />)

    await waitFor(() => expect(screen.getByLabelText('Note title')).toHaveValue('Release plan'))
    expect(screen.getByRole('listbox', { name: 'Notes' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search notes' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Split' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Preview' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes' }), {
      target: { value: 'missing' },
    })
    expect(screen.getByText('No matching notes')).toBeInTheDocument()
  })

  it('uses the notes store as the canonical title and body draft', async () => {
    const { edit } = arrangeNotes()
    render(<NotesWorkspace />)
    await waitFor(() => expect(screen.getByLabelText('Note title')).toHaveValue('Release plan'))

    fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Launch plan' } })
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: '# Ready' } })

    expect(edit).toHaveBeenCalledWith('note-1', { title: 'Launch plan' })
    expect(edit).toHaveBeenCalledWith('note-1', { content: '# Ready' })
    expect(useNotesStore.getState().notes[0]).toMatchObject({
      title: 'Launch plan',
      content: '# Ready',
    })
    expect(screen.getByText('Saving…')).toBeInTheDocument()
  })

  it('renders GFM content, toggles task lists, and copies fenced code', async () => {
    const { edit } = arrangeNotes()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<NotesWorkspace />)

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(edit).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({ content: expect.stringContaining('- [x] Verify') })
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Copy code block' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('const ready = true\n'))
  })

  it('keeps task checkboxes read-only in Preview mode', async () => {
    const { edit } = arrangeNotes()
    render(<NotesWorkspace />)

    fireEvent.click(screen.getByRole('radio', { name: 'Preview' }))
    const checkbox = await screen.findByRole('checkbox')
    expect(checkbox).toBeDisabled()
    edit.mockClear()
    fireEvent.click(checkbox)

    expect(edit).not.toHaveBeenCalled()
    expect(useNotesStore.getState().notes[0]!.content).toContain('- [ ] Verify')
  })

  it('supports keyboard creation and explicit save', async () => {
    const created = { ...note, id: 'note-2', title: 'Untitled note', content: '' }
    const add = vi.fn().mockResolvedValue(created)
    const flushPending = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({ add, flushPending })
    render(<NotesWorkspace />)

    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith('Untitled note', '', 'yellow', 'notes-inbox')
    )

    dispatchToolAction({ type: 'save-file' })
    await waitFor(() => expect(flushPending).toHaveBeenCalled())
  })

  it('keeps editor and preview available in the narrow stacked layout', async () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia

    try {
      render(<NotesWorkspace />)
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Ship it' })).toBeInTheDocument()
      )
      expect(
        screen.queryByRole('separator', { name: 'Resize note editor and preview' })
      ).not.toBeInTheDocument()
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })
})

afterEach(() => {
  useNotesStore.setState(realActions)
})
