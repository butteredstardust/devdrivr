import { create } from 'zustand'

/**
 * In-memory cache of tool states. Prevents re-loading from SQLite
 * when switching between tools within a session.
 */
type ToolStateCache = {
  cache: Map<string, Record<string, unknown>>
  /** Bumped per key by `seed()`. See the comment on `seed`. */
  seeds: Map<string, number>
  /** Keys whose owning tab is gone. See `discard`. */
  discarded: Set<string>
  set: (toolId: string, state: Record<string, unknown>) => void
  get: (toolId: string) => Record<string, unknown> | undefined
  seed: (toolId: string, patch: Record<string, unknown>) => void
  discard: (toolId: string) => void
  isDiscarded: (toolId: string) => boolean
}

export const useToolStateCache = create<ToolStateCache>()((set, get) => ({
  cache: new Map(),
  seeds: new Map(),
  discarded: new Set(),
  set: (toolId, state) =>
    set((s) => {
      const next = new Map(s.cache)
      next.set(toolId, state)
      return { cache: next }
    }),
  get: (toolId) => get().cache.get(toolId),
  // A cross-tool handoff, as opposed to a tool writing its own state through.
  // `useToolState` reads the cache when it mounts, which was enough while
  // switching tools unmounted the destination; a kept-alive tool is already
  // mounted and would never look again. The counter is what it watches — the
  // value alone cannot be watched, since a tool's own writes land here too and
  // reacting to those would fight the component's state.
  seed: (toolId, patch) =>
    set((s) => {
      const cache = new Map(s.cache)
      cache.set(toolId, { ...cache.get(toolId), ...patch })
      const seeds = new Map(s.seeds)
      seeds.set(toolId, (seeds.get(toolId) ?? 0) + 1)
      return { cache, seeds }
    }),
  // Closing a tab forgets its state. Marking the key first matters: closing
  // unmounts the pane, and `useToolState`'s unmount save would otherwise write
  // the row straight back after the delete. Scoped keys are never reused, so
  // the mark can stand for the rest of the session.
  discard: (toolId) =>
    set((s) => {
      const cache = new Map(s.cache)
      cache.delete(toolId)
      return { cache, discarded: new Set(s.discarded).add(toolId) }
    }),
  isDiscarded: (toolId) => get().discarded.has(toolId),
}))
