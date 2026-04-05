import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { HistoryEntry } from '@/types/models'
import { loadHistory, addHistoryEntry, pruneHistory, clearAllHistory, getDb } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

type HistoryStore = {
  entries: HistoryEntry[]
  initialized: boolean
  init: () => Promise<void>
  add: (
    tool: string,
    input: string,
    output: string,
    subTab?: string,
    durationMs?: number,
    success?: boolean,
    outputSize?: number
  ) => Promise<void>
  loadForTool: (tool: string) => Promise<HistoryEntry[]>
  reload: () => Promise<void>
  clearAll: () => Promise<void>
  starEntry: (id: string) => Promise<void>
  unstarEntry: (id: string) => Promise<void>
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

  add: async (tool, input, output, subTab, durationMs, success, outputSize) => {
    const entry: HistoryEntry = {
      id: nanoid(),
      tool,
      input,
      output,
      timestamp: Date.now(),
      ...(subTab != null ? { subTab } : {}),
      ...(durationMs != null ? { durationMs } : {}),
      success: success ?? true,
      outputSize: outputSize ?? output.length,
      starred: false,
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

  starEntry: async (id: string) => {
    // Update backend
    const conn = await getDb()
    await conn.execute('UPDATE history SET starred = 1 WHERE id = $1', [id])
    // Update local state
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, starred: true } : e)),
    }))
  },

  unstarEntry: async (id: string) => {
    const conn = await getDb()
    await conn.execute('UPDATE history SET starred = 0 WHERE id = $1', [id])
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, starred: false } : e)),
    }))
  },
}))
