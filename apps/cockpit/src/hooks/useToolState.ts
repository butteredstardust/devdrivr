import { useCallback, useEffect, useRef, useState } from 'react'
import { loadToolState, saveToolState } from '@/lib/db'

/**
 * Persists tool-specific state to SQLite.
 * State survives tool switches (in-memory) and app restarts (SQLite).
 * Debounces writes to SQLite by 2 seconds.
 */
export function useToolState<T extends Record<string, unknown>>(
  toolId: string,
  defaultState: T
): [T, (patch: Partial<T>) => void] {
  const [state, setState] = useState<T>(defaultState)
  const stateRef = useRef(state)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(false)

  // Load from SQLite on mount
  useEffect(() => {
    let cancelled = false
    loadToolState(toolId).then((saved) => {
      if (cancelled) return
      if (saved) {
        const merged = { ...defaultState, ...saved } as T
        setState(merged)
        stateRef.current = merged
      }
      loadedRef.current = true
    })
    return () => { cancelled = true }
  // Intentionally exclude `defaultState` from deps — it's only needed for the initial
  // merge on mount. Including it would cause re-fetches on every render since callers
  // pass inline object literals.
  }, [toolId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced save to SQLite
  const update = useCallback(
    (patch: Partial<T>) => {
      setState((prev) => {
        const next = { ...prev, ...patch }
        stateRef.current = next
        return next
      })

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        saveToolState(toolId, stateRef.current)
      }, 2000)
    },
    [toolId]
  )

  // Save immediately on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (loadedRef.current) {
        saveToolState(toolId, stateRef.current)
      }
    }
  }, [toolId])

  return [state, update]
}
