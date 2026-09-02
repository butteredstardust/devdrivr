/**
 * Worker-side RPC handler. Replaces Comlink's `expose()`.
 *
 * Usage (in a worker file):
 *   const api = { format(...) { ... }, detectLanguage(...) { ... } }
 *   handleRpc(api)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleRpc(api: Record<string, (...args: any[]) => unknown>): void {
  self.onmessage = async (ev: MessageEvent) => {
    const { id, method, args } = ev.data as { id: number; method: string; args: unknown[] }
    try {
      const fn = api[method]
      if (typeof fn !== 'function') {
        throw new Error(`Unknown method: ${method}`)
      }
      const result = await fn.apply(api, args)
      self.postMessage({ id, result })
    } catch (err) {
      self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
    }
  }
}
