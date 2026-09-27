import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TextEditor from '@/tools/text-editor/TextEditor'
import {
  countLines,
  detectTextEditorLanguage,
  lineEndingLabel,
  TEXT_EDITOR_LANGUAGES,
} from '@/tools/text-editor/text-editor-model'
import { dispatchToolAction } from '@/lib/tool-actions'
import { readEncodedTextFile, saveEncodedTextFile, saveFileDialog } from '@/lib/file-io'
import { getSetting } from '@/lib/db'
import { resetRecentFilesStore, useRecentFilesStore } from '@/stores/recent-files.store'
import { useToolStateCache } from '@/stores/tool-state.store'
import { renderTool } from '@/tools/__tests__/test-utils'

vi.mock('@tauri-apps/plugin-fs', () => ({
  watch: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  getSetting: vi.fn().mockResolvedValue([]),
  setSetting: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/file-io', () => ({
  filenameFromPath: (path: string) => path.split(/[\\/]/).pop() || path,
  openEncodedTextFileDialog: vi.fn(),
  readEncodedTextFile: vi.fn(),
  saveFileDialog: vi.fn(),
  saveEncodedTextFile: vi.fn(),
}))

// The shell dispatches lossy UTF-8. The editor reads the file again and uses that result.
function openFromShell(content: string, filename: string, encoding = 'utf-8' as const) {
  vi.mocked(readEncodedTextFile).mockResolvedValueOnce({ content, encoding })
  act(() => {
    dispatchToolAction({ type: 'open-file', content, filename, path: `/tmp/${filename}` })
  })
}

afterEach(() => {
  vi.clearAllMocks()
  resetRecentFilesStore()
})

