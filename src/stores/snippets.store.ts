import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Snippet } from '@/types/models'
import {
  loadSnippets,
  loadTrashedSnippets,
  saveSnippet,
  deleteSnippet,
  restoreSnippet,
  permanentlyDeleteSnippet,
  clearAllSnippets,
} from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

type SnippetsStore = {
  snippets: Snippet[]
  trashedSnippets: Snippet[]
  initialized: boolean
  saving: boolean
  activeFolder: string
  setActiveFolder: (folder: string) => void
  init: () => Promise<void>
  refresh: () => Promise<void>
  add: (
    title: string,
    content: string,
    language: string,
    tags?: string[],
    folder?: string,
    favorite?: boolean,
    folderId?: string
  ) => Promise<Snippet>
  update: (
    id: string,
    patch: Partial<
      Pick<Snippet, 'title' | 'content' | 'language' | 'tags' | 'folder' | 'favorite' | 'folderId'>
    >
  ) => Promise<void>
  flushPending: (id?: string) => Promise<void>
  remove: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
  permanentlyDelete: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

let initPromise: Promise<void> | null = null
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingSaves = new Map<string, { updated: Snippet; original: Snippet; version: number }>()
const savingIds = new Set<string>()
const inFlightSaves = new Map<string, Promise<void>>()
const inFlightMutations = new Set<Promise<void>>()
const deletingIds = new Set<string>()
let clearing = false
let flushingForClear = false
let libraryGeneration = 0
let saveVersion = 0

export const useSnippetsStore = create<SnippetsStore>()((set, get) => ({
  snippets: [],
  trashedSnippets: [],
  initialized: false,
  saving: false,
  activeFolder: '',
  setActiveFolder: (folder) => set({ activeFolder: folder }),

  init: async () => {
    if (!initPromise) {
      const generation = libraryGeneration
      initPromise = (async () => {
        const [snippets, trashedSnippets] = await Promise.all([
          loadSnippets(),
          loadTrashedSnippets(),
        ])
        if (generation !== libraryGeneration) {
          initPromise = null
          return
        }
        set({ snippets, trashedSnippets, initialized: true })
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
    const generation = libraryGeneration
    const [snippets, trashedSnippets] = await Promise.all([loadSnippets(), loadTrashedSnippets()])
    if (generation === libraryGeneration) set({ snippets, trashedSnippets, initialized: true })
  },

  add: async (
    title,
    content,
    language,
    tags = [],
    folder = '',
    favorite = false,
    folderId = 'snippets-inbox'
  ) => {
    if (clearing) throw new Error('Cannot add a snippet while clearing the library')
    const now = Date.now()
    const snippet: Snippet = {
      id: nanoid(),
      title,
      content,
      language,
      tags,
      favorite,
      folder,
      folderId,
      createdAt: now,
      updatedAt: now,
    }
    set({ saving: true })
    try {
      const save = saveSnippet(snippet)
      inFlightMutations.add(save)
      try {
        await save
      } finally {
        inFlightMutations.delete(save)
      }
    } catch (err) {
      set({ saving: false })
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save snippet: ' + msg, 'error')
      throw err
    }
    set((s) => ({ snippets: [snippet, ...s.snippets], saving: false }))
    return snippet
  },

  update: async (id, patch) => {
    if (clearing || deletingIds.has(id)) return
    const snippets = get().snippets
    const idx = snippets.findIndex((s) => s.id === id)
    if (idx < 0) return
    const oldSnippet = snippets[idx]
    if (!oldSnippet) return
    const updated = { ...oldSnippet, ...patch, updatedAt: Date.now() }
    const original = pendingSaves.get(id)?.original ?? oldSnippet

    // 1. Update state immediately (optimistic)
    set((s) => ({
      snippets: s.snippets.map((sn) => (sn.id === id ? updated : sn)),
      saving: true,
    }))

    // 2. Debounce DB save
    if (saveTimers.has(id)) {
      clearTimeout(saveTimers.get(id))
    }

    pendingSaves.set(id, { updated, original, version: ++saveVersion })
    const timer = setTimeout(() => void get().flushPending(id), 500)

    saveTimers.set(id, timer)
  },

  flushPending: async (id) => {
    if (clearing && !flushingForClear) return
    const ids = id ? [id] : [...pendingSaves.keys()]
    for (const pendingId of ids) {
      if (clearing && !flushingForClear) break
      const pending = pendingSaves.get(pendingId)
      if (!pending || savingIds.has(pendingId)) continue
      const timer = saveTimers.get(pendingId)
      if (timer) clearTimeout(timer)
      saveTimers.delete(pendingId)
      savingIds.add(pendingId)
      try {
        const save = saveSnippet(pending.updated)
        inFlightSaves.set(pendingId, save)
        inFlightMutations.add(save)
        await save
        if (pendingSaves.get(pendingId)?.version === pending.version) {
          pendingSaves.delete(pendingId)
        }
      } catch (err) {
        if (pendingSaves.get(pendingId)?.version === pending.version) {
          pendingSaves.delete(pendingId)
          set((state) => ({
            snippets: state.snippets.map((snippet) =>
              snippet.id === pendingId ? pending.original : snippet
            ),
          }))
        }
        const msg = err instanceof Error ? err.message : String(err)
        useUiStore.getState().addToast('Failed to save snippet: ' + msg, 'error')
      } finally {
        savingIds.delete(pendingId)
        inFlightMutations.delete(inFlightSaves.get(pendingId) ?? Promise.resolve())
        if (inFlightSaves.get(pendingId)) inFlightSaves.delete(pendingId)
      }
      if (pendingSaves.has(pendingId)) {
        await get().flushPending(pendingId)
      }
    }
    if (pendingSaves.size === 0 && savingIds.size === 0) set({ saving: false })
  },

  remove: (id) => {
    deletingIds.add(id)
    let operation: Promise<void>
    operation = (async () => {
      // Persist the latest debounce before setting the tombstone so restoring never
      // brings back an older version of the snippet.
      await get().flushPending(id)
      set({ saving: true })
      try {
        await deleteSnippet(id)
        const [snippets, trashedSnippets] = await Promise.all([
          loadSnippets(),
          loadTrashedSnippets(),
        ])
        set({
          snippets,
          trashedSnippets,
          saving: saveTimers.size > 0,
        })
      } catch (err) {
        set({ saving: saveTimers.size > 0 })
        const msg = err instanceof Error ? err.message : String(err)
        useUiStore.getState().addToast('Failed to delete snippet: ' + msg, 'error')
        throw err
      } finally {
        deletingIds.delete(id)
      }
    })()
    inFlightMutations.add(operation)
    const finish = () => inFlightMutations.delete(operation)
    void operation.then(finish, finish)
    return operation
  },

  restore: async (id) => {
    if (clearing) throw new Error('Cannot restore a snippet while clearing the library')
    if (deletingIds.has(id)) throw new Error('Cannot restore a snippet while deleting it')
    set({ saving: true })
    try {
      await restoreSnippet(id)
      const [snippets, trashedSnippets] = await Promise.all([loadSnippets(), loadTrashedSnippets()])
      set({
        snippets,
        trashedSnippets,
        saving: pendingSaves.size > 0,
      })
    } catch (err) {
      set({ saving: pendingSaves.size > 0 })
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to restore snippet: ' + msg, 'error')
      throw err
    }
  },

  permanentlyDelete: async (id) => {
    await permanentlyDeleteSnippet(id)
    set((state) => ({
      trashedSnippets: state.trashedSnippets.filter((snippet) => snippet.id !== id),
    }))
  },

  clearAll: async () => {
    if (clearing) return
    clearing = true
    flushingForClear = true
    libraryGeneration++
    try {
      // Trash is recoverable, so persist every pending edit before tombstoning
      // the library instead of discarding the debounce queue.
      await get().flushPending()
      await Promise.allSettled(inFlightMutations)
      savingIds.clear()
      inFlightSaves.clear()
      set({ saving: true })
      await clearAllSnippets()
      const trashedSnippets = await loadTrashedSnippets()
      set({ snippets: [], trashedSnippets, saving: false })
    } finally {
      flushingForClear = false
      clearing = false
    }
  },
}))
