import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWindowControls } from '@/hooks/useWindowControls'

const mocks = vi.hoisted(() => ({
  isMaximized: vi.fn(),
  isFocused: vi.fn(),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  onResized: vi.fn(),
  onFocusChanged: vi.fn(),
  unlistenResized: vi.fn(),
  unlistenFocus: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isMaximized: mocks.isMaximized,
    isFocused: mocks.isFocused,
    minimize: mocks.minimize,
    toggleMaximize: mocks.toggleMaximize,
    close: mocks.close,
    onResized: mocks.onResized,
    onFocusChanged: mocks.onFocusChanged,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isMaximized.mockResolvedValue(false)
  mocks.isFocused.mockResolvedValue(true)
  mocks.minimize.mockResolvedValue(undefined)
  mocks.toggleMaximize.mockResolvedValue(undefined)
  mocks.close.mockResolvedValue(undefined)
  mocks.onResized.mockResolvedValue(mocks.unlistenResized)
  mocks.onFocusChanged.mockResolvedValue(mocks.unlistenFocus)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useWindowControls', () => {
  it('reads initial maximized and focused state on mount', async () => {
    mocks.isMaximized.mockResolvedValue(true)
    mocks.isFocused.mockResolvedValue(false)

    const { result } = renderHook(() => useWindowControls())

    await waitFor(() => expect(result.current.isMaximized).toBe(true))
    expect(result.current.isFocused).toBe(false)
  })

  it('minimize/toggleMaximize/close invoke the matching window methods', async () => {
    const { result } = renderHook(() => useWindowControls())
    await waitFor(() => expect(mocks.onResized).toHaveBeenCalled())

    act(() => result.current.minimize())
    expect(mocks.minimize).toHaveBeenCalledTimes(1)

    act(() => result.current.toggleMaximize())
    expect(mocks.toggleMaximize).toHaveBeenCalledTimes(1)

    act(() => result.current.close())
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('flips maximized state optimistically so the control updates without a read-back', async () => {
    const { result } = renderHook(() => useWindowControls())
    await waitFor(() => expect(mocks.onResized).toHaveBeenCalled())

    act(() => result.current.toggleMaximize())

    expect(result.current.isMaximized).toBe(true)
  })

  it('rolls back the optimistic maximized state when the native toggle fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.toggleMaximize.mockRejectedValueOnce(new Error('blocked'))
    const { result } = renderHook(() => useWindowControls())
    await waitFor(() => expect(mocks.onResized).toHaveBeenCalled())

    act(() => result.current.toggleMaximize())
    expect(result.current.isMaximized).toBe(true)

    await waitFor(() => expect(result.current.isMaximized).toBe(false))
    expect(consoleError).toHaveBeenCalledWith(
      '[useWindowControls] toggleMaximize failed:',
      expect.any(Error)
    )
  })

  it('registers both listeners even if the initial state read never settles', async () => {
    // The read is an IPC round trip. It used to be awaited *before* the listeners were attached,
    // so a channel that stopped responding left the window with no listeners for the whole session.
    mocks.isMaximized.mockReturnValue(new Promise(() => {}))
    mocks.isFocused.mockReturnValue(new Promise(() => {}))

    renderHook(() => useWindowControls())

    await waitFor(() => expect(mocks.onResized).toHaveBeenCalled())
    await waitFor(() => expect(mocks.onFocusChanged).toHaveBeenCalled())
  })

  it('registers the focus listener even if resize-listener registration never settles', async () => {
    mocks.onResized.mockReturnValue(new Promise(() => {}))

    renderHook(() => useWindowControls())

    await waitFor(() => expect(mocks.onFocusChanged).toHaveBeenCalledTimes(1))
  })

  it('contains listener-registration failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.onResized.mockRejectedValueOnce(new Error('unavailable'))

    renderHook(() => useWindowControls())

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        '[useWindowControls] onResized failed:',
        expect.any(Error)
      )
    )
    expect(mocks.onFocusChanged).toHaveBeenCalledTimes(1)
  })

  it('debounces resize events into a single trailing read instead of one read per event', async () => {
    // Regression guard for the IPC deadlock: macOS emits a continuous stream of resize events
    // during a zoom animation, and one `isMaximized()` round trip per event permanently wedged
    // Tauri's plugin command dispatch — taking SQLite persistence down with it.
    vi.useFakeTimers()
    try {
      renderHook(() => useWindowControls())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })

      const resizedHandler = mocks.onResized.mock.calls[0]?.[0]
      expect(resizedHandler).toBeTypeOf('function')

      const readsAfterBootstrap = mocks.isMaximized.mock.calls.length

      await act(async () => {
        for (let i = 0; i < 50; i += 1) resizedHandler()
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(mocks.isMaximized).toHaveBeenCalledTimes(readsAfterBootstrap)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      expect(mocks.isMaximized).toHaveBeenCalledTimes(readsAfterBootstrap + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies the reconciled maximized state after a resize burst settles', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useWindowControls())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })

      const resizedHandler = mocks.onResized.mock.calls[0]?.[0]
      mocks.isMaximized.mockResolvedValue(true)

      await act(async () => {
        resizedHandler()
        await vi.advanceTimersByTimeAsync(500)
      })

      expect(result.current.isMaximized).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('queues a final reconcile when a resize settles during an in-flight read', async () => {
    vi.useFakeTimers()
    try {
      let resolveFirstResize!: (value: boolean) => void
      const firstResizeRead = new Promise<boolean>((resolve) => {
        resolveFirstResize = resolve
      })

      const { result } = renderHook(() => useWindowControls())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })

      const resizedHandler = mocks.onResized.mock.calls[0]?.[0]
      const readsAfterBootstrap = mocks.isMaximized.mock.calls.length
      mocks.isMaximized.mockReturnValueOnce(firstResizeRead).mockResolvedValueOnce(true)

      await act(async () => {
        resizedHandler()
        await vi.advanceTimersByTimeAsync(200)
      })
      expect(mocks.isMaximized).toHaveBeenCalledTimes(readsAfterBootstrap + 1)

      await act(async () => {
        resizedHandler()
        await vi.advanceTimersByTimeAsync(200)
      })
      expect(mocks.isMaximized).toHaveBeenCalledTimes(readsAfterBootstrap + 1)

      await act(async () => {
        resolveFirstResize(false)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(mocks.isMaximized).toHaveBeenCalledTimes(readsAfterBootstrap + 2)
      expect(result.current.isMaximized).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('updates isFocused when the focus-change event fires', async () => {
    const { result } = renderHook(() => useWindowControls())
    await waitFor(() => expect(mocks.onFocusChanged).toHaveBeenCalled())

    const focusHandler = mocks.onFocusChanged.mock.calls[0]?.[0]
    act(() => {
      focusHandler({ payload: false })
    })

    expect(result.current.isFocused).toBe(false)
  })

  it('cleans up both listeners on unmount', async () => {
    const { unmount } = renderHook(() => useWindowControls())
    await waitFor(() => expect(mocks.onFocusChanged).toHaveBeenCalled())

    unmount()

    expect(mocks.unlistenResized).toHaveBeenCalledTimes(1)
    expect(mocks.unlistenFocus).toHaveBeenCalledTimes(1)
  })

  it('does not fire a pending resize reconcile after unmount', async () => {
    vi.useFakeTimers()
    try {
      const { unmount } = renderHook(() => useWindowControls())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })

      const resizedHandler = mocks.onResized.mock.calls[0]?.[0]
      const readsAfterBootstrap = mocks.isMaximized.mock.calls.length

      resizedHandler()
      unmount()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect(mocks.isMaximized).toHaveBeenCalledTimes(readsAfterBootstrap)
    } finally {
      vi.useRealTimers()
    }
  })

  it('tears down a listener immediately if unmount happens while it is still resolving', async () => {
    let resolveResized!: (fn: () => void) => void
    mocks.onResized.mockReturnValue(
      new Promise((resolve) => {
        resolveResized = resolve
      })
    )

    const { unmount } = renderHook(() => useWindowControls())
    unmount()

    resolveResized(mocks.unlistenResized)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.unlistenResized).toHaveBeenCalledTimes(1)
  })
})
