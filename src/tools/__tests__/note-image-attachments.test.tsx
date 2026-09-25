import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNoteImageAttachments } from '@/tools/notes/useNoteImageAttachments'
import type { EditorInstance } from '@/tools/markdown-editor/markdown-model'
import { MAX_NOTE_IMAGE_BYTES } from '@/lib/file-limits'

const mocks = vi.hoisted(() => ({
  dragHandler: null as ((event: unknown) => Promise<void>) | null,
  readFile: vi.fn(),
  stat: vi.fn(),
  importNoteImage: vi.fn(),
  scaleFactor: vi.fn().mockResolvedValue(2),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    scaleFactor: mocks.scaleFactor,
    onDragDropEvent: vi.fn(async (handler: (event: unknown) => Promise<void>) => {
      mocks.dragHandler = handler
      return () => {}
    }),
  }),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: mocks.readFile, stat: mocks.stat }))
vi.mock('@/lib/note-assets', () => ({ importNoteImage: mocks.importNoteImage }))

function editor() {
  return {
    getModel: vi.fn(() => ({})),
    getPosition: vi.fn(() => ({ lineNumber: 2, column: 3 })),
    executeEdits: vi.fn(),
    focus: vi.fn(),
  }
}

describe('useNoteImageAttachments', () => {
  beforeEach(() => {
    mocks.dragHandler = null
    mocks.readFile.mockReset().mockResolvedValue(new Uint8Array([137, 80, 78, 71]))
    mocks.stat.mockReset().mockResolvedValue({ size: 4 })
    mocks.importNoteImage.mockReset().mockResolvedValue('![diagram](devdrivr-asset:asset-id)')
  })

  it('imports a native file drop inside the active editor using logical coordinates', async () => {
    const mountedEditor = editor()
    const container = document.createElement('div')
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    })
    const onSuccess = vi.fn()
    renderHook(() =>
      useNoteImageAttachments(
        mountedEditor as unknown as EditorInstance,
        { current: container },
        { onSuccess, onError: vi.fn() },
        true,
        'note-1'
      )
    )
    await waitFor(() => expect(mocks.dragHandler).not.toBeNull())

    await act(async () => {
      await mocks.dragHandler?.({
        payload: {
          type: 'drop',
          paths: ['/tmp/diagramă.png'],
          position: { x: 100, y: 100 },
        },
      })
    })

    expect(mocks.readFile).toHaveBeenCalledWith('/tmp/diagramă.png')
    expect(mocks.importNoteImage).toHaveBeenCalledWith(expect.any(Uint8Array), 'diagramă.png')
    expect(mountedEditor.executeEdits).toHaveBeenCalledWith('note-image-attachment', [
      expect.objectContaining({ text: '\n![diagram](devdrivr-asset:asset-id)\n' }),
    ])
    expect(onSuccess).toHaveBeenCalledWith(1)
  })

  it('rejects an oversized dropped image before reading it', async () => {
    const container = document.createElement('div')
    const onError = vi.fn()
    mocks.stat.mockResolvedValue({ size: MAX_NOTE_IMAGE_BYTES + 1 })
    renderHook(() =>
      useNoteImageAttachments(
        editor() as unknown as EditorInstance,
        { current: container },
        { onSuccess: vi.fn(), onError },
        true,
        'note-1'
      )
    )
    await waitFor(() => expect(mocks.dragHandler).not.toBeNull())

    await act(async () => {
      await mocks.dragHandler?.({ payload: { type: 'drop', paths: ['/tmp/huge.png'] } })
    })

    expect(onError).toHaveBeenCalledWith('huge.png exceeds the 10 MiB attachment limit')
    expect(mocks.readFile).not.toHaveBeenCalled()
    expect(mocks.importNoteImage).not.toHaveBeenCalled()
  })

  it('rejects an oversized pasted image before reading it', () => {
    const onError = vi.fn()
    function Harness() {
      const { onPasteCapture } = useNoteImageAttachments(
        editor() as unknown as EditorInstance,
        { current: null },
        { onSuccess: vi.fn(), onError },
        false,
        'note-1'
      )
      return <div data-testid="target" onPasteCapture={onPasteCapture} />
    }
    const { getByTestId } = render(<Harness />)
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: MAX_NOTE_IMAGE_BYTES + 1 })
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer')

    fireEvent.paste(getByTestId('target'), { clipboardData: { files: [file] } })

    expect(onError).toHaveBeenCalledWith('shot.png exceeds the 10 MiB attachment limit')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('does not register a drop listener for an inactive Notes tab', async () => {
    renderHook(() =>
      useNoteImageAttachments(
        editor() as unknown as EditorInstance,
        { current: document.createElement('div') },
        { onSuccess: vi.fn(), onError: vi.fn() },
        false,
        'note-1'
      )
    )
    await Promise.resolve()
    expect(mocks.dragHandler).toBeNull()
  })

  it('does not insert into a different note when Monaco reuses the editor instance', async () => {
    const mountedEditor = editor()
    const container = document.createElement('div')
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    })
    let finishImport: ((markdown: string) => void) | undefined
    mocks.importNoteImage.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishImport = resolve
        })
    )
    const onError = vi.fn()
    const { rerender } = renderHook(
      ({ noteId }) =>
        useNoteImageAttachments(
          mountedEditor as unknown as EditorInstance,
          { current: container },
          { onSuccess: vi.fn(), onError },
          true,
          noteId
        ),
      { initialProps: { noteId: 'note-1' } }
    )
    await waitFor(() => expect(mocks.dragHandler).not.toBeNull())
    const drop = mocks.dragHandler?.({
      payload: {
        type: 'drop',
        paths: ['/tmp/slow.png'],
        position: { x: 100, y: 100 },
      },
    })
    await waitFor(() => expect(mocks.importNoteImage).toHaveBeenCalledOnce())

    rerender({ noteId: 'note-2' })
    finishImport?.('![slow](devdrivr-asset:asset-id)')
    await act(async () => await drop)

    expect(mountedEditor.executeEdits).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('The active note changed before the image import finished')
  })
})
