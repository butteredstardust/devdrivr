import { describe, expect, it } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import CssValidator from '../css-validator/CssValidator'

describe('CssValidator', () => {
  it('renders editor', () => {
    renderTool(CssValidator)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('validates correct CSS', async () => {
    renderTool(CssValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'body { color: red; }' } })
    await waitFor(() => {
      expect(screen.getByText(/Valid CSS/)).toBeInTheDocument()
    })
  })

  it('shows errors for invalid CSS', async () => {
    renderTool(CssValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'body { : red }' } })
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })
  })
})
