import { describe, expect, it } from 'vitest'

/**
 * Guards against the exact bug this file exists to catch: `vitest.config.ts`
 * resolve.alias is an ORDERED array, and Vite takes the first matching entry.
 * A bare '@' alias placed before the worker-specific entries would silently
 * shadow all five of them and resolve every `@/workers/*.worker?worker`
 * specifier back to real source files (which import `self`-only worker code
 * and cannot run in Node/jsdom), or — as originally happened — back to the
 * shared no-op stub.
 *
 * Rather than parsing config text, this dynamically imports each real
 * specifier the app uses and proves the resulting factory produces a worker
 * that actually answers an RPC call end-to-end. A no-op mock (or a config
 * regression that shadows these entries) would make every case below either
 * throw at import time or time out waiting for `onmessage`.
 */

type RpcResponse = { id: number; result?: unknown; error?: string }

async function callWorker(worker: Worker, method: string, args: unknown[]): Promise<RpcResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 2000)
    worker.onmessage = (ev: MessageEvent) => {
      clearTimeout(timer)
      resolve(ev.data as RpcResponse)
    }
    worker.postMessage({ id: 1, method, args })
  })
}

describe('worker mock alias resolution', () => {
  it('resolves @/workers/typescript.worker?worker to a live mock', async () => {
    const { default: Factory } = await import('@/workers/typescript.worker?worker')
    const worker = new Factory() as Worker
    const res = await callWorker(worker, 'transpile', ['const x: number = 1', {}])
    expect(res.error).toBeUndefined()
    expect(res.result).toMatchObject({ output: expect.stringContaining('const x = 1') })
  })

  it('resolves @/workers/formatter.worker?worker to a live mock', async () => {
    const { default: Factory } = await import('@/workers/formatter.worker?worker')
    const worker = new Factory() as Worker
    const res = await callWorker(worker, 'getSupportedLanguages', [])
    expect(res.error).toBeUndefined()
    expect(res.result).toEqual(expect.arrayContaining(['javascript', 'json', 'sql']))
  })

  it('resolves @/workers/refactoring.worker?worker to a live mock', async () => {
    const { default: Factory } = await import('@/workers/refactoring.worker?worker')
    const worker = new Factory() as Worker
    const res = await callWorker(worker, 'applyTransforms', [
      'var x = 1;',
      ['var-to-const'],
      'babel',
    ])
    expect(res.error).toBeUndefined()
    expect(res.result).toContain('const x = 1;')
  })

  it('resolves @/workers/diff.worker?worker to a live mock', async () => {
    const { default: Factory } = await import('@/workers/diff.worker?worker')
    const worker = new Factory() as Worker
    const res = await callWorker(worker, 'computeDiff', ['a\n', 'b\n', {}])
    expect(res.error).toBeUndefined()
    expect(res.result).toEqual(expect.stringContaining('@@'))
  })

  it('resolves @/workers/xml.worker?worker to a live mock', async () => {
    const { default: Factory } = await import('@/workers/xml.worker?worker')
    const worker = new Factory() as Worker
    const res = await callWorker(worker, 'validate', ['<root><unclosed></root>'])
    expect(res.error).toBeUndefined()
    expect(res.result).toMatchObject({ valid: false })
  })
})
