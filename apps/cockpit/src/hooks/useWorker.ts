import { useEffect, useRef } from 'react'
import { wrap, type Remote } from 'comlink'

/**
 * Creates a comlink-wrapped Web Worker. Terminates on unmount.
 *
 * Usage:
 *   const worker = useWorker<FormatterWorker>(
 *     () => new Worker(new URL('../workers/formatter.worker.ts', import.meta.url), { type: 'module' })
 *   )
 *
 * The factory function pattern ensures a new Worker is created per component instance,
 * not shared across renders.
 */
export function useWorker<T>(factory: () => Worker): Remote<T> | null {
  const proxyRef = useRef<Remote<T> | null>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const worker = factory()
    workerRef.current = worker
    proxyRef.current = wrap<T>(worker)

    return () => {
      worker.terminate()
      workerRef.current = null
      proxyRef.current = null
    }
  // factory is stable when caller wraps in useCallback or passes inline arrow
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return proxyRef.current
}
