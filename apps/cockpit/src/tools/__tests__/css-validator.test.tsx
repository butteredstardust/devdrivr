import { describe, expect, it } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import CssValidator from '../css-validator/CssValidator'

describe('CssValidator', () => {
  it('renders editor and lint UI', () => {
    renderTool(CssValidator)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    expect(screen.getByText('Rules')).toBeInTheDocument()
    expect(screen.getByText('Lint Demo')).toBeInTheDocument()
  })

  it('validates correct CSS', async () => {
    renderTool(CssValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'body { color: red; }' } })
    await waitFor(() => {
      expect(screen.getByText(/Valid CSS/)).toBeInTheDocument()
    })
  })

  it('shows warnings for lint issues', async () => {
    renderTool(CssValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, {
      target: {
        value: '#page .container .item { width: 0; color: #ffffff; }',
      },
    })
    await waitFor(() => {
      expect(screen.getByText(/warning/i)).toBeInTheDocument()
      expect(screen.getAllByText(/overqualified/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/Use a length unit for zero values/i)).toBeInTheDocument()
      expect(screen.getByText(/Avoid ID selectors like "#page"/i)).toBeInTheDocument()
    })
  })

  it('allows disabling lint rules', async () => {
    renderTool(CssValidator)
    fireEvent.click(screen.getByText('Rules'))
    const checkbox = screen.getByRole('checkbox', { name: /Overqualified selectors/i })
    expect(checkbox).toBeInTheDocument()
    fireEvent.click(checkbox)

    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, {
      target: {
        value: '#page .container .item { width: 0; }',
      },
    })

    await waitFor(() => {
      expect(screen.queryByText(/Selector is overqualified/i)).not.toBeInTheDocument()
      expect(screen.getByText(/zero-units/i)).toBeInTheDocument()
    })
  })

  it('shows syntax errors for invalid CSS', async () => {
    renderTool(CssValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'body { : red }' } })
    await waitFor(() => {
      expect(screen.getByText(/syntax/i)).toBeInTheDocument()
    })
  })

  it('formats CSS when the Format button is clicked', async () => {
    renderTool(CssValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '.foo{color:red;}' } })
    fireEvent.click(screen.getByText('Format'))

    await waitFor(() => {
      expect(editor).toHaveValue('.foo {\n  color: red;\n}\n')
    })
  })
})
