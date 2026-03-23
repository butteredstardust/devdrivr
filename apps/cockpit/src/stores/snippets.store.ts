import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Snippet } from '@/types/models'
import { loadSnippets, saveSnippet, deleteSnippet, clearAllSnippets } from '@/lib/db'

type SnippetsStore = {
  snippets: Snippet[]
  initialized: boolean
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
    await saveSnippet(snippet)
    set((s) => ({ snippets: [snippet, ...s.snippets] }))
    return snippet
  },

  update: async (id, patch) => {
    const snippets = get().snippets
    const idx = snippets.findIndex((s) => s.id === id)
    if (idx < 0) return
    const updated = { ...snippets[idx]!, ...patch, updatedAt: Date.now() }

    // 1. Update state immediately (optimistic)
    set((s) => ({
      snippets: s.snippets.map((sn) => (sn.id === id ? updated : sn)),
    }))

    // 2. Debounce DB save
    if (saveTimers.has(id)) {
      clearTimeout(saveTimers.get(id))
    }

    const timer = setTimeout(async () => {
      saveTimers.delete(id)
      await saveSnippet(updated)
    }, 500)

    saveTimers.set(id, timer)
  },

  remove: async (id) => {
    if (saveTimers.has(id)) {
      clearTimeout(saveTimers.get(id))
      saveTimers.delete(id)
    }
    await deleteSnippet(id)
    set((s) => ({ snippets: s.snippets.filter((sn) => sn.id !== id) }))
  },

  clearAll: async () => {
    for (const timer of saveTimers.values()) {
      clearTimeout(timer)
    }
    saveTimers.clear()
    await clearAllSnippets()
    set({ snippets: [] })
  },
}))
