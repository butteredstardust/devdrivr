// Test-environment stand-in for `@/workers/regex.worker?worker`.
//
// Unlike the generic worker mock this one actually runs the real evaluation, so the
// regex tester's behaviour is exercised end to end in tests. Replies are delivered
// asynchronously (as a real worker would) and a terminated instance goes silent.
import { evaluateRegex } from '@/workers/regex.api'
import type { RegexEvaluationInput } from '@/workers/regex.api'

type RpcRequest = { id: number; method: string; args: unknown[] }

class MockRegexWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null
  onmessageerror: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: ErrorEvent) => void) | null = null
  private terminated = false

  postMessage(message: unknown) {
    const { id, method, args } = message as RpcRequest
    queueMicrotask(() => {
      if (this.terminated) return
      try {
        if (method !== 'evaluate') throw new Error(`Unknown method: ${method}`)
        const result = evaluateRegex(args[0] as RegexEvaluationInput)
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

export default function MockRegexWorkerFactory() {
  return new MockRegexWorker()
}

export { MockRegexWorker }
