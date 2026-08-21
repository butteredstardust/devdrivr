import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import UuidGenerator, { generateV5 } from '../uuid-generator/UuidGenerator'

describe('UuidGenerator', () => {
  it('matches the RFC v5 DNS vector', () => {
    expect(generateV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'example.com')).toBe(
      'cfbff0d1-9375-5685-968c-48ce8b15ae17'
    )
  })
  it('renders generate button', () => {
    renderTool(UuidGenerator)
    expect(screen.getByText('Generate UUID')).toBeInTheDocument()
  })

  it('generates a valid UUID on click', () => {
    renderTool(UuidGenerator)
    fireEvent.click(screen.getByText('Generate UUID'))
    const code = document.querySelector('code')
    expect(code?.textContent).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })

  it('validates a correct UUID', () => {
    renderTool(UuidGenerator)
    const input = screen.getByPlaceholderText(/paste a uuid/i)
    fireEvent.change(input, { target: { value: '550e8400-e29b-41d4-a716-446655440000' } })
    expect(screen.getByText(/valid uuid/i)).toBeInTheDocument()
  })

  it('rejects an invalid UUID', () => {
    renderTool(UuidGenerator)
    const input = screen.getByPlaceholderText(/paste a uuid/i)
    fireEvent.change(input, { target: { value: 'not-a-uuid' } })
    expect(screen.getByText(/not a valid/i)).toBeInTheDocument()
  })

  it('shows namespace and name inputs for v5', () => {
    renderTool(UuidGenerator)
    fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: 'v5' } })
    expect(screen.getByText('Namespace UUID')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('example.com')).toBeInTheDocument()
  })
})
