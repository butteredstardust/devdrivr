import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Note, NoteColor } from '@/types/models'
import { loadNotes, saveNote, deleteNote, clearAllNotes } from '@/lib/db'

type NotesStore = {
  notes: Note[]
  initialized: boolean
  init: () => Promise<void>
  add: (title?: string, content?: string, color?: NoteColor) => Promise<Note>
  update: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'poppedOut' | 'windowBounds'>>) => Promise<void>
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
    }
    await saveNote(note)
    set((s) => ({ notes: [note, ...s.notes] }))
    return note
  },

  update: async (id, patch) => {
    const notes = get().notes
    const idx = notes.findIndex((n) => n.id === id)
    if (idx < 0) return
    const updated = { ...notes[idx]!, ...patch, updatedAt: Date.now() }
    await saveNote(updated)
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? updated : n)),
    }))
  },

  remove: async (id) => {
    await deleteNote(id)
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }))
  },

  clearAll: async () => {
    await clearAllNotes()
    set({ notes: [] })
  },
}))
