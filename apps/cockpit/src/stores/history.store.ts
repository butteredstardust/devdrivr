import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { HistoryEntry } from '@/types/models'
import { loadHistory, addHistoryEntry, pruneHistory } from '@/lib/db'

type HistoryStore = {
  entries: HistoryEntry[]
  initialized: boolean
  init: () => Promise<void>
  add: (tool: string, input: string, output: string, subTab?: string) => Promise<void>
  loadForTool: (tool: string) => Promise<HistoryEntry[]>
  reload: () => Promise<void>
}

export const useHistoryStore = create<HistoryStore>()((set) => ({
  entries: [],
  initialized: false,

  init: async () => {
    const entries = await loadHistory(undefined, 200)
    set({ entries, initialized: true })
  },

  add: async (tool, input, output, subTab) => {
    const entry: HistoryEntry = {
      id: nanoid(),
      tool,
      input,
      output,
      timestamp: Date.now(),
    }
    if (subTab != null) {
      entry.subTab = subTab
    }
    await addHistoryEntry(entry)
    // Prune to keep max 500 per tool
    await pruneHistory(tool, 500)
    set((s) => ({ entries: [entry, ...s.entries].slice(0, 200) }))
  },

  loadForTool: async (tool) => {
    return loadHistory(tool, 100)
  },

  reload: async () => {
    const entries = await loadHistory(undefined, 200)
    set({ entries })
  },
}))
