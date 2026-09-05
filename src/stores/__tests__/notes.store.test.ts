import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useNotesStore } from '../notes.store'
import { loadNotes, saveNote, saveNotesOrder, deleteNote, clearAllNotes } from '@/lib/db'
import { expectInitRejectionRecovers } from './init-rejection-helper'
import type { Note } from '@/types/models'

vi.mock('@/lib/db', () => ({
  loadNotes: vi.fn(),
  saveNote: vi.fn(),
  saveNotesOrder: vi.fn(),
  deleteNote: vi.fn(),
  clearAllNotes: vi.fn(),
}))

// Reset store state between tests
beforeEach(() => {
  vi.clearAllMocks()
  useNotesStore.setState({
    notes: [],
    initialized: false,
    pendingSaveIds: [],
    saveErrorIds: [],
  })
  // Reset the module-level initPromise by re-importing
  // Instead, we test the store actions directly (add, update, remove)
  ;(loadNotes as any).mockResolvedValue([])
  ;(saveNote as any).mockResolvedValue(undefined)
  ;(saveNotesOrder as any).mockResolvedValue(undefined)
  ;(deleteNote as any).mockResolvedValue(undefined)
  ;(clearAllNotes as any).mockResolvedValue(undefined)
})

function deferred<T>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolvePromise = res
    reject = rej
  })
  const resolve = (value?: T | PromiseLike<T>) => resolvePromise(value as T)
  return { promise, resolve, reject }
}

