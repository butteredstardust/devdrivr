import { create } from 'zustand'

/**
 * In-memory cache of tool states. Prevents re-loading from SQLite
 * when switching between tools within a session.
 */
type ToolStateCache = {
  cache: Map<string, Record<string, unknown>>
  set: (toolId: string, state: Record<string, unknown>) => void
  get: (toolId: string) => Record<string, unknown> | undefined
}

export const useToolStateCache = create<ToolStateCache>()((set, get) => ({
  cache: new Map(),
  set: (toolId, state) =>
    set((s) => {
      const next = new Map(s.cache)
      next.set(toolId, state)
      return { cache: next }
    }),
  get: (toolId) => get().cache.get(toolId),
}))
