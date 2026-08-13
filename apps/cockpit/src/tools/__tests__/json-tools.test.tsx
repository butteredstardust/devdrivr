import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import JsonTools, { isTabularJsonArray } from '@/tools/json-tools/JsonTools'
import { dispatchToolAction } from '@/lib/tool-actions'
import { saveFileDialog } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'

const recordMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useToolHistory', () => ({
  useToolHistory: () => ({ record: recordMock }),
}))

vi.mock('@/lib/file-io', () => ({
  saveFileDialog: vi.fn(),
}))

describe('JsonTools', () => {
  beforeEach(() => {
    recordMock.mockClear()
    vi.mocked(saveFileDialog).mockReset()
  })

  it('renders editor', () => {
    renderTool(JsonTools)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('shows format button', () => {
    renderTool(JsonTools)
    expect(screen.getByText('Format')).toBeInTheDocument()
  })

  it('shows minify button', () => {
    renderTool(JsonTools)
    expect(screen.getByText('Minify')).toBeInTheDocument()
  })

  it('shows valid indicator for valid JSON', () => {
    renderTool(JsonTools)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '{"a": 1, "b": 2}' } })
    expect(screen.getByText(/Valid/)).toBeInTheDocument()
  })

  it('shows tab bar with view modes', () => {
    renderTool(JsonTools)
    expect(screen.getByText('Lint & Format')).toBeInTheDocument()
    expect(screen.getByText('Tree View')).toBeInTheDocument()
    expect(screen.getByText('Table View')).toBeInTheDocument()
  })

  it('treats only arrays of objects as table-compatible data', () => {
    expect(isTabularJsonArray([{ id: 1 }, { id: 2 }])).toBe(true)
    expect(isTabularJsonArray([1, 2, 3])).toBe(false)
    expect(isTabularJsonArray([{ id: 1 }, null])).toBe(false)
  })

  it('shows guidance instead of an empty grid for primitive arrays', () => {
    renderTool(JsonTools)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '[1,2,3]' } })
    fireEvent.click(screen.getByText('Table View'))

    expect(screen.getByText('Table view requires a JSON array of objects')).toBeInTheDocument()
  })

  it('does not record history just because valid JSON was edited', () => {
    renderTool(JsonTools)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '{"a": 1}' } })

    expect(recordMock).not.toHaveBeenCalled()
  })

  it('opens dropped JSON and saves the current editor content', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/data.json')
    renderTool(JsonTools)

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: '{"opened":true}',
        filename: 'opened.json',
      })
    })
    expect(screen.getByTestId('monaco-editor')).toHaveValue('{"opened":true}')

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() =>
      expect(saveFileDialog).toHaveBeenCalledWith('{"opened":true}', 'opened.json')
    )
  })

  it('shows a Load Sample button only while empty, and populates the editor through the same input path as typing', () => {
    renderTool(JsonTools)
    const editor = screen.getByTestId('monaco-editor')
    expect(screen.getByText('Load Sample')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Load Sample'))

    expect((editor as HTMLTextAreaElement).value).toContain('"customer": "Ada Lovelace"')
    // Once populated, the affordance disappears — same as the empty-state contract.
    expect(screen.queryByText('Load Sample')).not.toBeInTheDocument()
    // Loaded content is valid JSON, same as if the user had typed it into the editor.
    expect(screen.getByText(/Valid/)).toBeInTheDocument()
  })

  it('surfaces save failures without clearing JSON input', async () => {
    vi.mocked(saveFileDialog).mockRejectedValue(new Error('disk full'))
    renderTool(JsonTools)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '{"safe":true}' },
    })

    act(() => dispatchToolAction({ type: 'save-file' }))

    await waitFor(() => expect(saveFileDialog).toHaveBeenCalledOnce())
    expect(screen.getByTestId('monaco-editor')).toHaveValue('{"safe":true}')
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Save failed: disk full',
      type: 'error',
    })
  })
})
