// Test-environment stand-in for `@/workers/typescript.worker?worker`.
//
// Unlike the generic worker mock this one actually runs the real transpiler, so
// TS Playground's behaviour is exercised end to end in tests. Replies are
// delivered asynchronously (as a real worker would) and a terminated instance
// goes silent.
import { transpile } from '@/workers/typescript.api'
import type { TranspileOptions } from '@/workers/typescript.api'

type RpcRequest = { id: number; method: string; args: unknown[] }

class MockTypeScriptWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null
  onmessageerror: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: ErrorEvent) => void) | null = null
  private terminated = false

  postMessage(message: unknown) {
    const { id, method, args } = message as RpcRequest
    queueMicrotask(() => {
      if (this.terminated) return
      try {
        if (method !== 'transpile') throw new Error(`Unknown method: ${method}`)
        const result = transpile(args[0] as string, args[1] as TranspileOptions | undefined)
        this.onmessage?.({ data: { id, result } } as MessageEvent)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        this.onmessage?.({ data: { id, error } } as MessageEvent)
      }
    })
  }

  terminate() {
    this.terminated = true
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent(): boolean {
    return false
  }
}

export default function MockTypeScriptWorkerFactory() {
  return new MockTypeScriptWorker()
}

export { MockTypeScriptWorker }
