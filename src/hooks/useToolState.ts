import { useCallback, useEffect, useRef, useState } from 'react'
import { loadToolState } from '@/lib/db'
import { useToolStateCache } from '@/stores/tool-state.store'
import { useToolInstance } from '@/app/tool-instance'
import { registerFlusher } from '@/lib/flush-on-exit'
import { droppedToolStateKeys, mergeToolState } from '@/lib/tool-state-merge'
import { saveToolStateWithFeedback } from '@/lib/tool-state-persistence'

type ToolStateOptions<T> = {
  validate?: (merged: T) => T
}

const warnedDrops = new Set<string>()

function warnDroppedValue(toolId: string, key: string): void {
  if (!import.meta.env.DEV) return
  const warningId = `${toolId}:${key}`
  if (warnedDrops.has(warningId)) return
  warnedDrops.add(warningId)
  console.warn(`[useToolState] Dropped invalid saved value for "${toolId}.${key}".`)
}

function valuesMatch(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

function restoreToolState<T extends Record<string, unknown>>(
  toolId: string,
  defaults: T,
  saved: unknown,
  validate?: (merged: T) => T
): T {
  for (const key of droppedToolStateKeys(defaults, saved)) warnDroppedValue(toolId, key)

  const merged = mergeToolState(defaults, saved)
  if (!validate) return merged

  try {
    const validated = validate(merged)
    for (const key of Object.keys(defaults)) {
      if (!valuesMatch(merged[key], validated[key])) warnDroppedValue(toolId, key)
    }
    return validated
  } catch {
    warnDroppedValue(toolId, 'validator')
    return merged
  }
}

/**
 * Persists tool-specific state to SQLite.
 * State survives tool switches (in-memory cache) and app restarts (SQLite).
 * Debounces writes to SQLite by 2 seconds.
 *
 * On mount the in-memory cache is checked first (synchronous). SQLite is only
 * hit on cold start when no cached value exists. Every update writes through
 * to the cache immediately, which eliminates the race condition where a rapid
 * switch-away-and-back could load stale state from SQLite before the unmount
 * save completes.
 *
 * On the cold path the user can type before the read resolves. Local edits always win:
 * a resolving load is dropped once the state is dirty, and the unmount save runs for
 * dirty state even if the read never resolved.
 */
export function useToolState<T extends Record<string, unknown>>(
  requestedId: string,
  defaultState: T,
  options?: ToolStateOptions<T>
): [T, (patch: Partial<T>) => void] {
  // Two tabs of the same tool must not share a row, so the tab decides the
  // key. The first tab of a tool is given the bare tool id, which is why
  // state saved before duplicate tabs existed is still found. Rendered
  // outside a tab (tests, previews) the tool id stands in.
  const instance = useToolInstance()
  const toolId = instance?.stateKey ?? requestedId

  const cacheGet = useToolStateCache((s) => s.get)
  const cacheSet = useToolStateCache((s) => s.set)
  const cachedAtMountRef = useRef(cacheGet(toolId))
  const hadCachedStateRef = useRef(cachedAtMountRef.current !== undefined)

  // Initialise from in-memory cache (synchronous) if available
  const [state, setState] = useState<T>(() => {
    if (hadCachedStateRef.current) {
      return restoreToolState(toolId, defaultState, cachedAtMountRef.current, options?.validate)
    }
    return defaultState
  })
  const stateRef = useRef(state)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(hadCachedStateRef.current)
  // True once the user has changed state via update(). Guards the cold-start race
  // where a slow loadToolState() resolves after the user has already typed.
  const dirtyRef = useRef(false)

  const flushPending = useCallback(async () => {
    if (!timerRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = null
    if (useToolStateCache.getState().isDiscarded(toolId)) return
    await saveToolStateWithFeedback(toolId, stateRef.current)
  }, [toolId])

  // Load from SQLite on mount only if no cached value
  useEffect(() => {
    if (loadedRef.current) return // already initialised from cache
    let cancelled = false
    loadToolState(toolId).then((saved) => {
      if (cancelled) return
      // The user edited while the read was in flight — drop the load entirely rather
      // than merging untouched keys. Tool state fields are interdependent (e.g. a regex
      // pattern and its flags, or a request body and its content-type header), so a
      // partial merge would splice last session's values into the state the user is
      // actively editing and produce a combination that never existed. Live input wins.
      if (dirtyRef.current) {
        loadedRef.current = true
        return
      }
      if (saved !== null) {
        const merged = restoreToolState(toolId, defaultState, saved, options?.validate)
        setState(merged)
        stateRef.current = merged
        cacheSet(toolId, merged)
      }
      loadedRef.current = true
    })
    return () => {
      cancelled = true
    }
    // The defaults and validator only apply to the first load. Callers pass them inline.
  }, [toolId]) // eslint-disable-line react-hooks/exhaustive-deps

  // A handoff from another tool (`sendToTool`) merges into the cache and increments this counter.
  // Background destinations stay mounted, so the counter signals cache changes to them.
  const seedRevision = useToolStateCache((s) => s.seeds.get(toolId) ?? 0)
  const seenSeedRef = useRef(seedRevision)
  useEffect(() => {
    if (seedRevision === seenSeedRef.current) return
    seenSeedRef.current = seedRevision
    const seeded = cacheGet(toolId)
    if (seeded === undefined) return
    const merged = restoreToolState(toolId, defaultState, seeded, options?.validate)
    setState(merged)
    stateRef.current = merged
    // The handoff is the user's intent as much as typing is: a pending cold
    // read must not overwrite it, and it has to reach SQLite. Saved here rather
    // than left to the unmount save, which never runs if the app is quit.
    loadedRef.current = true
    dirtyRef.current = true
    void saveToolStateWithFeedback(toolId, merged).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- The defaults and validator are inline values.
  }, [seedRevision, toolId, cacheGet])

  // Debounced save to SQLite (cache is updated synchronously)
  const update = useCallback(
    (patch: Partial<T>) => {
      dirtyRef.current = true
      setState((prev) => {
        const next = { ...prev, ...patch }
        stateRef.current = next
        cacheSet(toolId, next)
        return next
      })

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void saveToolStateWithFeedback(toolId, stateRef.current).catch(() => {})
      }, 2000)
    },
    [toolId, cacheSet]
  )

  useEffect(() => registerFlusher(flushPending), [flushPending])

  // Save immediately on unmount (cache already up to date).
  // `dirtyRef` is checked alongside `loadedRef` so edits made while the initial read
  // was still in flight are persisted instead of being silently discarded.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      // The tab was closed, not backgrounded — its row is on its way out and
      // saving here would put it straight back.
      if (useToolStateCache.getState().isDiscarded(toolId)) return
      if (loadedRef.current || dirtyRef.current) {
        void saveToolStateWithFeedback(toolId, stateRef.current).catch(() => {})
      }
    }
  }, [toolId])

  return [state, update]
}
