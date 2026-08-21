import { analyze } from '@/workers/css.api'

type RpcRequest = { id: number; method: string; args: unknown[] }

class MockCssWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  private terminated = false

  postMessage(message: unknown) {
    const { id, method, args } = message as RpcRequest
    queueMicrotask(() => {
      if (this.terminated) return
      try {
        if (method !== 'analyze') throw new Error(`Unknown method: ${method}`)
        const result = analyze(args[0] as string, args[1] as string[], args[2] as string[])
        this.onmessage?.({ data: { id, result } } as MessageEvent)
      } catch (error) {
        this.onmessage?.({
          data: { id, error: error instanceof Error ? error.message : String(error) },
        } as MessageEvent)
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

export default function MockCssWorkerFactory() {
  return new MockCssWorker()
}
