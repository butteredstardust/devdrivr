import { act, fireEvent, screen, waitFor } from '@testing-library/react'
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
import { renderTool } from '@/tools/__tests__/test-utils'

vi.mock('@tauri-apps/plugin-fs', () => ({
  watch: vi.fn().mockResolvedValue(() => {}),
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
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('plaintext')
  })

  it('opens a file and detects its language', async () => {
    renderTool(TextEditor)

    openFromShell('const answer: number = 42\n', 'answer.ts')

    await waitFor(() =>
      expect(screen.getByTestId('monaco-editor')).toHaveValue('const answer: number = 42\n')
    )
    expect(readEncodedTextFile).toHaveBeenCalledWith('/tmp/answer.ts', expect.anything())
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('typescript')
    expect(screen.getByText('answer.ts')).toBeInTheDocument()
  })

  it('allows a manual language override', () => {
    renderTool(TextEditor)

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'python' },
    })

    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('python')
    expect(screen.getAllByText('Python')).toHaveLength(2)
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
