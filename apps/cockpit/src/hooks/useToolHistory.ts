import { useCallback, useRef, useEffect, useMemo } from 'react'
import { useHistoryStore } from '@/stores/history.store'
import { useUiStore } from '@/stores/ui.store'

export interface ToolHistoryConfig {
  /** Tool identifier */
  toolId: string
  /** How long to debounce history writes (ms) */
  debounceMs?: number
  /** Minimum input length before recording history */
  minInputLength?: number
  /** Max output length to store (truncation limit) */
  maxOutputLength?: number
  /** Whether to include duration tracking */
  trackDuration?: boolean
}

export interface HistoryEntryInput {
  input: string
  output: string
  subTab?: string
  success?: boolean
  error?: string
}

/**
 * Hook for automatically saving tool operations to history.
 *
 * Usage:
 * ```tsx
 * const { recordHistory, startTiming } = useToolHistory({toolId: 'base64'})
 *
 * // When operation completes:
 * const stopTiming = startTiming()
 * const output = computeResult()
 * recordHistory({input, output, success: true})
 * ```
 *
 * Alternatively use the singleton pattern for simple cases:
 * ```tsx
 * const history = useToolHistory({toolId: 'base64'})
 * history.record({input, output, success: true})
 * ```
 */
export function useToolHistory(config: ToolHistoryConfig) {
  const { toolId, debounceMs = 300, minInputLength = 1, maxOutputLength = 50_000 } = config

  const addToHistory = useHistoryStore((s) => s.add)
  const setLastAction = useUiStore((s) => s.setLastAction)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingEntry = useRef<HistoryEntryInput | null>(null)

  const flushPending = useCallback(() => {
    if (!pendingEntry.current) return

    const entry = pendingEntry.current
    pendingEntry.current = null

    if (entry.input.length < minInputLength) return

    const output = entry.output.slice(0, maxOutputLength)
    const failed = entry.success === false

    void addToHistory(
      toolId,
      entry.input.slice(0, maxOutputLength),
      failed ? entry.error || 'failed' : output,
      entry.subTab
    ).then(() => {
      if (failed) return // Don't show success toast on failure
      // Toast is optional - uncomment if needed
      // setLastAction('Saved to history', 'success')
    })
  }, [addToHistory, toolId, minInputLength, maxOutputLength, setLastAction])

  const recordHistory = useCallback(
    (entry: HistoryEntryInput) => {
      pendingEntry.current = entry

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }

      debounceTimer.current = setTimeout(flushPending, debounceMs)
    },
    [debounceMs, flushPending]
  )

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
        flushPending()
      }
    }
  }, [flushPending])

  /**
   * Records history immediately (no debounce).
   * Use for explicit user actions like "save" buttons.
   */
  const recordHistoryImmediate = useCallback(
    (entry: HistoryEntryInput) => {
      if (entry.input.length < minInputLength) return

      const output = entry.output.slice(0, maxOutputLength)
      const failed = entry.success === false

      void addToHistory(
        toolId,
        entry.input.slice(0, maxOutputLength),
        failed ? entry.error || 'failed' : output,
        entry.subTab
      )
    },
    [addToHistory, toolId, minInputLength, maxOutputLength]
  )

  /**
   * Creates a timer for tracking operation duration.
   * Returns a function that returns elapsed ms.
   */
  const startTiming = useCallback(() => {
    const start = performance.now()
    return () => Math.round(performance.now() - start)
  }, [])

  return useMemo(
    () => ({
      record: recordHistory,
      recordImmediate: recordHistoryImmediate,
      flush: flushPending,
      startTiming,
      /**
       * Convenience method that takes a computed result.
       * Only records if input is valid and min length is met.
       */
      maybeRecord: (input: string | null | undefined, output: string, opts?: { subTab?: string; success?: boolean; error?: string }) => {
        if (!input || input.length < minInputLength) return
        recordHistory({
          input,
          output,
          subTab: opts?.subTab,
          success: opts?.success ?? true,
          error: opts?.error,
        })
      },
    }),
    [flushPending, minInputLength, recordHistory, recordHistoryImmediate, startTiming]
  )
}
