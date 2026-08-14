import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWindowControls } from '@/hooks/useWindowControls'

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  isMaximized: vi.fn(),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
}))

vi.mock('@/lib/native-window', () => ({
  closeNativeWindow: mocks.close,
  isNativeWindowMaximized: mocks.isMaximized,
  minimizeNativeWindow: mocks.minimize,
  toggleNativeWindowMaximize: mocks.toggleMaximize,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.close.mockResolvedValue(undefined)
  mocks.isMaximized.mockResolvedValue(false)
  mocks.minimize.mockResolvedValue(undefined)
  mocks.toggleMaximize.mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useWindowControls', () => {
  it('reads initial maximized state through the native command bridge', async () => {
    mocks.isMaximized.mockResolvedValue(true)

    const { result } = renderHook(() => useWindowControls())

    await waitFor(() => expect(result.current.isMaximized).toBe(true))
  })

  it('tracks focus using browser focus and blur events', () => {
    const { result } = renderHook(() => useWindowControls())

    act(() => window.dispatchEvent(new window.Event('blur')))
    expect(result.current.isFocused).toBe(false)

    act(() => window.dispatchEvent(new window.Event('focus')))
    expect(result.current.isFocused).toBe(true)
  })

  it('routes minimize, maximize, and close through native commands', async () => {
    const { result } = renderHook(() => useWindowControls())

    act(() => result.current.minimize())
    act(() => result.current.toggleMaximize())
    act(() => result.current.close())

    expect(mocks.minimize).toHaveBeenCalledTimes(1)
    expect(mocks.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(mocks.close).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.isMaximized).toBe(true))
  })

  it('contains native command failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.close.mockRejectedValueOnce(new Error('blocked'))
    const { result } = renderHook(() => useWindowControls())

    act(() => result.current.close())

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        '[useWindowControls] close failed:',
        expect.any(Error)
      )
    )
  })

  it('debounces browser resize bursts into one maximized-state read', async () => {
    vi.useFakeTimers()
    try {
      renderHook(() => useWindowControls())
      await act(async () => Promise.resolve())
      const readsAfterMount = mocks.isMaximized.mock.calls.length

      act(() => {
        for (let index = 0; index < 50; index += 1) {
          window.dispatchEvent(new window.Event('resize'))
        }
      })
      expect(mocks.isMaximized).toHaveBeenCalledTimes(readsAfterMount)

      await act(async () => vi.advanceTimersByTimeAsync(200))
      expect(mocks.isMaximized).toHaveBeenCalledTimes(readsAfterMount + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('queues a final resize read while the previous read is in flight', async () => {
    vi.useFakeTimers()
    try {
      let resolveFirstResize!: (value: boolean) => void
      const firstResize = new Promise<boolean>((resolve) => {
        resolveFirstResize = resolve
      })
      const { result } = renderHook(() => useWindowControls())
      await act(async () => Promise.resolve())
      const readsAfterMount = mocks.isMaximized.mock.calls.length
      mocks.isMaximized.mockReturnValueOnce(firstResize).mockResolvedValueOnce(true)

      act(() => window.dispatchEvent(new window.Event('resize')))
      await act(async () => vi.advanceTimersByTimeAsync(200))
      act(() => window.dispatchEvent(new window.Event('resize')))
      await act(async () => vi.advanceTimersByTimeAsync(200))
      expect(mocks.isMaximized).toHaveBeenCalledTimes(readsAfterMount + 1)

      await act(async () => {
        resolveFirstResize(false)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(mocks.isMaximized).toHaveBeenCalledTimes(readsAfterMount + 2)
      expect(result.current.isMaximized).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels a pending resize read on unmount', async () => {
    vi.useFakeTimers()
    try {
      const { unmount } = renderHook(() => useWindowControls())
      await act(async () => Promise.resolve())
      const readsAfterMount = mocks.isMaximized.mock.calls.length

      act(() => window.dispatchEvent(new window.Event('resize')))
      unmount()
      await act(async () => vi.advanceTimersByTimeAsync(200))

      expect(mocks.isMaximized).toHaveBeenCalledTimes(readsAfterMount)
    } finally {
      vi.useRealTimers()
    }
  })
})
