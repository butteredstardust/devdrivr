import { useEffect, useRef, useState } from 'react'
import RegexWorkerFactory from '@/workers/regex.worker?worker'
import { emptyEvaluation } from '@/workers/regex.api'
import type { RegexEvaluation, RegexEvaluationInput } from '@/workers/regex.api'

/**
 * Evaluates a user-supplied regex in a worker under a hard time budget.
 *
 * Why not `useWorker`: that hook owns a worker for the lifetime of the component and only
 * terminates it on unmount. A pattern with catastrophic backtracking never yields, so the
 * only recovery is `terminate()` + respawn — a lifecycle `useWorker` has no concept of.
 * Adding it there would change the contract for its six existing consumers (a rejected
 * request would no longer imply a live worker), so this tool gets its own hook instead.
 *
 * Guarantees:
 * - Exactly one in-flight request; stale replies are ignored by request id.
 * - On timeout the worker is terminated (killing the runaway match), respawned, and the
 *   caller gets an explicit `timeout` status — never a silently empty result.
 * - Inputs that timed out are remembered, so persisted tool state cannot burn the budget
 *   again on every launch. Any edit produces a new key and is evaluated normally.
 */

export const REGEX_TIMEOUT_MS = 1000

export type RegexEvaluationState =
  | { status: 'evaluating'; result: RegexEvaluation | null }
  | { status: 'ready'; result: RegexEvaluation }
  | { status: 'timeout'; result: null }

function inputKey(input: RegexEvaluationInput): string {
  // NUL separator: it cannot come from a keystroke, so distinct inputs cannot collide.
  return [input.pattern, input.flags, input.text, input.replacement].join('\u0000')
}

export function useRegexEvaluation(input: RegexEvaluationInput): RegexEvaluationState {
  const [state, setState] = useState<RegexEvaluationState>(() => ({
    status: 'ready',
    result: emptyEvaluation(input.text),
  }))

  const workerRef = useRef<Worker | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)
  const timedOutKeysRef = useRef(new Set<string>())

  const key = inputKey(input)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // Any new request invalidates replies still in flight for the previous one.
    const requestId = ++requestIdRef.current

    // No pattern means no user code to run — resolve on the main thread.
    if (!input.pattern) {
      setState({ status: 'ready', result: emptyEvaluation(input.text) })
      return
    }

    if (timedOutKeysRef.current.has(key)) {
      setState({ status: 'timeout', result: null })
      return
    }

    setState((prev) => ({
      status: 'evaluating',
      // Keep showing the last good result while the new one is computed.
      result: prev.status === 'ready' ? prev.result : null,
    }))

    if (!workerRef.current) workerRef.current = new RegexWorkerFactory()
    const worker = workerRef.current

    const settle = (next: RegexEvaluationState) => {
      if (requestIdRef.current !== requestId) return
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setState(next)
    }

    worker.onmessage = (ev: MessageEvent) => {
      const { id, result, error } = ev.data as {
        id: number
        result?: RegexEvaluation
        error?: string
      }
      if (id !== requestId) return
      if (error || !result) {
        settle({
          status: 'ready',
          result: { ...emptyEvaluation(input.text), matchError: error ?? 'Regex worker failed' },
        })
        return
      }
      settle({ status: 'ready', result })
    }

    worker.onerror = (ev) => {
      console.error('[useRegexEvaluation] Worker error:', ev)
      settle({
        status: 'ready',
        result: {
          ...emptyEvaluation(input.text),
          matchError: ev.message || 'Regex worker failed',
        },
      })
    }

    try {
      worker.postMessage({ id: requestId, method: 'evaluate', args: [input] })
    } catch (err) {
      settle({
        status: 'ready',
        result: {
          ...emptyEvaluation(input.text),
          matchError: err instanceof Error ? err.message : String(err),
        },
      })
      return
    }

    timerRef.current = setTimeout(() => {
      if (requestIdRef.current !== requestId) return
      timerRef.current = null
      timedOutKeysRef.current.add(key)
      // The worker is wedged inside exec(); terminate is the only way out.
      workerRef.current?.terminate()
      workerRef.current = new RegexWorkerFactory()
      setState({ status: 'timeout', result: null })
    }, REGEX_TIMEOUT_MS)
    // `input` is fully described by `key`; depending on the object itself would re-run
    // this effect on every render because callers pass an inline literal.
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}
