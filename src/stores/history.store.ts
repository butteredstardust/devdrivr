import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { HistoryEntry } from '@/types/models'
import { loadHistory, addHistoryEntry, pruneHistory, clearAllHistory, getDb } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'

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

/**
 * Size of the in-memory `entries` list, which spans every tool.
 *
 * This is not `historyRetentionPerTool`. That setting caps the rows kept in the database for one
 * tool; this caps the combined list the shell renders from. Deriving one from the other shrinks
 * the whole list to a single tool's allowance, and disagrees with the two `loadHistory` calls
 * below that read this same cap.
 */
const MEMORY_ENTRY_CAP = 200

let initPromise: Promise<void> | null = null

export const useHistoryStore = create<HistoryStore>()((set) => ({
  entries: [],
  initialized: false,

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const entries = await loadHistory(undefined, MEMORY_ENTRY_CAP)
        set({ entries, initialized: true })
      })().catch((err: unknown) => {
        // Clear the cached promise on failure so a later call retries
        // instead of latching a transient error for the process lifetime.
        initPromise = null
        throw err
      })
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
      const { historyRetentionPerTool } = useSettingsStore.getState()
      await pruneHistory(tool, historyRetentionPerTool)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save history: ' + msg, 'error')
    }
    // Always update local state — history is ephemeral
    set((s) => ({ entries: [entry, ...s.entries].slice(0, MEMORY_ENTRY_CAP) }))
  },

  loadForTool: async (tool) => {
    return loadHistory(tool, 100)
  },

  reload: async () => {
    const entries = await loadHistory(undefined, MEMORY_ENTRY_CAP)
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
