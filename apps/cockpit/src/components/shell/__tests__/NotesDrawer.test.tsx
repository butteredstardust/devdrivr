import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesDrawer } from '@/components/shell/NotesDrawer'
import { useHistoryStore } from '@/stores/history.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { DEFAULT_SETTINGS, type Note } from '@/types/models'
import { processMarkdown } from '@/lib/markdown'

vi.mock('@/lib/markdown', () => ({
  processMarkdown: vi.fn().mockResolvedValue('<p>rendered</p>'),
}))

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
  ;(processMarkdown as ReturnType<typeof vi.fn>).mockResolvedValue('<p>rendered</p>')
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

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('NotesDrawer', () => {
  it('makes the closed drawer inert so its controls leave the tab order', () => {
    const { rerender } = render(<NotesDrawer />)
    const drawer = screen.getByRole('complementary', { name: 'Notes and history' })
    expect(drawer).not.toHaveAttribute('inert')

    // Closed, the drawer is only `w-0 opacity-0 pointer-events-none` — invisible and
    // unclickable, but its search field, tabs and note list stay tabbable and announced.
    act(() => {
      useSettingsStore.setState({ notesDrawerOpen: false })
    })
    rerender(<NotesDrawer />)

    expect(screen.getByRole('complementary', { name: 'Notes and history' })).toHaveAttribute(
      'inert'
    )
  })

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
    expect(yellow.className).toContain('min-h-7')
    expect(yellow.className).toContain('min-w-7')
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

  it('debounces note text persistence while keeping the draft responsive', async () => {
    vi.useFakeTimers()
    const update = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({ update })
    render(<NotesDrawer />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Test note' }))
    const title = screen.getByRole('textbox', { name: 'Note title' })
    fireEvent.change(title, { target: { value: 'A better title' } })

    expect(title).toHaveValue('A better title')
    expect(update).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith('note-1', {
      title: 'A better title',
      content: 'Use this as input',
    })
    vi.useRealTimers()
  })

  it('renders the note title at display size, not the variant default', () => {
    // The title is the one field in the drawer that is meant to be larger than body text.
    // When it was migrated to InlineInput it was written as `className="w-full text-lg"`,
    // which loses to the default variant's `text-sm` on stylesheet order and shrank the
    // title with no diff, no test and no lint error to show for it. Asserting the absence
    // of `text-sm` is the half that catches a regression back to the className form.
    render(<NotesDrawer />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Test note' }))
    const title = screen.getByRole('textbox', { name: 'Note title' })
    expect(title.className).toContain('text-lg')
    expect(title.className).not.toContain('text-sm')
  })

  it('requires confirmation before deleting a note', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({ remove })
    render(<NotesDrawer />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Test note' }))
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Delete note?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('note-1'))
  })

  it('renders history entries as keyboard-accessible replay buttons', () => {
    useHistoryStore.setState({
      entries: [
        {
          id: 'history-1',
          tool: 'JSON Formatter',
          input: '{"ok":true}',
          output: '',
          timestamp: Date.now(),
        },
      ],
    })
    render(<NotesDrawer />)

    fireEvent.click(screen.getByRole('tab', { name: 'History' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replay JSON Formatter history entry' }))

    expect(useUiStore.getState().pendingSendTo).toBe('{"ok":true}')
  })

  it('does not set state after unmount while markdown processing is still pending', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolvePending: (html: string) => void = () => {}
    ;(processMarkdown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolvePending = resolve
      })
    )

    const { unmount } = render(<NotesDrawer />)
    unmount()

    // Resolve after unmount — if the effect didn't guard with a cancelled flag,
    // this would call setState on an unmounted component (React warning/error).
    resolvePending('<p>too late</p>')
    await Promise.resolve()
    await Promise.resolve()

    const reactSetStateWarning = consoleError.mock.calls.some((call) =>
      String(call[0]).includes("Can't perform a React state update")
    )
    expect(reactSetStateWarning).toBe(false)
  })

  it('renders the latest markdown result when an earlier request resolves out of order', async () => {
    let resolveFirst: (html: string) => void = () => {}
    const firstCall = new Promise<string>((resolve) => {
      resolveFirst = resolve
    })
    ;(processMarkdown as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(firstCall)
      .mockResolvedValueOnce('<p>second</p>')

    const { rerender } = render(<NotesDrawer />)

    // Trigger a second processMarkdown call (content change) before the first resolves.
    useNotesStore.setState({ notes: [{ ...testNote, content: 'Updated content' }] })
    rerender(<NotesDrawer />)

    await waitFor(() => expect(processMarkdown).toHaveBeenCalledTimes(2))

    // The stale first call resolves last — it must not clobber the second result.
    resolveFirst('<p>stale first</p>')

    await waitFor(() => {
      expect(document.querySelector('.prose')?.innerHTML).toBe('<p>second</p>')
    })
  })
})
