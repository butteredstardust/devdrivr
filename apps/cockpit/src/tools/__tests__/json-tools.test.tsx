import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import JsonTools, { isTabularJsonArray } from '@/tools/json-tools/JsonTools'

const recordMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useToolHistory', () => ({
  useToolHistory: () => ({ record: recordMock }),
}))

describe('JsonTools', () => {
  beforeEach(() => {
    recordMock.mockClear()
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
})
