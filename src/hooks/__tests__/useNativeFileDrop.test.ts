import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readFile, stat } from '@tauri-apps/plugin-fs'
import { useNativeFileDrop } from '@/hooks/useNativeFileDrop'

const mocks = vi.hoisted(() => ({
  eventHandler: null as ((event: { payload: Record<string, unknown> }) => void) | null,
  unlisten: vi.fn(),
  scaleFactor: vi.fn(),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}))

// The container sits at 0,0 and is 100 CSS pixels square.
function makeContainer(): { current: HTMLElement } {
  const element = document.createElement('div')
  element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100 }) as DOMRect
  return { current: element }
}

function drop(payload: Record<string, unknown>) {
  act(() => {
    mocks.eventHandler?.({ payload })
  })
}

describe('useNativeFileDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.eventHandler = null
    mocks.scaleFactor.mockResolvedValue(2)
    vi.mocked(readFile).mockResolvedValue(new Uint8Array([1, 2, 3]))
    vi.mocked(getCurrentWebviewWindow).mockReturnValue({
      scaleFactor: mocks.scaleFactor,
      onDragDropEvent: vi.fn(async (handler) => {
        mocks.eventHandler = handler as typeof mocks.eventHandler
        return mocks.unlisten
      }),
    } as unknown as ReturnType<typeof getCurrentWebviewWindow>)
  })

  const render = (callbacks: Parameters<typeof useNativeFileDrop>[1], enabled = true) => {
    const containerRef = makeContainer()
    const view = renderHook(() => useNativeFileDrop(containerRef, callbacks, enabled))
    return view
  }

  it('delivers the dropped file with its media type and path', async () => {
    const onFile = vi.fn()
    const { unmount } = render({ onFile, onError: vi.fn() })
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    drop({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 20, y: 20 } })

    await waitFor(() => expect(onFile).toHaveBeenCalled())
    const [file, path] = onFile.mock.calls[0] as [File, string]
    expect(file.name).toBe('photo.png')
    // A `File` built from bytes has no type of its own, and an empty type shows nothing.
    expect(file.type).toBe('image/png')
    expect(path).toBe('/tmp/photo.png')

    unmount()
    expect(mocks.unlisten).toHaveBeenCalledOnce()
  })

  // The drop reports physical pixels while the container rectangle is in CSS pixels. Without the
  // conversion a drop at the centre of a Retina window tests as outside and is silently lost.
  it('converts the drop position with the scale factor', async () => {
    const onFile = vi.fn()
    render({ onFile, onError: vi.fn() })
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    // 150 physical pixels is 75 CSS pixels: inside the 100-pixel container.
    drop({ type: 'drop', paths: ['/tmp/a.png'], position: { x: 150, y: 150 } })
    await waitFor(() => expect(onFile).toHaveBeenCalledOnce())

    // 250 physical pixels is 125 CSS pixels: outside it.
    drop({ type: 'drop', paths: ['/tmp/b.png'], position: { x: 250, y: 250 } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onFile).toHaveBeenCalledOnce()
  })

  it('takes the first path the tool accepts', async () => {
    const onFile = vi.fn()
    render({
      onFile,
      onError: vi.fn(),
      accept: (path) => path.endsWith('.png'),
    })
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    drop({
      type: 'drop',
      paths: ['/tmp/notes.txt', '/tmp/photo.png'],
      position: { x: 10, y: 10 },
    })

    await waitFor(() => expect(onFile).toHaveBeenCalledOnce())
    expect((onFile.mock.calls[0] as [File, string])[1]).toBe('/tmp/photo.png')
  })

  // Reading the bytes to find out the file is too large is how a drop takes the window down.
  it('rejects an oversized file before reading it', async () => {
    vi.mocked(stat).mockResolvedValue({ size: 4096 } as Awaited<ReturnType<typeof stat>>)
    const onFile = vi.fn()
    const onTooLarge = vi.fn()
    render({ onFile, onError: vi.fn(), maxBytes: 1024, onTooLarge })
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    drop({ type: 'drop', paths: ['/tmp/big.bin'], position: { x: 10, y: 10 } })

    await waitFor(() => expect(onTooLarge).toHaveBeenCalledWith('/tmp/big.bin', 4096))
    expect(readFile).not.toHaveBeenCalled()
    expect(onFile).not.toHaveBeenCalled()
  })

  it('reports a read failure', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('Permission denied'))
    const onError = vi.fn()
    render({ onFile: vi.fn(), onError })
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    drop({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 10, y: 10 } })

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Permission denied'))
  })

  // A backgrounded tab stays mounted, so without the gate two instances answer one drop.
  it('does not listen while disabled', async () => {
    const onFile = vi.fn()
    render({ onFile, onError: vi.fn() }, false)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.eventHandler).toBeNull()
  })

  it('tracks the drag overlay only while the pointer is inside', async () => {
    const containerRef = makeContainer()
    const { result } = renderHook(() =>
      useNativeFileDrop(containerRef, { onFile: vi.fn(), onError: vi.fn() }, true)
    )
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    drop({ type: 'over', position: { x: 20, y: 20 } })
    await waitFor(() => expect(result.current.isDragging).toBe(true))

    drop({ type: 'over', position: { x: 400, y: 400 } })
    await waitFor(() => expect(result.current.isDragging).toBe(false))

    drop({ type: 'over', position: { x: 20, y: 20 } })
    await waitFor(() => expect(result.current.isDragging).toBe(true))
    drop({ type: 'leave' })
    await waitFor(() => expect(result.current.isDragging).toBe(false))
  })
})
