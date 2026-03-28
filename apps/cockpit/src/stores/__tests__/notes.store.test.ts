import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useNotesStore } from '../notes.store'
import { loadNotes, saveNote, deleteNote } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  loadNotes: vi.fn(),
  saveNote: vi.fn(),
  deleteNote: vi.fn(),
}))

// Reset store state between tests
beforeEach(() => {
  useNotesStore.setState({ notes: [], initialized: false })
  // Reset the module-level initPromise by re-importing
  // Instead, we test the store actions directly (add, update, remove)
  ;(loadNotes as any).mockResolvedValue([])
  ;(saveNote as any).mockResolvedValue(undefined)
  ;(deleteNote as any).mockResolvedValue(undefined)
})

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
})
