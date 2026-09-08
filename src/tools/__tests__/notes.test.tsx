import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import NotesWorkspace from '@/tools/notes/NotesWorkspace'
import { useNotesStore } from '@/stores/notes.store'
import { useUiStore } from '@/stores/ui.store'
import { useFoldersStore } from '@/stores/folders.store'
import { dispatchToolAction } from '@/lib/tool-actions'
import type { Note } from '@/types/models'
import { localDateKey } from '@/tools/notes/task-model'
import { useToolStateCache } from '@/stores/tool-state.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useApiStore } from '@/stores/api.store'

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
  updateTask: useNotesStore.getState().updateTask,
  flushPending: useNotesStore.getState().flushPending,
  remove: useNotesStore.getState().remove,
  trashCompleted: useNotesStore.getState().trashCompleted,
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
  const updateTask = vi
    .fn()
    .mockImplementation(async (id: string, patch: Record<string, unknown>) => {
      useNotesStore.setState((state) => ({
        notes: state.notes.map((existing) => {
          if (existing.id !== id) return existing
          if (patch.status === null) {
            const plain = { ...existing }
            delete plain.taskStatus
            delete plain.taskPriority
            delete plain.taskDueDate
            return plain
          }
          return {
            ...existing,
            ...(patch.status !== undefined ? { taskStatus: patch.status } : {}),
            ...(patch.priority !== undefined ? { taskPriority: patch.priority } : {}),
            ...(patch.dueDate !== undefined ? { taskDueDate: patch.dueDate } : {}),
          } as Note
        }),
      }))
    })
  useNotesStore.setState({
    notes: [note],
    trashedNotes: [],
    initialized: true,
    pendingSaveIds: [],
    saveErrorIds: [],
    edit,
    flushPending,
    update: vi.fn().mockResolvedValue(undefined),
    updateTask,
    remove: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    permanentlyDelete: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    trashCompleted: vi.fn().mockResolvedValue(undefined),
  })
  return { edit, flushPending, updateTask }
}

beforeEach(() => {
  vi.clearAllMocks()
  useToolStateCache.setState({ cache: new Map(), seeds: new Map(), discarded: new Set() })
  useUiStore
    .getState()
    .restoreTabs([{ id: 'notes-tab', toolId: 'notes', stateKey: 'notes' }], 'notes-tab')
  useSnippetsStore.setState({ snippets: [], trashedSnippets: [], initialized: true })
  useApiStore.setState({
    initialized: true,
    requests: [],
    trashedRequests: [],
    collections: [],
  })
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
    trashedFolders: [],
    initialized: true,
    create: vi.fn(),
    update: vi.fn(),
    move: vi.fn(),
    trash: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    permanentlyDelete: vi.fn().mockResolvedValue(undefined),
    emptyTrash: vi.fn().mockResolvedValue(undefined),
  })
})

