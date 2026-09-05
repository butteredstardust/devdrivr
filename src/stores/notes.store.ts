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
  pendingSaveIds: string[]
  saveErrorIds: string[]
  init: () => Promise<void>
  refresh: () => Promise<void>
  add: (title?: string, content?: string, color?: NoteColor, folderId?: string) => Promise<Note>
  edit: (id: string, patch: Partial<Pick<Note, 'title' | 'content'>>) => void
  flushPending: (id?: string) => Promise<void>
  update: (
    id: string,
    patch: Partial<
      Pick<
        Note,
        | 'title'
        | 'content'
        | 'color'
        | 'pinned'
        | 'poppedOut'
        | 'windowBounds'
        | 'tags'
        | 'folderId'
      >
    >
  ) => Promise<void>
  reorder: (sourceId: string, targetId: string, position: DropPosition) => Promise<void>
  remove: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

let initPromise: Promise<void> | null = null
const SAVE_DELAY_MS = 450
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingSaves = new Map<string, { updated: Note; original: Note; version: number }>()
const inFlightSaves = new Map<string, Promise<void>>()
const deletingIds = new Set<string>()
let clearing = false
let saveVersion = 0
let notesRevision = 0

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
  pendingSaveIds: [],
  saveErrorIds: [],

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const notes = await loadNotes()
        set({ notes, initialized: true })
      })().catch((err: unknown) => {
        // Clear the cached promise on failure so a later call retries
        // instead of latching a transient error for the process lifetime.
        initPromise = null
        throw err
      })
    }
    return initPromise
  },

  refresh: async () => {
    await get().flushPending()
    const revision = notesRevision
    const notes = await loadNotes()
    if (revision === notesRevision) set({ notes, initialized: true })
  },

  add: async (title = '', content = '', color: NoteColor = 'yellow', folderId = 'notes-inbox') => {
    if (clearing) throw new Error('Cannot add a note while clearing notes')
    // Invalidate any refresh already reading the database before this write starts.
    notesRevision++
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
      folderId,
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

  edit: (id, patch) => {
    if (clearing || deletingIds.has(id)) return
    const notes = get().notes
    const existing = notes.find((note) => note.id === id)
    if (!existing) return
    const updated = {
      ...existing,
      ...patch,
      updatedAt: Math.max(Date.now(), existing.updatedAt + 1),
    }
    const original = pendingSaves.get(id)?.original ?? existing
    const pending = { updated, original, version: ++saveVersion }
    pendingSaves.set(id, pending)

    const timer = saveTimers.get(id)
    if (timer) clearTimeout(timer)
    saveTimers.set(
      id,
      setTimeout(() => {
        void get()
          .flushPending(id)
          .catch(() => {
            // The flush path rolls back and reports its own persistence failure.
          })
      }, SAVE_DELAY_MS)
    )

    notesRevision++
    set((state) => ({
      notes: sortNotes(state.notes.map((note) => (note.id === id ? updated : note))),
      pendingSaveIds: [...new Set([...state.pendingSaveIds, id])],
      saveErrorIds: state.saveErrorIds.filter((errorId) => errorId !== id),
    }))
  },

  flushPending: async (id) => {
    const ids = id ? [id] : [...pendingSaves.keys()]
    for (const pendingId of ids) {
      const pending = pendingSaves.get(pendingId)
      if (!pending) continue
      const currentSave = inFlightSaves.get(pendingId)
      if (currentSave) {
        try {
          await currentSave
        } catch {
          // The flush that owns this save reports and rolls back its own failure.
        }
        if (pendingSaves.has(pendingId)) await get().flushPending(pendingId)
        continue
      }
      const timer = saveTimers.get(pendingId)
      if (timer) clearTimeout(timer)
      saveTimers.delete(pendingId)
      const save = saveNote(pending.updated)
      inFlightSaves.set(pendingId, save)
      try {
        await save
        if (pendingSaves.get(pendingId)?.version === pending.version) {
          pendingSaves.delete(pendingId)
          notesRevision++
          set((state) => ({
            pendingSaveIds: state.pendingSaveIds.filter((savedId) => savedId !== pendingId),
            saveErrorIds: state.saveErrorIds.filter((errorId) => errorId !== pendingId),
          }))
        }
      } catch (err) {
        if (pendingSaves.get(pendingId)?.version === pending.version) {
          pendingSaves.delete(pendingId)
          set((state) => ({
            notes: sortNotes(
              state.notes.map((note) => (note.id === pendingId ? pending.original : note))
            ),
            pendingSaveIds: state.pendingSaveIds.filter((savedId) => savedId !== pendingId),
            saveErrorIds: [...new Set([...state.saveErrorIds, pendingId])],
          }))
        }
        const msg = err instanceof Error ? err.message : String(err)
        useUiStore.getState().addToast('Failed to save note: ' + msg, 'error')
        throw err
      } finally {
        if (inFlightSaves.get(pendingId) === save) inFlightSaves.delete(pendingId)
      }

      if (pendingSaves.has(pendingId)) await get().flushPending(pendingId)
    }
  },

  update: async (id, patch) => {
    if (clearing || deletingIds.has(id)) return
    if (pendingSaves.has(id) || inFlightSaves.has(id)) await get().flushPending(id)
    const notes = get().notes
    const idx = notes.findIndex((n) => n.id === id)
    if (idx < 0) return
    const existing = notes[idx]
    if (!existing) return
    const updated = {
      ...existing,
      ...patch,
      updatedAt: Math.max(Date.now(), existing.updatedAt + 1),
    }
    notesRevision++
    set((s) => ({
      notes: sortNotes(s.notes.map((n) => (n.id === id ? updated : n))),
    }))

    try {
      await saveNote(updated)
    } catch (err) {
      const current = get().notes.find((n) => n.id === id)
      if (current?.updatedAt === updated.updatedAt) {
        notesRevision++
        set((s) => ({
          notes: sortNotes(s.notes.map((n) => (n.id === id ? existing : n))),
        }))
      }
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save note: ' + msg, 'error')
      throw err
    }
  },

  reorder: async (sourceId, targetId, position) => {
    if (sourceId === targetId) return
    if (clearing || deletingIds.has(sourceId) || deletingIds.has(targetId)) return

    if (pendingSaves.size > 0 || inFlightSaves.size > 0) await get().flushPending()

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
    notesRevision++
    set({ notes: nextNotes })

    try {
      await saveNotesOrder(changedNotes.map(({ id, sortOrder }) => ({ id, sortOrder })))
    } catch (err) {
      if (get().notes === nextNotes) {
        notesRevision++
        set({ notes })
      }
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to reorder notes: ' + msg, 'error')
      throw err
    }
  },

  remove: async (id) => {
    if (deletingIds.has(id)) return
    deletingIds.add(id)
    // Ignore surface edits and stale refreshes from the moment deletion begins.
    notesRevision++
    try {
      await get().flushPending(id)
      try {
        await deleteNote(id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        useUiStore.getState().addToast('Failed to delete note: ' + msg, 'error')
        throw err
      }
    } finally {
      deletingIds.delete(id)
    }
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }))
  },

  clearAll: async () => {
    if (clearing) return
    clearing = true
    // Block new drafts and invalidate refreshes while the destructive write is pending.
    notesRevision++
    try {
      await get().flushPending()
      await clearAllNotes()
      for (const timer of saveTimers.values()) clearTimeout(timer)
      saveTimers.clear()
      pendingSaves.clear()
      set({ notes: [], pendingSaveIds: [], saveErrorIds: [] })
    } finally {
      clearing = false
    }
  },
}))
