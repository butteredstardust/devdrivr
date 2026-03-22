import { useEffect, useRef, useState } from 'react'

/**
 * Lightweight RPC wrapper for Web Workers — no Comlink, no Proxy.
 *
 * Workers must use the matching `handleRpc` protocol (see workers/).
 * Pass the method names your worker exposes; the hook builds a plain
 * object with real function properties (no Proxy).
 *
 * Usage:
 *   import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
 *   const api = useWorker<FormatterWorker>(
 *     () => new FormatterWorkerFactory(),
 *     ['format', 'detectLanguage', 'getSupportedLanguages']
 *   )
 */

type WorkerRpc<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => R extends Promise<infer U> ? Promise<U> : Promise<R>
    : never
}

let nextId = 1

export function useWorker<T>(factory: () => Worker, methods: (keyof T & string)[]): WorkerRpc<T> | null {
  const [rpc, setRpc] = useState<WorkerRpc<T> | null>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const worker = factory()
    workerRef.current = worker

    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

    worker.onmessage = (ev: MessageEvent) => {
      const { id, result, error } = ev.data as { id: number; result?: unknown; error?: string }
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      if (error) entry.reject(new Error(error))
      else entry.resolve(result)
    }

    worker.onerror = (ev) => {
      console.error('[useWorker] Worker error:', ev)
    }

    // Build RPC object with real function properties — no Proxy.
    const obj = {} as Record<string, (...args: unknown[]) => Promise<unknown>>
    for (const method of methods) {
      obj[method] = (...args: unknown[]) => {
        return new Promise((resolve, reject) => {
          const id = nextId++
          pending.set(id, { resolve, reject })
          worker.postMessage({ id, method, args })
        })
      }
    }

    setRpc(obj as WorkerRpc<T>)

    return () => {
      worker.terminate()
      workerRef.current = null
      pending.clear()
      setRpc(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return rpc
}
