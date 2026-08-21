import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Snippet } from '@/types/models'
import { loadSnippets, saveSnippet, deleteSnippet, clearAllSnippets } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

type SnippetsStore = {
  snippets: Snippet[]
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
    favorite?: boolean
  ) => Promise<Snippet>
  update: (
    id: string,
    patch: Partial<Pick<Snippet, 'title' | 'content' | 'language' | 'tags' | 'folder' | 'favorite'>>
  ) => Promise<void>
  flushPending: (id?: string) => Promise<void>
  remove: (id: string) => Promise<void>
  restore: (snippet: Snippet) => Promise<void>
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
let libraryGeneration = 0
let saveVersion = 0

export const useSnippetsStore = create<SnippetsStore>()((set, get) => ({
  snippets: [],
  initialized: false,
  saving: false,
  activeFolder: '',
  setActiveFolder: (folder) => set({ activeFolder: folder }),

  init: async () => {
    if (!initPromise) {
      const generation = libraryGeneration
      initPromise = (async () => {
        const snippets = await loadSnippets()
        if (generation !== libraryGeneration) {
          initPromise = null
          return
        }
        set({ snippets, initialized: true })
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
    const snippets = await loadSnippets()
    if (generation === libraryGeneration) set({ snippets, initialized: true })
  },

  add: async (title, content, language, tags = [], folder = '', favorite = false) => {
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
    if (clearing) return
    const ids = id ? [id] : [...pendingSaves.keys()]
    for (const pendingId of ids) {
      if (clearing) break
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
    if (saveTimers.has(id)) {
      clearTimeout(saveTimers.get(id))
      saveTimers.delete(id)
    }
    pendingSaves.delete(id)
    let operation: Promise<void>
    operation = (async () => {
      const inFlight = inFlightSaves.get(id)
      if (inFlight) {
        try {
          await inFlight
        } catch {
          // The flush path already reports the failed save; deletion should still proceed.
        }
      }
      set({ saving: true })
      try {
        await deleteSnippet(id)
        set((s) => ({
          snippets: s.snippets.filter((sn) => sn.id !== id),
          saving: saveTimers.size > 0,
        }))
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

  restore: async (snippet) => {
    if (clearing) throw new Error('Cannot restore a snippet while clearing the library')
    if (deletingIds.has(snippet.id)) throw new Error('Cannot restore a snippet while deleting it')
    set({ saving: true })
    try {
      const save = saveSnippet(snippet)
      inFlightMutations.add(save)
      try {
        await save
      } finally {
        inFlightMutations.delete(save)
      }
      set((state) => ({
        snippets: state.snippets.some((existing) => existing.id === snippet.id)
          ? state.snippets.map((existing) => (existing.id === snippet.id ? snippet : existing))
          : [snippet, ...state.snippets],
        saving: pendingSaves.size > 0,
      }))
    } catch (err) {
      set({ saving: pendingSaves.size > 0 })
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to restore snippet: ' + msg, 'error')
      throw err
    }
  },

  clearAll: async () => {
    clearing = true
    libraryGeneration++
    for (const timer of saveTimers.values()) {
      clearTimeout(timer)
    }
    saveTimers.clear()
    pendingSaves.clear()
    await Promise.allSettled(inFlightMutations)
    savingIds.clear()
    inFlightSaves.clear()
    set({ saving: true })
    try {
      await clearAllSnippets()
      set({ snippets: [], saving: false })
    } finally {
      clearing = false
    }
  },
}))
