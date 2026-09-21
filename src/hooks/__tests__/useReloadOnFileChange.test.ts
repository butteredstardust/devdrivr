import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WatchEvent } from '@tauri-apps/plugin-fs'
import { useReloadOnFileChange } from '@/hooks/useReloadOnFileChange'
import { readSupportedTextFile } from '@/lib/file-io'
import { notifyTextFileWrite } from '@/lib/text-file-write-events'
import { useUiStore } from '@/stores/ui.store'

const watchMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/plugin-fs', () => ({
  watch: watchMock,
}))

vi.mock('@/lib/file-io', () => ({
  filenameFromPath: (path: string) => path.split(/[\\/]/).pop() || path,
  readSupportedTextFile: vi.fn(),
}))

type WatchCallback = (event: WatchEvent) => void

function changedEvent(): WatchEvent {
  return { type: { modify: { kind: 'data', mode: 'content' } }, paths: [], attrs: {} }
}

beforeEach(() => {
  vi.clearAllMocks()
  useUiStore.setState({ lastAction: null })
})

describe('useReloadOnFileChange', () => {
  it('reloads changed content and ignores notifications caused by the current content', async () => {
    let callback: WatchCallback | undefined
    const unwatch = vi.fn()
    watchMock.mockImplementation(async (_path: string, next: WatchCallback) => {
      callback = next
      return unwatch
    })
    let current = 'before'
    const onReload = vi.fn((file: { content: string }) => {
      current = file.content
    })
    vi.mocked(readSupportedTextFile).mockResolvedValue('after')

    const { unmount } = renderHook(() =>
      useReloadOnFileChange({
        filePath: '/tmp/document.md',
        getContent: () => current,
        onReload,
      })
    )

    await waitFor(() =>
      expect(watchMock).toHaveBeenCalledWith('/tmp/document.md', expect.any(Function), {
        delayMs: 200,
      })
    )
    await act(async () => callback?.(changedEvent()))

    expect(onReload).toHaveBeenCalledWith({
      content: 'after',
      filename: 'document.md',
      path: '/tmp/document.md',
    })

    await act(async () => callback?.(changedEvent()))
    expect(onReload).toHaveBeenCalledTimes(1)

    unmount()
    expect(unwatch).toHaveBeenCalledOnce()
  })

  it('moves the watcher when the open document path changes', async () => {
    const unwatchFirst = vi.fn()
    const unwatchSecond = vi.fn()
    watchMock.mockResolvedValueOnce(unwatchFirst).mockResolvedValueOnce(unwatchSecond)

    const { rerender, unmount } = renderHook(
      ({ filePath }: { filePath: string | null }) =>
        useReloadOnFileChange({ filePath, getContent: () => '', onReload: vi.fn() }),
      { initialProps: { filePath: '/tmp/first.json' } }
    )
    await waitFor(() => expect(watchMock).toHaveBeenCalledTimes(1))

    rerender({ filePath: '/tmp/second.json' })
    await waitFor(() => expect(watchMock).toHaveBeenCalledTimes(2))
    expect(unwatchFirst).toHaveBeenCalledOnce()

    unmount()
    expect(unwatchSecond).toHaveBeenCalledOnce()
  })

  it('ignores a delayed notification from an app save after the user types again', async () => {
    let callback: WatchCallback | undefined
    watchMock.mockImplementation(async (_path: string, next: WatchCallback) => {
      callback = next
      return vi.fn()
    })
    let current = 'saved content'
    const onReload = vi.fn()
    vi.mocked(readSupportedTextFile).mockResolvedValue('saved content')

    renderHook(() =>
      useReloadOnFileChange({
        filePath: '/tmp/document.md',
        getContent: () => current,
        onReload,
      })
    )
    await waitFor(() => expect(callback).toBeTypeOf('function'))

    act(() => notifyTextFileWrite('/tmp/document.md', 'saved content'))
    current = 'typed after save'
    await act(async () => callback?.(changedEvent()))

    expect(onReload).not.toHaveBeenCalled()
  })

  it('reports a read failure without replacing the editor content', async () => {
    let callback: WatchCallback | undefined
    watchMock.mockImplementation(async (_path: string, next: WatchCallback) => {
      callback = next
      return vi.fn()
    })
    vi.mocked(readSupportedTextFile).mockRejectedValue(new Error('file disappeared'))
    const onReload = vi.fn()

    renderHook(() =>
      useReloadOnFileChange({
        filePath: '/tmp/document.md',
        getContent: () => 'draft',
        onReload,
      })
    )
    await waitFor(() => expect(callback).toBeTypeOf('function'))
    await act(async () => callback?.(changedEvent()))

    expect(onReload).not.toHaveBeenCalled()
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Reload failed: file disappeared',
      type: 'error',
    })
  })
})
