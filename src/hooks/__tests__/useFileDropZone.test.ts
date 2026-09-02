import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readSupportedTextFile } from '@/lib/file-io'
import { useFileDropZone } from '@/hooks/useFileDropZone'

const mocks = vi.hoisted(() => ({
  eventHandler: null as ((event: { payload: Record<string, unknown> }) => void) | null,
  unlisten: vi.fn(),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(),
}))

vi.mock('@/lib/file-io', () => ({
  filenameFromPath: (path: string) => path.split(/[\\/]/).pop() || path,
  readSupportedTextFile: vi.fn(),
}))

describe('useFileDropZone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.eventHandler = null
    vi.mocked(getCurrentWebviewWindow).mockReturnValue({
      onDragDropEvent: vi.fn(async (handler) => {
        mocks.eventHandler = handler as typeof mocks.eventHandler
        return mocks.unlisten
      }),
    } as unknown as ReturnType<typeof getCurrentWebviewWindow>)
  })

  it('reads and delivers the first dropped text file, then cleans up', async () => {
    vi.mocked(readSupportedTextFile).mockResolvedValue('dropped content')
    const onDrop = vi.fn()
    const { unmount } = renderHook(() => useFileDropZone(onDrop))
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    act(() => {
      mocks.eventHandler?.({
        payload: { type: 'drop', paths: ['/tmp/example.json'] },
      })
    })

    // The absolute path rides along so the tool can overwrite the dropped file
    // on ⌘S instead of falling back to Save As.
    await waitFor(() =>
      expect(onDrop).toHaveBeenCalledWith('dropped content', 'example.json', '/tmp/example.json')
    )
    unmount()
    expect(mocks.unlisten).toHaveBeenCalledOnce()
  })

  it('reports unsupported or unreadable dropped files', async () => {
    vi.mocked(readSupportedTextFile).mockRejectedValue(
      new Error('Unsupported binary file: "/tmp/image.png"')
    )
    const onError = vi.fn()
    renderHook(() => useFileDropZone(vi.fn(), onError))
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    act(() => {
      mocks.eventHandler?.({
        payload: { type: 'drop', paths: ['/tmp/image.png'] },
      })
    })

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Unsupported binary file: "/tmp/image.png"')
    )
  })

  it('rejects drops before reading when the active tool does not support files', async () => {
    const onError = vi.fn()
    renderHook(() => useFileDropZone(vi.fn(), onError, false))
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    act(() => {
      mocks.eventHandler?.({
        payload: { type: 'drop', paths: ['/tmp/large.bin'] },
      })
    })

    expect(readSupportedTextFile).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('File drop is not supported by the active tool')
  })

  it('reports native listener registration failures', async () => {
    vi.mocked(getCurrentWebviewWindow).mockReturnValue({
      onDragDropEvent: vi.fn().mockRejectedValue(new Error('listener unavailable')),
    } as unknown as ReturnType<typeof getCurrentWebviewWindow>)
    const onError = vi.fn()

    renderHook(() => useFileDropZone(vi.fn(), onError))

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Failed to initialize file drop: listener unavailable')
    )
  })
})
