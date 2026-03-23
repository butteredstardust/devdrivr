import { describe, expect, it } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import JsonSchemaValidator from '../json-schema-validator/JsonSchemaValidator'

describe('JsonSchemaValidator', () => {
  it('renders both editors', () => {
    renderTool(JsonSchemaValidator)
    expect(screen.getByText('JSON Data')).toBeInTheDocument()
    expect(screen.getByText('JSON Schema')).toBeInTheDocument()
  })

  it('shows validation result for valid data', async () => {
    renderTool(JsonSchemaValidator)
    const editors = screen.getAllByTestId('monaco-editor')
    fireEvent.change(editors[0]!, { target: { value: '{"name": "test"}' } })
    fireEvent.change(editors[1]!, {
      target: { value: '{"type": "object", "properties": {"name": {"type": "string"}}}' },
    })
    await waitFor(() => {
      expect(screen.getByText(/Valid/)).toBeInTheDocument()
    })
  })

  it('shows template buttons', () => {
    renderTool(JsonSchemaValidator)
    expect(screen.getByText('Basic')).toBeInTheDocument()
  })
})
