import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorker } from '@/hooks/useWorker'

type TestWorkerApi = {
  echo(value: string): Promise<string>
}

class ControllableWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  dispatchEvent = vi.fn(() => false)
}

function renderWorkerHook(worker: ControllableWorker) {
  return renderHook(() => useWorker<TestWorkerApi>(() => worker as unknown as Worker, ['echo']))
}

describe('useWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves a request when the worker responds with the matching id', async () => {
    const worker = new ControllableWorker()
    const { result } = renderWorkerHook(worker)
    await waitFor(() => expect(result.current).not.toBeNull())

    const response = result.current?.echo('hello')
    const request = worker.postMessage.mock.calls[0]?.[0] as
      | { id: number; method: string; args: unknown[] }
      | undefined
    expect(request).toMatchObject({ method: 'echo', args: ['hello'] })

    act(() => {
      worker.onmessage?.(
        new MessageEvent('message', { data: { id: request?.id, result: 'hello' } })
      )
    })

    await expect(response).resolves.toBe('hello')
  })

  it('rejects pending requests when the worker reports a runtime error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const worker = new ControllableWorker()
    const { result } = renderWorkerHook(worker)
    await waitFor(() => expect(result.current).not.toBeNull())

    const response = result.current?.echo('hello')
    const rejection = expect(response).rejects.toThrow('worker crashed')

    act(() => {
      worker.onerror?.(new ErrorEvent('error', { message: 'worker crashed' }))
    })

    await rejection
  })

  it('terminates the worker and rejects unresolved requests on unmount', async () => {
    const worker = new ControllableWorker()
    const { result, unmount } = renderWorkerHook(worker)
    await waitFor(() => expect(result.current).not.toBeNull())

    const response = result.current?.echo('hello')
    const rejection = expect(response).rejects.toThrow('Worker terminated')

    unmount()

    await rejection
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('rejects immediately when posting a worker request throws', async () => {
    const worker = new ControllableWorker()
    worker.postMessage.mockImplementation(() => {
      throw new Error('clone failed')
    })
    const { result, unmount } = renderWorkerHook(worker)
    await waitFor(() => expect(result.current).not.toBeNull())

    await expect(result.current?.echo('hello')).rejects.toThrow('clone failed')
    unmount()

    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
