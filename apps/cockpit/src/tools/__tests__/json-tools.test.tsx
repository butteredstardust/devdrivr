import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import JsonTools from '../json-tools/JsonTools'

describe('JsonTools', () => {
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
})
