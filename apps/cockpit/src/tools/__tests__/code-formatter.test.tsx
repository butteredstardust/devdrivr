import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import CodeFormatter from '../code-formatter/CodeFormatter'
import { FORMATTER_WORKER_METHODS } from '@/workers/formatter.methods'
import { dispatchToolAction } from '@/lib/tool-actions'
import { saveFileDialog } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@/lib/file-io', () => ({
  saveFileDialog: vi.fn(),
}))

describe('CodeFormatter', () => {
  beforeEach(() => {
    vi.mocked(saveFileDialog).mockReset()
  })

  it('declares every formatter worker API method', () => {
    expect(FORMATTER_WORKER_METHODS).toEqual(['format', 'detectLanguage', 'getSupportedLanguages'])
  })

  it('renders format button', () => {
    renderTool(CodeFormatter)
    expect(screen.getByText('Format')).toBeInTheDocument()
  })

  it('renders language selector', () => {
    renderTool(CodeFormatter)
    expect(screen.getByDisplayValue('javascript')).toBeInTheDocument()
  })

  it('renders editor', () => {
    renderTool(CodeFormatter)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('shows formatting options', () => {
    renderTool(CodeFormatter)
    expect(screen.getByText('Single quotes')).toBeInTheDocument()
    expect(screen.getByText('Semicolons')).toBeInTheDocument()
  })

  it('loads globally opened file content into the editor', () => {
    renderTool(CodeFormatter)

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'const answer=42',
        filename: 'answer.ts',
      })
    })

    expect(screen.getByTestId('monaco-editor')).toHaveValue('const answer=42')
  })

  it('saves current output and handles cancellation', async () => {
    vi.mocked(saveFileDialog).mockResolvedValueOnce('/tmp/formatted.js').mockResolvedValueOnce(null)
    renderTool(CodeFormatter)

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() => expect(saveFileDialog).toHaveBeenCalledWith('', 'formatted.js'))

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() => expect(saveFileDialog).toHaveBeenCalledTimes(2))
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Save cancelled',
      type: 'info',
    })
  })

  // ── Worker round-trip ────────────────────────────────────────────
  // These only pass if the format button actually drives the real prettier
  // worker logic through the RPC mock — a no-op worker mock never resolves
  // and the editor value would never change.

  it('reformats messy JS into prettier output via the real formatter worker', async () => {
    renderTool(CodeFormatter)
    const editor = screen.getByTestId('monaco-editor')

    fireEvent.change(editor, { target: { value: 'const   x={a:1,b:2}' } })
    fireEvent.click(screen.getByText('Format'))

    await waitFor(() => {
      expect(editor).toHaveValue('const x = { a: 1, b: 2 }\n')
    })
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Formatted',
      type: 'success',
    })
  })

  it('surfaces a real parse error from the formatter worker', async () => {
    renderTool(CodeFormatter)
    const editor = screen.getByTestId('monaco-editor')

    fireEvent.change(editor, { target: { value: 'const x = {' } })
    fireEvent.click(screen.getByText('Format'))

    await waitFor(() => {
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Format error',
        type: 'error',
      })
    })
  })

  it('auto-detects JSON via the real formatter worker', async () => {
    renderTool(CodeFormatter)
    const editor = screen.getByTestId('monaco-editor')

    fireEvent.change(editor, { target: { value: '{"a":1}' } })
    fireEvent.click(screen.getByText('Auto-detect'))

    await waitFor(() => {
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Detected: json',
        type: 'info',
      })
    })
  })
})
