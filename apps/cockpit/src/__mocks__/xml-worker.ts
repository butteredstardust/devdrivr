// Test-environment stand-in for `@/workers/xml.worker?worker`.
//
// Unlike the generic worker mock this one actually runs the real XML logic
// (built on @xmldom/xmldom, which runs fine under Node/jsdom — it is not a
// browser DOMParser), so XML Tools is exercised end to end in tests. Replies
// are delivered asynchronously (as a real worker would) and a terminated
// instance goes silent.
import {
  validate,
  format,
  minify,
  toJson,
  fromJson,
  stats,
  inspect,
  tree,
  queryXPath,
} from '@/workers/xml.api'

type RpcRequest = { id: number; method: string; args: unknown[] }

const METHODS: Record<string, (...args: unknown[]) => unknown> = {
  validate: (xml) => validate(xml as string),
  format: (xml, indent) => format(xml as string, indent as number | undefined),
  minify: (xml) => minify(xml as string),
  toJson: (xml) => toJson(xml as string),
  fromJson: (json, rootName) => fromJson(json as string, rootName as string | undefined),
  stats: (xml) => stats(xml as string),
  inspect: (xml) => inspect(xml as string),
  tree: (xml) => tree(xml as string),
  queryXPath: (xml, expression) => queryXPath(xml as string, expression as string),
}

class MockXmlWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null
  onmessageerror: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: ErrorEvent) => void) | null = null
  private terminated = false

  postMessage(message: unknown) {
    const { id, method, args } = message as RpcRequest
    queueMicrotask(() => {
      if (this.terminated) return
      try {
        const fn = METHODS[method]
        if (!fn) throw new Error(`Unknown method: ${method}`)
        const result = fn(...args)
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

export default function MockXmlWorkerFactory() {
  return new MockXmlWorker()
}

export { MockXmlWorker }
