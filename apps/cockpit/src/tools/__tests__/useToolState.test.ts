import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useToolState } from '@/hooks/useToolState'
import { loadToolState, saveToolState } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  loadToolState: vi.fn(),
  saveToolState: vi.fn(),
}))

const cacheStore: Record<string, unknown> = {}
vi.mock('@/stores/tool-state.store', () => ({
  useToolStateCache: (
    selector: (s: { get: (id: string) => unknown; set: (id: string, v: unknown) => void }) => unknown
  ) =>
    selector({
      get: (id) => cacheStore[id],
      set: (id, v) => {
        cacheStore[id] = v
      },
    }),
}))

type ToolState = { value: string }

describe('useToolState', () => {
  const TOOL_ID = 'test-tool'
  const DEFAULT_STATE: ToolState = { value: 'default' }

  beforeEach(() => {
    Object.keys(cacheStore).forEach((k) => delete cacheStore[k])
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('returns defaultState when cache is empty and SQLite returns nothing', async () => {
    vi.mocked(loadToolState).mockResolvedValue(null)

    const { result } = renderHook(() => useToolState(TOOL_ID, DEFAULT_STATE))

    expect(result.current[0]).toEqual(DEFAULT_STATE)

    // Wait for the useEffect to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(result.current[0]).toEqual(DEFAULT_STATE)
    expect(loadToolState).toHaveBeenCalledWith(TOOL_ID)
  })

  it('initialises synchronously from cache when a cached value exists (loadToolState not called)', () => {
    cacheStore[TOOL_ID] = { value: 'cached' }

    const { result } = renderHook(() => useToolState(TOOL_ID, DEFAULT_STATE))

    expect(result.current[0]).toEqual({ value: 'cached' })
    expect(loadToolState).not.toHaveBeenCalled()
  })

  it('loads from SQLite on cold start (cache miss), merges with defaultState', async () => {
    let resolveDb: (val: any) => void = () => {}
    vi.mocked(loadToolState).mockReturnValue(new Promise((resolve) => { resolveDb = resolve }))

    const { result } = renderHook(() =>
      useToolState<{ value: string; extra?: string }>(TOOL_ID, {
        value: 'default',
        extra: 'defaultExtra',
      })
    )

    // Initial state is default
    expect(result.current[0]).toEqual({ value: 'default', extra: 'defaultExtra' })

    // Resolve the DB load
    await act(async () => {
      resolveDb({ value: 'sqlite' })
    })

    expect(result.current[0]).toEqual({ value: 'sqlite', extra: 'defaultExtra' })
    expect(cacheStore[TOOL_ID]).toEqual({ value: 'sqlite', extra: 'defaultExtra' })
  })

  it('update() merges patch into state immediately', () => {
    vi.mocked(loadToolState).mockResolvedValue(null)
    const { result } = renderHook(() => useToolState(TOOL_ID, DEFAULT_STATE))

    act(() => {
      result.current[1]({ value: 'updated' })
    })

    expect(result.current[0]).toEqual({ value: 'updated' })
  })

  it('update() writes to cache synchronously (before debounce fires)', () => {
    vi.mocked(loadToolState).mockResolvedValue(null)
    const { result } = renderHook(() => useToolState(TOOL_ID, DEFAULT_STATE))

    act(() => {
      result.current[1]({ value: 'updated' })
    })

    expect(cacheStore[TOOL_ID]).toEqual({ value: 'updated' })
    expect(saveToolState).not.toHaveBeenCalled() // since it's debounced
  })

  it('update() debounces saveToolState — not called before 2000ms, called after', () => {
    vi.useFakeTimers()
    vi.mocked(loadToolState).mockResolvedValue(null)

    const { result } = renderHook(() => useToolState(TOOL_ID, DEFAULT_STATE))

    act(() => {
      result.current[1]({ value: 'updated' })
    })

    expect(saveToolState).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(saveToolState).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(saveToolState).toHaveBeenCalledWith(TOOL_ID, { value: 'updated' })
    expect(saveToolState).toHaveBeenCalledTimes(1)
  })

  it('rapid updates only trigger one saveToolState call (debounce resets)', () => {
    vi.useFakeTimers()
    vi.mocked(loadToolState).mockResolvedValue(null)

    const { result } = renderHook(() => useToolState(TOOL_ID, DEFAULT_STATE))

    act(() => {
      result.current[1]({ value: 'first' })
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    act(() => {
      result.current[1]({ value: 'second' })
    })

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    // First update would have fired at 2000, but we reset it, so 1000 + 1500 = 2500 is only 1500 after second update
    expect(saveToolState).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(saveToolState).toHaveBeenCalledWith(TOOL_ID, { value: 'second' })
    expect(saveToolState).toHaveBeenCalledTimes(1)
  })

  it('on unmount, saveToolState is called immediately (bypasses debounce)', async () => {
    vi.useFakeTimers()
    let resolveDb: (val: any) => void = () => {}
    vi.mocked(loadToolState).mockReturnValue(new Promise((resolve) => { resolveDb = resolve }))

    const { result, unmount } = renderHook(() => useToolState(TOOL_ID, DEFAULT_STATE))

    await act(async () => {
      resolveDb({ value: 'loaded' })
      // Yield to microtask queue for the promise to settle and state to update
      await Promise.resolve()
    })

    act(() => {
      result.current[1]({ value: 'unmount-test' })
    })

    expect(saveToolState).not.toHaveBeenCalled()

    act(() => {
      unmount()
    })

    expect(saveToolState).toHaveBeenCalledWith(TOOL_ID, { value: 'unmount-test' })

    // ensure debounce timer doesn't fire again
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(saveToolState).toHaveBeenCalledTimes(1)
  })

  it('cancelled load: if component unmounts before SQLite load resolves, state is not updated', async () => {
    let resolveDb: (val: any) => void = () => {}
    vi.mocked(loadToolState).mockReturnValue(new Promise((resolve) => { resolveDb = resolve }))

    const { result, unmount } = renderHook(() => useToolState(TOOL_ID, DEFAULT_STATE))

    unmount()

    await act(async () => {
      resolveDb({ value: 'late-sqlite-data' })
    })

    // State wasn't updated with late-sqlite-data
    expect(result.current[0]).toEqual(DEFAULT_STATE)
    expect(cacheStore[TOOL_ID]).toBeUndefined()
  })
})
