import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesDrawer } from '@/components/shell/NotesDrawer'
import { useHistoryStore } from '@/stores/history.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { DEFAULT_SETTINGS, type Note } from '@/types/models'
import { processMarkdown } from '@/lib/markdown'
import { sendToTool } from '@/lib/tool-handoff'

vi.mock('@/lib/markdown', () => ({
  processMarkdown: vi.fn().mockResolvedValue('<p>rendered</p>'),
}))

vi.mock('@/lib/tool-handoff', () => ({
  sendToTool: vi.fn(),
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
    pendingSaveIds: [],
    saveErrorIds: [],
    edit: vi.fn((id, patch) => {
      useNotesStore.setState((state) => ({
        notes: state.notes.map((note) => (note.id === id ? { ...note, ...patch } : note)),
      }))
    }),
    flushPending: vi.fn().mockResolvedValue(undefined),
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

/**
 * Reordering runs on pointer events, not HTML5 drag-and-drop — Tauri's native
 * drag-drop handler (the one `useFileDropZone` needs) swallows in-page
 * dragover/drop, so a `draggable` handle never moved a note in the real window
 * and the swallowed drop surfaced as "File drop is not supported by the active
 * tool" instead.
 *
 * jsdom has no layout, so every card reports a zero rect at y=0 unless it is
 * given one. Stacking them 100px apart lets `clientY` select a card and a half
 * deterministically: the drawer hit-tests against each card's vertical midpoint.
 */
function layOutNotes(height = 100) {
  const nodes = [...document.querySelectorAll<HTMLElement>('[data-note-id]')]
  let top = 0
  for (const node of nodes) {
    const rect = {
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 300,
      width: 300,
      x: 0,
      y: top,
    }
    node.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect
    top += height
  }
}

function dragNote(handleLabel: string, toClientY: number) {
  const handle = screen.getByRole('button', { name: handleLabel })
  fireEvent.pointerDown(handle, { button: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientY: toClientY })
  fireEvent.pointerUp(window, { clientY: toClientY })
}

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

  it('flushes the active note when the drawer closes', async () => {
    const flushPending = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({ flushPending })
    const { rerender } = render(<NotesDrawer />)
    fireEvent.click(screen.getByText('Test note'))

    act(() => {
      useSettingsStore.setState({ notesDrawerOpen: false })
    })
    rerender(<NotesDrawer />)

    await waitFor(() => expect(flushPending).toHaveBeenCalledWith('note-1'))
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

  // The floating shell layout is applied entirely from styles/shell.css, keyed on this
  // class. jsdom applies no stylesheet, so a rename here would otherwise only surface
  // as "the notes drawer stopped being a card" in a running app.
  it('carries the shell-panel hook the floating layout is keyed on', () => {
    render(<NotesDrawer />)
    expect(screen.getByRole('complementary', { name: 'Notes and history' })).toHaveClass(
      'shell-panel'
    )
  })

  // The width transition is for the open/close slide. An inline width does not opt out of it, so
  // while it was left on during a drag every mousemove re-aimed a 200ms eased animation at a
  // target that had already moved: the edge trailed the cursor and arrived in steps. Measured in
  // Chromium the computed transition-duration was 0.2s throughout the drag and the drawer lagged
  // the pointer; suppressed, it tracks exactly. jsdom computes no transitions, hence the class
  // assertion rather than a style one.
  it('drops the width transition while the drawer is being dragged', () => {
    render(<NotesDrawer />)
    const drawer = screen.getByRole('complementary', { name: 'Notes and history' })
    expect(drawer.className).toContain('transition-[width,opacity]')

    fireEvent.pointerDown(screen.getByRole('separator', { name: 'Resize notes drawer' }), {
      pointerId: 1,
    })
    expect(drawer.className).not.toContain('transition-[width,opacity]')

    fireEvent.pointerUp(document, { pointerId: 1 })
    expect(drawer.className).toContain('transition-[width,opacity]')
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

  it('calls reorder when a note is dragged onto another note', () => {
    const reorder = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({ notes: [testNote, secondNote], reorder })
    render(<NotesDrawer />)
    layOutNotes()

    // note-2 spans y 100–200, so 180 is past its midpoint: land after it.
    dragNote('Drag Test note to reorder', 180)

    expect(reorder).toHaveBeenCalledWith('note-1', 'note-2', 'after')
  })

  it('drops a note before a target whose upper half the pointer is over', () => {
    const reorder = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({ notes: [testNote, secondNote], reorder })
    render(<NotesDrawer />)
    layOutNotes()

    // note-1 spans y 0–100, so 20 is its upper half.
    dragNote('Drag Second note to reorder', 20)

    expect(reorder).toHaveBeenCalledWith('note-2', 'note-1', 'before')
  })

  it('leaves the order alone when the pointer never passes the drag threshold', () => {
    const reorder = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({ notes: [testNote, secondNote], reorder })
    render(<NotesDrawer />)
    layOutNotes()

    const handle = screen.getByRole('button', { name: 'Drag Test note to reorder' })
    fireEvent.pointerDown(handle, { button: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientY: 2 })
    fireEvent.pointerUp(window, { clientY: 2 })

    expect(reorder).not.toHaveBeenCalled()
  })

  it('does not offer a pinned note as a drop target for an unpinned one', () => {
    const reorder = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({
      notes: [{ ...testNote, pinned: true }, secondNote],
      reorder,
    })
    render(<NotesDrawer />)
    layOutNotes()

    // The only other card is in the other ordering group, so there is no target
    // to land on and the gesture must resolve to nothing rather than to a move
    // `reorder` would silently refuse.
    dragNote('Drag Second note to reorder', 20)

    expect(reorder).not.toHaveBeenCalled()
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

  it('writes note text into the canonical store draft immediately', () => {
    const edit = vi.fn((id: string, patch: Partial<Note>) => {
      useNotesStore.setState((state) => ({
        notes: state.notes.map((note) => (note.id === id ? { ...note, ...patch } : note)),
      }))
    })
    useNotesStore.setState({ edit })
    render(<NotesDrawer />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Test note' }))
    const title = screen.getByRole('textbox', { name: 'Note title' })
    fireEvent.change(title, { target: { value: 'A better title' } })

    expect(title).toHaveValue('A better title')
    expect(edit).toHaveBeenCalledWith('note-1', { title: 'A better title' })
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

  it('flushes and opens the selected note in the full workspace', async () => {
    const flushPending = vi.fn().mockResolvedValue(undefined)
    useNotesStore.setState({ flushPending })
    render(<NotesDrawer />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Test note' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open note in Notes workspace' }))

    await waitFor(() => expect(flushPending).toHaveBeenCalledWith('note-1'))
    expect(sendToTool).toHaveBeenCalledWith('notes', { selectedId: 'note-1' })
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
