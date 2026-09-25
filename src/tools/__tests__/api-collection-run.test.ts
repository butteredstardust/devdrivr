import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useApiStore } from '@/stores/api.store'
import { useCollectionRun } from '@/tools/api-client/hooks/useCollectionRun'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: fetchMock,
}))

describe('useCollectionRun', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    useApiStore.setState({
      requests: [
        {
          id: 'r1',
          collectionId: 'c1',
          name: 'Health',
          method: 'GET',
          url: 'https://example.com/health',
          headers: [],
          body: '',
          bodyMode: 'none',
          auth: { type: 'none' },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })
  })

  // The plugin keeps an unread body open on the Rust side, so the run must release it.
  it('cancels the unread response body and records the status', async () => {
    const response = new Response('ok', { status: 200 })
    const cancel = vi.spyOn(response.body!, 'cancel')
    fetchMock.mockResolvedValue(response)
    const { result } = renderHook(() => useCollectionRun({}, 5000))

    await act(() => result.current.runCollection({ id: 'c1' }))

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(result.current.collectionRun?.results.r1?.status).toBe('passed')
    expect(result.current.collectionRun?.running).toBe(false)
  })

  it('keeps the result of a request that fails before it is sent', async () => {
    useApiStore.setState({
      requests: [{ ...useApiStore.getState().requests[0]!, url: 'https://{{host}}/health' }],
    })
    const { result } = renderHook(() => useCollectionRun({}, 5000))

    await act(() => result.current.runCollection({ id: 'c1' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.collectionRun?.results.r1).toEqual({
      status: 'failed',
      detail: 'Unresolved: host',
    })
  })
})
