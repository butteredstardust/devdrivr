import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useUiStore } from '@/stores/ui.store'

function mockClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  })
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>
}

describe('useCopyToClipboard', () => {
  beforeEach(() => {
    useUiStore.setState({ lastAction: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes the text and reports success', async () => {
    const writeText = mockClipboard(() => Promise.resolve())
    const { result } = renderHook(() => useCopyToClipboard())

    let copied: boolean | undefined
    await act(async () => {
      copied = await result.current('hello')
    })

    expect(writeText).toHaveBeenCalledWith('hello')
    expect(copied).toBe(true)
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Copied to clipboard',
      type: 'success',
    })
  })

  it('reports failure rather than staying silent when the write is refused', async () => {
    mockClipboard(() => Promise.reject(new Error('denied')))
    const { result } = renderHook(() => useCopyToClipboard())

    let copied: boolean | undefined
    await act(async () => {
      copied = await result.current('hello')
    })

    // The whole point of the hook: a refused write must not look like a successful one.
    expect(copied).toBe(false)
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Failed to copy to clipboard',
      type: 'error',
    })
  })

  it('uses the caller-supplied messages', async () => {
    mockClipboard(() => Promise.resolve())
    const { result } = renderHook(() => useCopyToClipboard())

    await act(async () => {
      await result.current('x', { success: 'Copied path /a/b', failure: 'Nope' })
    })

    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Copied path /a/b' })
  })

  it('keeps a stable identity so callers can list it as a dependency', () => {
    mockClipboard(() => Promise.resolve())
    const { result, rerender } = renderHook(() => useCopyToClipboard())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