describe('text editor model', () => {
  it('offers each Monaco language once', () => {
    const ids = TEXT_EDITOR_LANGUAGES.map((language) => language.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('detects common extensions and special filenames', () => {
    expect(detectTextEditorLanguage('App.tsx')).toBe('typescript')
    expect(detectTextEditorLanguage('/tmp/script.py')).toBe('python')
    expect(detectTextEditorLanguage('.zshrc')).toBe('shell')
    expect(detectTextEditorLanguage('Dockerfile')).toBe('dockerfile')
    expect(detectTextEditorLanguage('README.unknown')).toBe('plaintext')
  })

  it('reports document line metadata', () => {
    expect(countLines('')).toBe(1)
    expect(countLines('one\r\ntwo\r\nthree')).toBe(3)
    expect(lineEndingLabel('one\r\ntwo')).toBe('CRLF')
    expect(lineEndingLabel('one\ntwo')).toBe('LF')
  })
})

describe('TextEditor', () => {
  it('renders the editor and document controls', () => {
    renderTool(TextEditor)

    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New document' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Language: Plain Text' })).toBeInTheDocument()
  })

  it('opens a file and detects its language', async () => {
    renderTool(TextEditor)

    openFromShell('const answer: number = 42\n', 'answer.ts')

    await waitFor(() =>
      expect(screen.getByTestId('monaco-editor')).toHaveValue('const answer: number = 42\n')
    )
    expect(readEncodedTextFile).toHaveBeenCalledWith('/tmp/answer.ts', expect.anything())
    expect(screen.getByRole('button', { name: 'Language: TypeScript' })).toBeInTheDocument()
    expect(screen.getByText('answer.ts')).toBeInTheDocument()
  })

  it('allows a manual language override from the status bar', () => {
    renderTool(TextEditor)

    fireEvent.click(screen.getByRole('button', { name: 'Language: Plain Text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Python' }))

    expect(screen.getByRole('button', { name: 'Language: Python' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Python' })).not.toBeInTheDocument()
  })

  it('detects the language again when Save As gives a new extension', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/script.py')
    renderTool(TextEditor)
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'print(1)' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save file' }))

    expect(await screen.findByRole('button', { name: 'Language: Python' })).toBeInTheDocument()
  })

  it('keeps a language the user picked when Save As gives a new extension', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/script.py')
    renderTool(TextEditor)
    fireEvent.click(screen.getByRole('button', { name: 'Language: Plain Text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ruby' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save file' }))

    await waitFor(() => expect(screen.getByText('script.py')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Language: Ruby' })).toBeInTheDocument()
  })

  it('treats an encoding change as unsaved and saves in the new encoding', async () => {
    renderTool(TextEditor)
    openFromShell('hello', 'a.txt')
    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue('hello'))
    expect(screen.getByText('Saved')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save with encoding: UTF-8' }))
    fireEvent.click(screen.getByRole('button', { name: 'UTF-8 with BOM' }))
    expect(screen.getByText('Unsaved')).toBeInTheDocument()

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() =>
      expect(saveEncodedTextFile).toHaveBeenCalledWith('/tmp/a.txt', 'hello', 'utf-8-bom')
    )
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('finds the encoding of a file restored from state saved without one', async () => {
    vi.mocked(readEncodedTextFile).mockResolvedValue({ content: 'hi', encoding: 'utf-8-bom' })
    useToolStateCache.setState({
      cache: new Map([
        [
          'text-editor',
          { content: 'hi', savedContent: 'hi', fileName: 'bom.txt', filePath: '/tmp/bom.txt' },
        ],
      ]),
    })
    render(<TextEditor />)

    expect(
      await screen.findByRole('button', { name: 'Save with encoding: UTF-8 with BOM' })
    ).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('keeps a language picked before the manual flag existed', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/notes.py')
    useToolStateCache.setState({
      cache: new Map([
        [
          'text-editor',
          { content: 'x', savedContent: '', fileName: 'notes.txt', language: 'ruby' },
        ],
      ]),
    })
    render(<TextEditor />)

    fireEvent.click(screen.getByRole('button', { name: 'Save file' }))

    await waitFor(() => expect(screen.getByText('notes.py')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Language: Ruby' })).toBeInTheDocument()
  })

  it('moves a language from the earlier detection to the current one', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/renamed.py')
    useToolStateCache.setState({
      cache: new Map([
        [
          'text-editor',
          { content: 'x', savedContent: '', fileName: 'Cargo.toml', language: 'ini' },
        ],
      ]),
    })
    render(<TextEditor />)

    expect(screen.getByRole('button', { name: 'Language: TOML' })).toBeInTheDocument()

    // The language is still automatic, so Save As detects it again.
    fireEvent.click(screen.getByRole('button', { name: 'Save file' }))
    await waitFor(() => expect(screen.getByText('renamed.py')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Language: Python' })).toBeInTheDocument()
  })

  it('toggles word wrap for this tab', () => {
    renderTool(TextEditor)
    const toggle = screen.getByRole('button', { name: 'Wrap: On' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Wrap: Off' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('records opened files and opens one again from the recent list', async () => {
    renderTool(TextEditor)
    openFromShell('first', 'first.txt')
    await waitFor(() => expect(useRecentFilesStore.getState().paths).toEqual(['/tmp/first.txt']))
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

    vi.mocked(readEncodedTextFile).mockResolvedValueOnce({ content: 'first', encoding: 'utf-8' })
    fireEvent.click(screen.getByRole('button', { name: 'Recent files' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open /tmp/first.txt' }))

    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue('first'))
    expect(screen.getByText('first.txt')).toBeInTheDocument()
  })

  it('removes a recent file that cannot be read', async () => {
    vi.mocked(getSetting).mockResolvedValueOnce(['/tmp/gone.txt'])
    vi.mocked(readEncodedTextFile).mockRejectedValueOnce(new Error('No such file'))
    renderTool(TextEditor)

    fireEvent.click(screen.getByRole('button', { name: 'Recent files' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open /tmp/gone.txt' }))

    await waitFor(() => expect(useRecentFilesStore.getState().paths).toEqual([]))
  })

  it('offers Format document only for a language the formatter supports', async () => {
    renderTool(TextEditor)
    expect(screen.getByRole('button', { name: 'Format document' })).toBeDisabled()

    openFromShell('{"a":1}', 'data.json')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Format document' })).toBeEnabled()
    )
  })

  it('lists the line and case transforms', () => {
    renderTool(TextEditor)

    fireEvent.click(screen.getByRole('button', { name: 'Transform text' }))

    expect(screen.getByRole('button', { name: 'Sort lines A to Z' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove duplicate lines' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'snake_case' })).toBeInTheDocument()
  })

  it('drops a slow open that finishes after New', async () => {
    let finishRead: (value: { content: string; encoding: 'utf-8' }) => void = () => {}
    vi.mocked(readEncodedTextFile).mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve
      })
    )
    renderTool(TextEditor)
    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'x',
        filename: 'slow.txt',
        path: '/tmp/slow.txt',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    await act(async () => finishRead({ content: 'slow', encoding: 'utf-8' }))

    expect(screen.getByTestId('monaco-editor')).toHaveValue('')
    expect(screen.queryByText('slow.txt')).not.toBeInTheDocument()
  })

  it('asks before an open replaces an unsaved encoding change', async () => {
    renderTool(TextEditor)
    fireEvent.click(screen.getByRole('button', { name: 'Save with encoding: UTF-8' }))
    fireEvent.click(screen.getByRole('button', { name: 'UTF-16 LE' }))

    openFromShell('other', 'b.txt')

    expect(
      await screen.findByRole('dialog', { name: 'Replace unsaved changes?' })
    ).toBeInTheDocument()
  })

  it('protects unsaved text before opening another document', async () => {
    renderTool(TextEditor)
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'draft' } })

    openFromShell('replacement', 'other.txt')

    expect(
      await screen.findByRole('dialog', { name: 'Replace unsaved changes?' })
    ).toBeInTheDocument()
    expect(screen.getByTestId('monaco-editor')).toHaveValue('draft')

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByTestId('monaco-editor')).toHaveValue('replacement')
  })

  it('can save an empty document back to an existing file', async () => {
    renderTool(TextEditor)
    openFromShell('remove me', 'empty.txt')
    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue('remove me'))
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: '' } })

    act(() => dispatchToolAction({ type: 'save-file' }))

    await waitFor(() =>
      expect(saveEncodedTextFile).toHaveBeenCalledWith('/tmp/empty.txt', '', 'utf-8')
    )
    expect(saveFileDialog).not.toHaveBeenCalled()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('uses Save As for a new document', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/notes.txt')
    renderTool(TextEditor)
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'notes' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save file' }))

    await waitFor(() =>
      expect(saveFileDialog).toHaveBeenCalledWith('notes', 'untitled.txt', 'utf-8')
    )
    expect(screen.getByText('notes.txt')).toBeInTheDocument()
  })

  it('saves a legacy file back in the encoding it was opened with', async () => {
    renderTool(TextEditor)
    vi.mocked(readEncodedTextFile).mockResolvedValueOnce({
      content: 'café',
      encoding: 'windows-1252',
    })
    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'caf\ufffd',
        filename: 'old.txt',
        path: '/tmp/old.txt',
      })
    })

    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue('café'))
    expect(screen.getByText('Windows-1252')).toBeInTheDocument()

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() =>
      expect(saveEncodedTextFile).toHaveBeenCalledWith('/tmp/old.txt', 'café', 'windows-1252')
    )
  })

  it('does not open lossy shell content when the exact read fails', async () => {
    renderTool(TextEditor)
    vi.mocked(readEncodedTextFile).mockRejectedValueOnce(new Error('gone'))
    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'lossy',
        filename: 'x.txt',
        path: '/tmp/x.txt',
      })
    })

    await waitFor(() => expect(readEncodedTextFile).toHaveBeenCalled())
    expect(screen.getByTestId('monaco-editor')).toHaveValue('')
  })
})
