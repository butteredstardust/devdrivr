import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTextDocumentFileActions } from '@/hooks/useTextDocumentFileActions'
import { openFileDialog, saveFileDialog, saveFileToPath } from '@/lib/file-io'
import { subscribeToolAction } from '@/lib/tool-actions'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@/lib/file-io', () => ({
  openFileDialog: vi.fn(),
  saveFileDialog: vi.fn(),
  saveFileToPath: vi.fn(),
  filenameFromPath: (path: string) => path.split(/[\\/]/).pop() || path,
}))

type Options = Parameters<typeof useTextDocumentFileActions>[0]

function setup(overrides: Partial<Options> = {}) {
  const onSaved = vi.fn()
  const options: Options = {
    getContent: () => '<root />',
    filePath: null,
    fileName: null,
    defaultFileName: 'document.xml',
    onSaved,
    ...overrides,
  }
  const { result } = renderHook(() => useTextDocumentFileActions(options))
  return { result, onSaved }
}

function lastAction() {
  return useUiStore.getState().lastAction
}

beforeEach(() => {
  vi.clearAllMocks()
  useUiStore.setState({ lastAction: null })
})

describe('useTextDocumentFileActions', () => {
  it('saves to the existing path without prompting', async () => {
    const { result } = setup({ filePath: '/tmp/doc.xml', fileName: 'doc.xml' })

    await act(() => result.current.handleSave())

    expect(saveFileToPath).toHaveBeenCalledWith('/tmp/doc.xml', '<root />')
    expect(saveFileDialog).not.toHaveBeenCalled()
    expect(lastAction()).toMatchObject({ message: 'Saved doc.xml', type: 'success' })
  })

  it('falls through to Save As when the document has no path yet', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/new.xml')
    const { result, onSaved } = setup()

    await act(() => result.current.handleSave())

    expect(saveFileDialog).toHaveBeenCalledWith('<root />', 'document.xml')
    expect(onSaved).toHaveBeenCalledWith({ filePath: '/tmp/new.xml', fileName: 'new.xml' })
  })

  it('re-reads the default name per save, so a changed language picks a new extension', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue(null)
    let extension = 'ts'
    const { result } = setup({ defaultFileName: () => `formatted.${extension}` })

    await act(() => result.current.handleSaveAs())
    expect(saveFileDialog).toHaveBeenLastCalledWith('<root />', 'formatted.ts')

    extension = 'css'
    await act(() => result.current.handleSaveAs())
    expect(saveFileDialog).toHaveBeenLastCalledWith('<root />', 'formatted.css')
  })

  it('refuses to write an empty document rather than truncating the file on disk', async () => {
    const { result } = setup({ getContent: () => '   ', filePath: '/tmp/doc.xml' })

    await act(() => result.current.handleSave())

    expect(saveFileToPath).not.toHaveBeenCalled()
    expect(lastAction()).toMatchObject({ message: 'Nothing to save yet', type: 'info' })
  })

  it('reports a cancelled dialog as information, not as a failure', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue(null)
    const { result, onSaved } = setup()

    await act(() => result.current.handleSaveAs())

    expect(onSaved).not.toHaveBeenCalled()
    expect(lastAction()).toMatchObject({ message: 'Save cancelled', type: 'info' })
  })

  it('surfaces a write failure instead of claiming success', async () => {
    vi.mocked(saveFileToPath).mockRejectedValue(new Error('disk full'))
    const { result } = setup({ filePath: '/tmp/doc.xml', fileName: 'doc.xml' })

    await act(() => result.current.handleSave())

    expect(lastAction()).toMatchObject({ message: 'Save failed: disk full', type: 'error' })
  })

  it('dispatches the opened file as a tool action rather than applying it itself', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: '<a />',
      filename: 'a.xml',
      path: '/tmp/a.xml',
    })
    const received = vi.fn()
    const unsubscribe = subscribeToolAction(received)
    const { result } = setup()

    await act(() => result.current.handleOpen())
    unsubscribe()

    expect(received).toHaveBeenCalledWith({
      type: 'open-file',
      content: '<a />',
      filename: 'a.xml',
      path: '/tmp/a.xml',
    })
  })

  it('reports an open failure', async () => {
    vi.mocked(openFileDialog).mockRejectedValue(new Error('no permission'))
    const { result } = setup()

    await act(() => result.current.handleOpen())

    expect(lastAction()).toMatchObject({ message: 'Open failed: no permission', type: 'error' })
  })
})
