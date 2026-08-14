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

  it('re-reads maximized state when the resize event fires', async () => {
    renderHook(() => useWindowControls())
    await waitFor(() => expect(mocks.onResized).toHaveBeenCalled())

    const resizedHandler = mocks.onResized.mock.calls[0]?.[0]
    mocks.isMaximized.mockResolvedValue(true)
    await act(async () => {
      resizedHandler()
      await Promise.resolve()
    })

    expect(mocks.isMaximized).toHaveBeenCalled()
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
