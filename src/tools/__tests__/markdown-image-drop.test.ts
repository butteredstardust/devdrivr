import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readFile } from '@tauri-apps/plugin-fs'
import { readSupportedTextFile } from '@/lib/file-io'
import { useImageDrop } from '@/tools/markdown-editor/hooks/useImageDrop'

const mocks = vi.hoisted(() => ({
  eventHandler: null as ((event: { payload: Record<string, unknown> }) => void) | null,
  unlisten: vi.fn(),
  scaleFactor: vi.fn(),
  executeEdits: vi.fn(),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn() }))

vi.mock('@/lib/file-io', () => ({
  filenameFromPath: (path: string) => path.split(/[\\/]/).pop() || path,
  readSupportedTextFile: vi.fn(),
}))

function makeEditorRef() {
  return {
    current: {
      getPosition: () => ({ lineNumber: 1, column: 1 }),
      getModel: () => ({
        getOffsetAt: () => 0,
        getPositionAt: () => ({ lineNumber: 1, column: 1 }),
      }),
      executeEdits: mocks.executeEdits,
      focus: vi.fn(),
    },
  }
}

function makeContainerRef() {
  const element = document.createElement('div')
  element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100 }) as DOMRect
  return { current: element }
}

function drop(paths: string[]) {
  act(() => {
    mocks.eventHandler?.({ payload: { type: 'drop', paths, position: { x: 20, y: 20 } } })
  })
}

describe('markdown editor file drop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.eventHandler = null
    mocks.scaleFactor.mockResolvedValue(1)
    vi.mocked(readFile).mockResolvedValue(new Uint8Array([1, 2, 3]))
    vi.mocked(getCurrentWebviewWindow).mockReturnValue({
      scaleFactor: mocks.scaleFactor,
      onDragDropEvent: vi.fn(async (handler) => {
        mocks.eventHandler = handler as typeof mocks.eventHandler
        return mocks.unlisten
      }),
    } as unknown as ReturnType<typeof getCurrentWebviewWindow>)
  })

  const render = (onTextFile = vi.fn(), onError = vi.fn()) => {
    const editorRef = makeEditorRef()
    const containerRef = makeContainerRef()
    renderHook(() =>
      useImageDrop(
        editorRef as unknown as Parameters<typeof useImageDrop>[0],
        containerRef,
        onTextFile,
        onError
      )
    )
    return { onTextFile, onError }
  }

  it('embeds a dropped image at the cursor', async () => {
    render()
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    drop(['/tmp/diagram.png'])

    await waitFor(() => expect(mocks.executeEdits).toHaveBeenCalled())
    const [, edits] = mocks.executeEdits.mock.calls[0] as [string, Array<{ text: string }>]
    expect(edits[0]?.text).toContain('![diagram.png](data:image/png;base64,')
  })

  // The tool owns the whole drop, so a text file has nowhere else to go. Before this it reached
  // the shell, which is no longer listening for this tool.
  it('opens a dropped text file as the document', async () => {
    vi.mocked(readSupportedTextFile).mockResolvedValue('# Notes')
    const { onTextFile } = render()
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    drop(['/tmp/notes.md'])

    await waitFor(() =>
      expect(onTextFile).toHaveBeenCalledWith('# Notes', 'notes.md', '/tmp/notes.md')
    )
    expect(mocks.executeEdits).not.toHaveBeenCalled()
  })

  it('reports a text file it cannot read', async () => {
    vi.mocked(readSupportedTextFile).mockRejectedValue(new Error('Unsupported binary file'))
    const { onError } = render()
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    drop(['/tmp/archive.zip'])

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Unsupported binary file'))
  })

  // One drop of both kinds is an image drop. Opening a document would throw the images away.
  it('prefers the images when a drop mixes both kinds', async () => {
    const { onTextFile } = render()
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    drop(['/tmp/notes.md', '/tmp/diagram.png'])

    await waitFor(() => expect(mocks.executeEdits).toHaveBeenCalled())
    expect(onTextFile).not.toHaveBeenCalled()
  })
})
