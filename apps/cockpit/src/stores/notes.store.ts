import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Note, NoteColor } from '@/types/models'
import { loadNotes, saveNote, saveNotesOrder, deleteNote, clearAllNotes } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

const SORT_STEP = 1024

type DropPosition = 'before' | 'after'

type NotesStore = {
  notes: Note[]
  initialized: boolean
  init: () => Promise<void>
  refresh: () => Promise<void>
  add: (title?: string, content?: string, color?: NoteColor) => Promise<Note>
  update: (
    id: string,
    patch: Partial<
      Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'poppedOut' | 'windowBounds' | 'tags'>
    >
  ) => Promise<void>
  reorder: (sourceId: string, targetId: string, position: DropPosition) => Promise<void>
  remove: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

let initPromise: Promise<void> | null = null

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return b.updatedAt - a.updatedAt
  })
}

export const useNotesStore = create<NotesStore>()((set, get) => ({
  notes: [],
  initialized: false,

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const notes = await loadNotes()
        set({ notes, initialized: true })
      })()
    }
    return initPromise
  },

  refresh: async () => {
    const notes = await loadNotes()
    set({ notes, initialized: true })
  },

  add: async (title = '', content = '', color: NoteColor = 'yellow') => {
    const now = Date.now()
    const firstUnpinnedOrder = Math.min(
      0,
      ...get()
        .notes.filter((n) => !n.pinned)
        .map((n) => n.sortOrder)
    )
    const note: Note = {
      id: nanoid(),
      title,
      content,
      color,
      pinned: false,
      poppedOut: false,
      createdAt: now,
      updatedAt: now,
      tags: [],
      sortOrder: firstUnpinnedOrder - SORT_STEP,
    }
    try {
      await saveNote(note)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save note: ' + msg, 'error')
      throw err
    }
    set((s) => ({ notes: sortNotes([note, ...s.notes]) }))
    return note
  },

  update: async (id, patch) => {
    const notes = get().notes
    const idx = notes.findIndex((n) => n.id === id)
    if (idx < 0) return
    const existing = notes[idx]
    if (!existing) return
    const updated = { ...existing, ...patch, updatedAt: Date.now() }
    try {
      await saveNote(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save note: ' + msg, 'error')
      throw err
    }
    set((s) => ({
      notes: sortNotes(s.notes.map((n) => (n.id === id ? updated : n))),
    }))
  },

  reorder: async (sourceId, targetId, position) => {
    if (sourceId === targetId) return

    const notes = get().notes
    const source = notes.find((n) => n.id === sourceId)
    const target = notes.find((n) => n.id === targetId)
    if (!source || !target || source.pinned !== target.pinned) return

    const group = notes.filter((n) => n.pinned === source.pinned)
    const withoutSource = group.filter((n) => n.id !== sourceId)
    const targetIndex = withoutSource.findIndex((n) => n.id === targetId)
    if (targetIndex < 0) return

    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
    const reorderedGroup = [...withoutSource]
    reorderedGroup.splice(insertIndex, 0, source)

    const updatedById = new Map(
      reorderedGroup.map((note, index) => [
        note.id,
        {
          ...note,
          sortOrder: (index + 1) * SORT_STEP,
        },
      ])
    )
    const nextNotes = sortNotes(notes.map((note) => updatedById.get(note.id) ?? note))
    const changedNotes = nextNotes.filter((note) => updatedById.has(note.id))

    try {
      await saveNotesOrder(changedNotes.map(({ id, sortOrder }) => ({ id, sortOrder })))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to reorder notes: ' + msg, 'error')
      throw err
    }

    set({ notes: nextNotes })
  },

  remove: async (id) => {
    try {
      await deleteNote(id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to delete note: ' + msg, 'error')
      throw err
    }
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }))
  },

  clearAll: async () => {
    await clearAllNotes()
    set({ notes: [] })
  },
}))
