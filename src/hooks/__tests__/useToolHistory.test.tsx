import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToolHistory } from '@/hooks/useToolHistory'

const addMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/stores/history.store', () => ({
  useHistoryStore: (selector: (state: { add: typeof addMock }) => unknown) =>
    selector({ add: addMock }),
}))

describe('useToolHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    addMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces rapid work and records only the latest result', () => {
    const { result } = renderHook(() => useToolHistory({ toolId: 'example', debounceMs: 100 }))
    act(() => {
      result.current.record({ input: 'a', output: 'first' })
      result.current.record({ input: 'ab', output: 'second' })
      vi.advanceTimersByTime(100)
    })
    expect(addMock).toHaveBeenCalledTimes(1)
    expect(addMock).toHaveBeenCalledWith('example', 'ab', 'second', undefined, undefined, true, 6)
  })

  it('deduplicates consecutive identical entries', () => {
    const { result } = renderHook(() => useToolHistory({ toolId: 'example', debounceMs: 10 }))
    act(() => {
      result.current.recordImmediate({ input: 'same', output: 'result' })
      result.current.recordImmediate({ input: 'same', output: 'result' })
    })
    expect(addMock).toHaveBeenCalledTimes(1)
  })

  it('records reactive output only after a user edit marker', () => {
    const { result } = renderHook(() => useToolHistory({ toolId: 'example', debounceMs: 10 }))
    act(() => {
      result.current.recordEdited({ input: 'hydrated', output: 'ignored' })
      result.current.markUserEdit()
      result.current.recordEdited({ input: 'typed', output: 'recorded' })
      vi.advanceTimersByTime(10)
    })
    expect(addMock).toHaveBeenCalledTimes(1)
    expect(addMock.mock.calls[0]?.[1]).toBe('typed')
  })

  it('flushes pending history on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useToolHistory({ toolId: 'example', debounceMs: 1_000 })
    )
    act(() => result.current.record({ input: 'pending', output: 'saved' }))
    unmount()
    expect(addMock).toHaveBeenCalledTimes(1)
  })
})
