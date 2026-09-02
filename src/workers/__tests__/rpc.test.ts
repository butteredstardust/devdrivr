import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleRpc } from '@/workers/rpc'

type WorkerScope = {
  onmessage: ((event: MessageEvent) => Promise<void>) | null
  postMessage: ReturnType<typeof vi.fn>
}

function installWorkerScope(): WorkerScope {
  const scope: WorkerScope = {
    onmessage: null,
    postMessage: vi.fn(),
  }
  vi.stubGlobal('self', scope)
  return scope
}

async function dispatch(scope: WorkerScope, data: unknown): Promise<void> {
  expect(scope.onmessage).not.toBeNull()
  await scope.onmessage?.(new MessageEvent('message', { data }))
}

describe('handleRpc', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns successful async results using the worker RPC message shape', async () => {
    const scope = installWorkerScope()
    handleRpc({
      add: async (left: number, right: number) => left + right,
    })

    await dispatch(scope, { id: 7, method: 'add', args: [2, 3] })

    expect(scope.postMessage).toHaveBeenCalledWith({ id: 7, result: 5 })
  })

  it('returns a descriptive error for unknown methods', async () => {
    const scope = installWorkerScope()
    handleRpc({})

    await dispatch(scope, { id: 8, method: 'missing', args: [] })

    expect(scope.postMessage).toHaveBeenCalledWith({
      id: 8,
      error: 'Unknown method: missing',
    })
  })

  it('serializes errors thrown by worker methods', async () => {
    const scope = installWorkerScope()
    handleRpc({
      fail: () => {
        throw new Error('format failed')
      },
    })

    await dispatch(scope, { id: 9, method: 'fail', args: [] })

    expect(scope.postMessage).toHaveBeenCalledWith({ id: 9, error: 'format failed' })
  })
})
