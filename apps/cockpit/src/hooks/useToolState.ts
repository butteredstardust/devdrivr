import { useCallback, useEffect, useRef, useState } from 'react'
import { loadToolState, saveToolState } from '@/lib/db'
import { useToolStateCache } from '@/stores/tool-state.store'

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
  toolId: string,
  defaultState: T
): [T, (patch: Partial<T>) => void] {
  const cacheGet = useToolStateCache((s) => s.get)
  const cacheSet = useToolStateCache((s) => s.set)

  // Initialise from in-memory cache (synchronous) if available
  const [state, setState] = useState<T>(() => {
    const cached = cacheGet(toolId)
    if (cached) return { ...defaultState, ...cached } as T
    return defaultState
  })
  const stateRef = useRef(state)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(!!cacheGet(toolId))
  // True once the user has changed state via update(). Guards the cold-start race
  // where a slow loadToolState() resolves after the user has already typed.
  const dirtyRef = useRef(false)

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
      if (saved) {
        const merged = { ...defaultState, ...saved } as T
        setState(merged)
        stateRef.current = merged
        cacheSet(toolId, merged)
      }
      loadedRef.current = true
    })
    return () => {
      cancelled = true
    }
    // Intentionally exclude `defaultState` from deps — it's only needed for the initial
    // merge on mount. Including it would cause re-fetches on every render since callers
    // pass inline object literals.
  }, [toolId]) // eslint-disable-line react-hooks/exhaustive-deps

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
        saveToolState(toolId, stateRef.current)
      }, 2000)
    },
    [toolId, cacheSet]
  )

  // Save immediately on unmount (cache already up to date).
  // `dirtyRef` is checked alongside `loadedRef` so edits made while the initial read
  // was still in flight are persisted instead of being silently discarded.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (loadedRef.current || dirtyRef.current) {
        saveToolState(toolId, stateRef.current)
      }
    }
  }, [toolId])

  return [state, update]
}
