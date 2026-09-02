// Test-environment stand-in for `@/workers/diff.worker?worker`.
//
// Unlike the generic worker mock this one actually runs the real diff
// computation, so Diff Viewer's behaviour is exercised end to end in tests.
// Replies are delivered asynchronously (as a real worker would) and a
// terminated instance goes silent.
import { computeDiff } from '@/workers/diff.api'
import type { DiffOptions } from '@/workers/diff.api'

type RpcRequest = { id: number; method: string; args: unknown[] }

class MockDiffWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null
  onmessageerror: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: ErrorEvent) => void) | null = null
  private terminated = false

  postMessage(message: unknown) {
    const { id, method, args } = message as RpcRequest
    queueMicrotask(() => {
      if (this.terminated) return
      try {
        if (method !== 'computeDiff') throw new Error(`Unknown method: ${method}`)
        const result = computeDiff(
          args[0] as string,
          args[1] as string,
          args[2] as DiffOptions | undefined
        )
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

export default function MockDiffWorkerFactory() {
  return new MockDiffWorker()
}

export { MockDiffWorker }
