import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Note, NoteColor } from '@/types/models'
import { loadNotes, saveNote, deleteNote, clearAllNotes } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

type NotesStore = {
  notes: Note[]
  initialized: boolean
  init: () => Promise<void>
  add: (title?: string, content?: string, color?: NoteColor) => Promise<Note>
  update: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'poppedOut' | 'windowBounds' | 'tags'>>) => Promise<void>
  remove: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

let initPromise: Promise<void> | null = null

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

  add: async (title = '', content = '', color: NoteColor = 'yellow') => {
    const now = Date.now()
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
    }
    try {
      await saveNote(note)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save note: ' + msg, 'error')
      throw err
    }
    set((s) => ({ notes: [note, ...s.notes] }))
    return note
  },

  update: async (id, patch) => {
    const notes = get().notes
    const idx = notes.findIndex((n) => n.id === id)
    if (idx < 0) return
    const updated = { ...notes[idx]!, ...patch, updatedAt: Date.now() }
    try {
      await saveNote(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save note: ' + msg, 'error')
      throw err
    }
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? updated : n)),
    }))
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
