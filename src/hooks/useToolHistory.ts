import { useCallback, useRef, useEffect, useMemo } from 'react'
import { useHistoryStore } from '@/stores/history.store'

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
  /** Duration in milliseconds */
  durationMs?: number
  /** Optional callback for additional metadata */
  metadata?: { outputSize?: number }
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

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingEntry = useRef<HistoryEntryInput | null>(null)
  const lastRecordedKey = useRef<string | null>(null)
  const userEdited = useRef(false)

  const entryKey = useCallback(
    (entry: HistoryEntryInput) =>
      JSON.stringify([
        entry.input,
        entry.output,
        entry.subTab ?? '',
        entry.success ?? true,
        entry.error ?? '',
      ]),
    []
  )

  const flushPending = useCallback(() => {
    if (!pendingEntry.current) return

    const entry = pendingEntry.current
    pendingEntry.current = null

    if (entry.input.length < minInputLength) return

    const key = entryKey(entry)
    if (key === lastRecordedKey.current) return
    lastRecordedKey.current = key
    userEdited.current = false

    const output = entry.output.slice(0, maxOutputLength)
    const failed = entry.success === false

    void addToHistory(
      toolId,
      entry.input.slice(0, maxOutputLength),
      failed ? entry.error || 'failed' : output,
      entry.subTab,
      entry.durationMs,
      !failed,
      entry.metadata?.outputSize ?? output.length
    )
  }, [addToHistory, toolId, minInputLength, maxOutputLength, entryKey])

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

      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = null
      pendingEntry.current = null

      const key = entryKey(entry)
      if (key === lastRecordedKey.current) return
      lastRecordedKey.current = key
      userEdited.current = false

      const output = entry.output.slice(0, maxOutputLength)
      const failed = entry.success === false

      void addToHistory(
        toolId,
        entry.input.slice(0, maxOutputLength),
        failed ? entry.error || 'failed' : output,
        entry.subTab,
        entry.durationMs,
        !failed,
        entry.metadata?.outputSize ?? output.length
      )
    },
    [addToHistory, toolId, minInputLength, maxOutputLength, entryKey]
  )

  const markUserEdit = useCallback(() => {
    userEdited.current = true
  }, [])

  const recordEdited = useCallback(
    (entry: HistoryEntryInput) => {
      if (userEdited.current) recordHistory(entry)
    },
    [recordHistory]
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
      recordEdited,
      markUserEdit,
      flush: flushPending,
      startTiming,
      /**
       * Convenience method that takes a computed result.
       * Only records if input is valid and min length is met.
       */
      maybeRecord: (
        input: string | null | undefined,
        output: string,
        opts?: { subTab?: string; success?: boolean; error?: string }
      ) => {
        if (!input || input.length < minInputLength) return
        recordHistory({
          input,
          output,
          ...(opts?.subTab != null ? { subTab: opts.subTab } : {}),
          success: opts?.success ?? true,
          ...(opts?.error != null ? { error: opts.error } : {}),
        })
      },
    }),
    [
      flushPending,
      minInputLength,
      recordHistory,
      recordHistoryImmediate,
      recordEdited,
      markUserEdit,
      startTiming,
    ]
  )
}