describe('notes store', () => {
  it('starts empty and uninitialized', () => {
    const state = useNotesStore.getState()
    expect(state.notes).toEqual([])
    expect(state.initialized).toBe(false)
  })

  it('adds a note', async () => {
    const note = await useNotesStore.getState().add('Test Title', 'Test content', 'yellow')

    expect(note.title).toBe('Test Title')
    expect(note.content).toBe('Test content')
    expect(note.color).toBe('yellow')
    expect(note.tags).toEqual([])
    expect(note.sortOrder).toBeLessThan(0)
    expect(note.id).toBeTruthy()

    const { notes } = useNotesStore.getState()
    expect(notes).toHaveLength(1)
    expect(notes[0]!.id).toBe(note.id)

    expect(saveNote).toHaveBeenCalledWith(note)
  })

  it('adds notes in reverse chronological order', async () => {
    const first = await useNotesStore.getState().add('First')
    const second = await useNotesStore.getState().add('Second')

    const { notes } = useNotesStore.getState()
    expect(notes[0]!.id).toBe(second.id)
    expect(notes[1]!.id).toBe(first.id)
  })

  it('updates a note', async () => {
    const note = await useNotesStore.getState().add('Original')
    ;(saveNote as any).mockClear()

    await useNotesStore.getState().update(note.id, { title: 'Updated' })

    const { notes } = useNotesStore.getState()
    expect(notes[0]!.title).toBe('Updated')
    expect(notes[0]!.content).toBe('') // unchanged
    expect(notes[0]!.tags).toEqual([])
    expect(saveNote).toHaveBeenCalledOnce()

    await useNotesStore.getState().update(note.id, { tags: ['tag1'] })
    expect(useNotesStore.getState().notes[0]!.tags).toEqual(['tag1'])
  })

  it('updates note state before the database write finishes', async () => {
    const note = await useNotesStore.getState().add('Original')
    const pending = deferred<void>()
    ;(saveNote as any).mockReturnValueOnce(pending.promise)

    const updatePromise = useNotesStore.getState().update(note.id, { title: 'Draft title' })

    expect(useNotesStore.getState().notes[0]!.title).toBe('Draft title')

    pending.resolve()
    await updatePromise
  })

  it('coalesces text edits in the canonical store and flushes the latest note', async () => {
    const note = await useNotesStore.getState().add('Original', 'First body')
    ;(saveNote as any).mockClear()

    useNotesStore.getState().edit(note.id, { title: 'Draft title' })
    useNotesStore.getState().edit(note.id, { content: 'Latest body' })

    expect(useNotesStore.getState().notes[0]).toMatchObject({
      title: 'Draft title',
      content: 'Latest body',
    })
    expect(useNotesStore.getState().pendingSaveIds).toEqual([note.id])
    expect(saveNote).not.toHaveBeenCalled()

    await useNotesStore.getState().flushPending(note.id)

    expect(saveNote).toHaveBeenCalledOnce()
    expect(saveNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: note.id, title: 'Draft title', content: 'Latest body' })
    )
    expect(useNotesStore.getState().pendingSaveIds).toEqual([])
  })

  it('serializes a newer edit behind an in-flight note save', async () => {
    const note = await useNotesStore.getState().add('Original', 'First body')
    ;(saveNote as any).mockClear()
    const firstSave = deferred<void>()
    ;(saveNote as any).mockReturnValueOnce(firstSave.promise)

    useNotesStore.getState().edit(note.id, { title: 'First draft' })
    const flush = useNotesStore.getState().flushPending(note.id)
    useNotesStore.getState().edit(note.id, { content: 'Edit during save' })
    firstSave.resolve()
    await flush

    expect(saveNote).toHaveBeenCalledTimes(2)
    expect(saveNote).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'First draft', content: 'Edit during save' })
    )
    expect(useNotesStore.getState().pendingSaveIds).toEqual([])
  })

  it('keeps an edit made while refresh is reading stale rows', async () => {
    const note = await useNotesStore.getState().add('Original', 'First body')
    const staleLoad = deferred<Note[]>()
    ;(loadNotes as any).mockReturnValueOnce(staleLoad.promise)

    const refresh = useNotesStore.getState().refresh()
    await vi.waitFor(() => expect(loadNotes).toHaveBeenCalled())
    useNotesStore.getState().edit(note.id, { content: 'Draft during refresh' })
    staleLoad.resolve([{ ...note, content: 'First body' }])
    await refresh

    expect(useNotesStore.getState().notes[0]!.content).toBe('Draft during refresh')
    await useNotesStore.getState().flushPending(note.id)
  })

  it('does not let a stale refresh discard a note being added', async () => {
    const staleLoad = deferred<Note[]>()
    ;(loadNotes as any).mockReturnValueOnce(staleLoad.promise)

    const refresh = useNotesStore.getState().refresh()
    await vi.waitFor(() => expect(loadNotes).toHaveBeenCalled())
    const added = await useNotesStore.getState().add('Added during refresh')
    staleLoad.resolve([])
    await refresh

    expect(useNotesStore.getState().notes.map((note) => note.id)).toEqual([added.id])
  })

  it('ignores edits while a note deletion is in flight', async () => {
    const note = await useNotesStore.getState().add('Doomed', 'Original body')
    const deletion = deferred<void>()
    ;(deleteNote as any).mockReturnValueOnce(deletion.promise)
    ;(saveNote as any).mockClear()

    const remove = useNotesStore.getState().remove(note.id)
    useNotesStore.getState().edit(note.id, { content: 'Late edit' })
    await useNotesStore.getState().update(note.id, { pinned: true })
    expect(useNotesStore.getState().notes[0]!.content).toBe('Original body')
    expect(useNotesStore.getState().notes[0]!.pinned).toBe(false)
    expect(saveNote).not.toHaveBeenCalled()

    deletion.resolve()
    await remove
    expect(useNotesStore.getState().notes).toEqual([])
  })

  it('ignores edits and metadata updates while clearing notes', async () => {
    const note = await useNotesStore.getState().add('Doomed', 'Original body')
    const clearingNotes = deferred<void>()
    ;(clearAllNotes as any).mockReturnValueOnce(clearingNotes.promise)
    ;(saveNote as any).mockClear()

    const clear = useNotesStore.getState().clearAll()
    useNotesStore.getState().edit(note.id, { content: 'Late edit' })
    await useNotesStore.getState().update(note.id, { pinned: true })

    expect(useNotesStore.getState().notes[0]).toMatchObject({
      content: 'Original body',
      pinned: false,
    })
    expect(saveNote).not.toHaveBeenCalled()

    clearingNotes.resolve()
    await clear
    expect(useNotesStore.getState().notes).toEqual([])
  })

  it('update with unknown ID is a no-op', async () => {
    await useNotesStore.getState().add('Note')
    await useNotesStore.getState().update('nonexistent', { title: 'Ghost' })

    const { notes } = useNotesStore.getState()
    expect(notes).toHaveLength(1)
    expect(notes[0]!.title).toBe('Note')
  })

  it('removes a note', async () => {
    const note = await useNotesStore.getState().add('Doomed')
    await useNotesStore.getState().remove(note.id)

    const { notes } = useNotesStore.getState()
    expect(notes).toHaveLength(0)
    expect(deleteNote).toHaveBeenCalledWith(note.id)
  })

  it('reorders notes within the same pin group', async () => {
    const first = await useNotesStore.getState().add('First')
    const second = await useNotesStore.getState().add('Second')
    const third = await useNotesStore.getState().add('Third')
    ;(saveNote as any).mockClear()
    ;(saveNotesOrder as any).mockClear()

    await useNotesStore.getState().reorder(first.id, third.id, 'before')

    const { notes } = useNotesStore.getState()
    expect(notes.map((note) => note.id)).toEqual([first.id, third.id, second.id])
    expect(notes.map((note) => note.sortOrder)).toEqual([1024, 2048, 3072])
    expect(saveNotesOrder).toHaveBeenCalledWith([
      { id: first.id, sortOrder: 1024 },
      { id: third.id, sortOrder: 2048 },
      { id: second.id, sortOrder: 3072 },
    ])
    expect(saveNote).not.toHaveBeenCalled()
  })

  it('reorders note state before the database write finishes', async () => {
    const first = await useNotesStore.getState().add('First')
    const second = await useNotesStore.getState().add('Second')
    const pending = deferred<void>()
    ;(saveNotesOrder as any).mockReturnValueOnce(pending.promise)

    const reorderPromise = useNotesStore.getState().reorder(first.id, second.id, 'after')

    expect(useNotesStore.getState().notes.map((note) => note.id)).toEqual([second.id, first.id])

    pending.resolve()
    await reorderPromise
  })
})

describe('notes store initialization', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('init() clears the cached promise on rejection so a later call retries', async () => {
    const { useNotesStore: freshStore } = await import('../notes.store')

    await expectInitRejectionRecovers({
      runInit: () => freshStore.getState().init(),
      arrangeFailure: () => {
        ;(loadNotes as any).mockRejectedValueOnce(new Error('db locked'))
      },
      arrangeSuccess: () => {
        ;(loadNotes as any).mockResolvedValueOnce([])
      },
      rejectMessage: 'db locked',
      assertAfterFailure: () => {
        expect(freshStore.getState().initialized).toBe(false)
      },
      assertAfterSuccess: () => {
        expect(freshStore.getState().initialized).toBe(true)
      },
      getCallCount: () => (loadNotes as any).mock.calls.length,
    })
  })
})
