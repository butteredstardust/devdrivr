// Test-environment stand-in for `@/workers/formatter.worker?worker`.
//
// Unlike the generic worker mock this one actually runs the real formatter
// (prettier / sql-formatter), so Code Formatter, JSON Tools, and YAML Tools
// are exercised end to end in tests. Replies are delivered asynchronously (as
// a real worker would) and a terminated instance goes silent.
import { format, detectLanguage, getSupportedLanguages } from '@/workers/formatter.api'
import type { FormatOptions } from '@/workers/formatter.api'

type RpcRequest = { id: number; method: string; args: unknown[] }

const METHODS: Record<string, (...args: unknown[]) => unknown> = {
  format: (code, options) => format(code as string, options as FormatOptions),
  detectLanguage: (code) => detectLanguage(code as string),
  getSupportedLanguages: () => getSupportedLanguages(),
}

class MockFormatterWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null
  onmessageerror: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: ErrorEvent) => void) | null = null
  private terminated = false

  postMessage(message: unknown) {
    const { id, method, args } = message as RpcRequest
    queueMicrotask(async () => {
      if (this.terminated) return
      try {
        const fn = METHODS[method]
        if (!fn) throw new Error(`Unknown method: ${method}`)
        const result = await fn(...args)
        if (this.terminated) return
        this.onmessage?.({ data: { id, result } } as MessageEvent)
      } catch (err) {
        if (this.terminated) return
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

export default function MockFormatterWorkerFactory() {
  return new MockFormatterWorker()
}

export { MockFormatterWorker }
