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
import { saveFileDialog, saveFileToPath } from '@/lib/file-io'
import { renderTool } from '@/tools/__tests__/test-utils'

vi.mock('@tauri-apps/plugin-fs', () => ({
  watch: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock('@/lib/file-io', () => ({
  filenameFromPath: (path: string) => path.split(/[\\/]/).pop() || path,
  openFileDialog: vi.fn(),
  saveFileDialog: vi.fn(),
  saveFileToPath: vi.fn(),
}))

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

  it('opens a file and detects its language', () => {
    renderTool(TextEditor)

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'const answer: number = 42\n',
        filename: 'answer.ts',
        path: '/tmp/answer.ts',
      })
    })

    expect(screen.getByTestId('monaco-editor')).toHaveValue('const answer: number = 42\n')
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

  it('protects unsaved text before opening another document', () => {
    renderTool(TextEditor)
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'draft' } })

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'replacement',
        filename: 'other.txt',
        path: '/tmp/other.txt',
      })
    })

    expect(screen.getByRole('dialog', { name: 'Replace unsaved changes?' })).toBeInTheDocument()
    expect(screen.getByTestId('monaco-editor')).toHaveValue('draft')

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByTestId('monaco-editor')).toHaveValue('replacement')
  })

  it('can save an empty document back to an existing file', async () => {
    renderTool(TextEditor)
    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'remove me',
        filename: 'empty.txt',
        path: '/tmp/empty.txt',
      })
    })
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: '' } })

    act(() => dispatchToolAction({ type: 'save-file' }))

    await waitFor(() => expect(saveFileToPath).toHaveBeenCalledWith('/tmp/empty.txt', ''))
    expect(saveFileDialog).not.toHaveBeenCalled()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('uses Save As for a new document', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/notes.txt')
    renderTool(TextEditor)
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'notes' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save file' }))

    await waitFor(() => expect(saveFileDialog).toHaveBeenCalledWith('notes', 'untitled.txt'))
    expect(screen.getByText('notes.txt')).toBeInTheDocument()
  })
})
