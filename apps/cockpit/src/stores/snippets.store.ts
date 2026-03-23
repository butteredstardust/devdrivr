import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Snippet } from '@/types/models'
import { loadSnippets, saveSnippet, deleteSnippet, clearAllSnippets } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

type SnippetsStore = {
  snippets: Snippet[]
  initialized: boolean
  saving: boolean
  init: () => Promise<void>
  add: (title: string, content: string, language: string, tags?: string[]) => Promise<Snippet>
  update: (id: string, patch: Partial<Pick<Snippet, 'title' | 'content' | 'language' | 'tags'>>) => Promise<void>
  remove: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

let initPromise: Promise<void> | null = null
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useSnippetsStore = create<SnippetsStore>()((set, get) => ({
  snippets: [],
  initialized: false,
  saving: false,

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const snippets = await loadSnippets()
        set({ snippets, initialized: true })
      })()
    }
    return initPromise
  },

  add: async (title, content, language, tags = []) => {
    const now = Date.now()
    const snippet: Snippet = {
      id: nanoid(),
      title,
      content,
      language,
      tags,
      createdAt: now,
      updatedAt: now,
    }
    set({ saving: true })
    try {
      await saveSnippet(snippet)
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
    const snippets = get().snippets
    const idx = snippets.findIndex((s) => s.id === id)
    if (idx < 0) return
    const oldSnippet = snippets[idx]!
    const updated = { ...oldSnippet, ...patch, updatedAt: Date.now() }

    // 1. Update state immediately (optimistic)
    set((s) => ({
      snippets: s.snippets.map((sn) => (sn.id === id ? updated : sn)),
      saving: true,
    }))

    // 2. Debounce DB save
    if (saveTimers.has(id)) {
      clearTimeout(saveTimers.get(id))
    }

    const timer = setTimeout(async () => {
      saveTimers.delete(id)
      try {
        await saveSnippet(updated)
      } catch (err) {
        // Revert optimistic update
        set((s) => ({
          snippets: s.snippets.map((sn) => (sn.id === id ? oldSnippet : sn)),
        }))
        const msg = err instanceof Error ? err.message : String(err)
        useUiStore.getState().addToast('Failed to save snippet: ' + msg, 'error')
      }
      // Only set saving to false if no other timers are pending
      if (saveTimers.size === 0) {
        set({ saving: false })
      }
    }, 500)

    saveTimers.set(id, timer)
  },

  remove: async (id) => {
    if (saveTimers.has(id)) {
      clearTimeout(saveTimers.get(id))
      saveTimers.delete(id)
    }
    set({ saving: true })
    try {
      await deleteSnippet(id)
    } catch (err) {
      set({ saving: saveTimers.size > 0 })
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to delete snippet: ' + msg, 'error')
      throw err
    }
    set((s) => ({
      snippets: s.snippets.filter((sn) => sn.id !== id),
      saving: saveTimers.size > 0,
    }))
  },

  clearAll: async () => {
    for (const timer of saveTimers.values()) {
      clearTimeout(timer)
    }
    saveTimers.clear()
    set({ saving: true })
    await clearAllSnippets()
    set({ snippets: [], saving: false })
  },
}))
