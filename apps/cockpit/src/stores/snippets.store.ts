import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Snippet } from '@/types/models'
import { loadSnippets, saveSnippet, deleteSnippet } from '@/lib/db'

type SnippetsStore = {
  snippets: Snippet[]
  initialized: boolean
  init: () => Promise<void>
  add: (title: string, content: string, language: string, tags?: string[]) => Promise<Snippet>
  update: (id: string, patch: Partial<Pick<Snippet, 'title' | 'content' | 'language' | 'tags'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useSnippetsStore = create<SnippetsStore>()((set, get) => ({
  snippets: [],
  initialized: false,

  init: async () => {
    const snippets = await loadSnippets()
    set({ snippets, initialized: true })
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
    await saveSnippet(updated)
    set((s) => ({
      snippets: s.snippets.map((sn) => (sn.id === id ? updated : sn)),
    }))
  },

  remove: async (id) => {
    await deleteSnippet(id)
    set((s) => ({ snippets: s.snippets.filter((sn) => sn.id !== id) }))
  },
}))
