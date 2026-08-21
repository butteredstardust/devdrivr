import { transformBase64 } from '@/workers/base64.api'

type RpcRequest = { id: number; method: string; args: unknown[] }

class MockBase64Worker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  private terminated = false

  postMessage(message: unknown) {
    const { id, method, args } = message as RpcRequest
    queueMicrotask(() => {
      if (this.terminated) return
      try {
        if (method !== 'transformBase64') throw new Error(`Unknown method: ${method}`)
        const result = transformBase64(
          args[0] as string,
          args[1] as 'encode' | 'decode',
          args[2] as boolean,
          args[3] as boolean
        )
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

export default function MockBase64WorkerFactory() {
  return new MockBase64Worker()
}
