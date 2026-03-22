import { useEffect, useRef, useState } from 'react'
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
 * not shared across renders. Returns null until the worker is initialized, triggering
 * a re-render once ready so callers can show loading/disabled states.
 */
export function useWorker<T>(factory: () => Worker): Remote<T> | null {
  const [proxy, setProxy] = useState<Remote<T> | null>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const worker = factory()
    workerRef.current = worker
    setProxy(wrap<T>(worker))

    return () => {
      worker.terminate()
      workerRef.current = null
      setProxy(null)
    }
  // factory is stable when caller wraps in useCallback or passes inline arrow
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return proxy
}