describe('Notes workspace', () => {
  it('opens durable Trash and restores a note', async () => {
    const restore = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({
      trashedNotes: [{ ...note, id: 'trashed-note', title: 'Archived note', deletedAt: 2 }],
      restore,
    })
    render(<NotesWorkspace />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Notes Trash, 1 item' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore Archived note' }))

    await waitFor(() => expect(restore).toHaveBeenCalledWith('trashed-note'))
  })

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

  it('opens an accessible cross-resource picker after [[ and inserts a stable link', async () => {
    const { edit } = arrangeNotes()
    useSnippetsStore.setState({
      snippets: [
        {
          id: 'snippet-1',
          title: 'Fetch helper',
          content: 'fetch(url)',
          language: 'javascript',
          tags: [],
          folder: '',
          folderId: 'snippets-inbox',
          favorite: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })
    render(<NotesWorkspace />)

    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'See [[' } })
    const picker = screen.getByRole('combobox', {
      name: 'Find a note, snippet, or API request',
    })
    fireEvent.change(picker, { target: { value: 'Fetch' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: /Fetch helper/ }))

    expect(edit).toHaveBeenLastCalledWith('note-1', {
      content: 'See [[snippet:snippet-1|Fetch helper]]',
    })
  })

  it('renders renamed targets and navigates forward and back through backlinks', async () => {
    const source = {
      ...note,
      title: 'Source note',
      content: 'See [[note:target|Old target title]]',
    }
    const target = {
      ...note,
      id: 'target',
      title: 'Renamed target',
      content: 'Destination',
    }
    useNotesStore.setState({ notes: [source, target] })
    render(<NotesWorkspace />)

    const link = await screen.findByRole('link', { name: 'Renamed target' })
    fireEvent.click(link)
    await waitFor(() => expect(screen.getByLabelText('Note title')).toHaveValue('Renamed target'))
    expect(screen.getByText('Backlinks (1)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Source note' }))
    await waitFor(() => expect(screen.getByLabelText('Note title')).toHaveValue('Source note'))
  })

  it('opens the exact linked snippet and carries an explicit route back to the note', async () => {
    useNotesStore.setState({
      notes: [{ ...note, content: 'Use [[snippet:snippet-1|Old helper name]]' }],
    })
    useSnippetsStore.setState({
      snippets: [
        {
          id: 'snippet-1',
          title: 'Renamed helper',
          content: 'fetch(url)',
          language: 'javascript',
          tags: [],
          folder: '',
          folderId: 'snippets-inbox',
          favorite: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })
    render(<NotesWorkspace />)

    fireEvent.click(await screen.findByRole('link', { name: 'Renamed helper' }))

    expect(useUiStore.getState().activeTool).toBe('snippets')
    expect(useToolStateCache.getState().get('snippets')).toMatchObject({
      wikiTargetId: 'snippet-1',
      backlinkNoteId: 'note-1',
    })
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

  it('creates a structured task without replacing the note model', async () => {
    const created = {
      ...note,
      id: 'task-2',
      title: 'Untitled task',
      content: '',
      taskStatus: 'todo' as const,
      taskPriority: 'medium' as const,
    }
    const add = vi.fn().mockResolvedValue(created)
    useNotesStore.setState({ add })
    render(<NotesWorkspace />)

    fireEvent.click(screen.getByRole('button', { name: 'New task' }))

    await waitFor(() =>
      expect(add).toHaveBeenCalledWith('Untitled task', '', 'yellow', 'notes-inbox', {
        status: 'todo',
        priority: 'medium',
      })
    )
  })

  it('filters task views and supports quick completion from a list row', async () => {
    const today = localDateKey()
    const { updateTask } = arrangeNotes()
    useNotesStore.setState({
      notes: [
        note,
        { ...note, id: 'today-task', title: 'Today task', taskStatus: 'todo', taskDueDate: today },
        {
          ...note,
          id: 'done-task',
          title: 'Done task',
          taskStatus: 'done',
          taskDueDate: today,
        },
      ],
    })
    render(<NotesWorkspace />)

    fireEvent.click(screen.getByRole('button', { name: /^Today/ }))
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Today task/ })).toBeInTheDocument()
    )
    expect(screen.queryByRole('option', { name: /Release plan/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Done task/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Complete Today task' }))
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('today-task', { status: 'done' }))
  })

  it('confirms task-to-note conversion before removing only task metadata', async () => {
    const { updateTask } = arrangeNotes()
    useNotesStore.setState({
      notes: [
        {
          ...note,
          taskStatus: 'blocked',
          taskPriority: 'high',
          taskDueDate: localDateKey(),
        },
      ],
    })
    render(<NotesWorkspace />)

    fireEvent.click(await screen.findByRole('button', { name: 'Convert to note' }))
    expect(screen.getByText(/Its title, body, folder, and tags will stay unchanged/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Remove task metadata' }))

    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('note-1', { status: null }))
  })

  it('confirms before moving all completed tasks to durable Trash', async () => {
    const trashCompleted = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({
      notes: [{ ...note, taskStatus: 'done' }],
      trashCompleted,
    })
    render(<NotesWorkspace />)

    fireEvent.click(screen.getByRole('button', { name: 'Trash completed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move 1 to Trash' }))

    await waitFor(() => expect(trashCompleted).toHaveBeenCalledOnce())
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
