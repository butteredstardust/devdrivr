import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { HistoryEntry } from '@/types/models'
import { loadHistory, addHistoryEntry, pruneHistory, clearAllHistory } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

type HistoryStore = {
  entries: HistoryEntry[]
  initialized: boolean
  init: () => Promise<void>
  add: (tool: string, input: string, output: string, subTab?: string) => Promise<void>
  loadForTool: (tool: string) => Promise<HistoryEntry[]>
  reload: () => Promise<void>
  clearAll: () => Promise<void>
}

let initPromise: Promise<void> | null = null

export const useHistoryStore = create<HistoryStore>()((set) => ({
  entries: [],
  initialized: false,

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const entries = await loadHistory(undefined, 200)
        set({ entries, initialized: true })
      })()
    }
    return initPromise
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
    try {
      await addHistoryEntry(entry)
      // Prune to keep max 500 per tool
      await pruneHistory(tool, 500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save history: ' + msg, 'error')
    }
    // Always update local state — history is ephemeral
    set((s) => ({ entries: [entry, ...s.entries].slice(0, 200) }))
  },

  loadForTool: async (tool) => {
    return loadHistory(tool, 100)
  },

  reload: async () => {
    const entries = await loadHistory(undefined, 200)
    set({ entries })
  },

  clearAll: async () => {
    await clearAllHistory()
    set({ entries: [] })
  },
}))
