import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
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
})
