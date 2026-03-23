import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import Base64Tool from '../base64/Base64Tool'

describe('Base64Tool', () => {
  it('renders encode mode by default', () => {
    renderTool(Base64Tool)
    expect(screen.getByText('Encode →')).toBeInTheDocument()
  })

  it('encodes text to base64', () => {
    renderTool(Base64Tool)
    const input = screen.getByPlaceholderText(/enter text to encode/i)
    fireEvent.change(input, { target: { value: 'hello' } })
    expect(screen.getByText('aGVsbG8=')).toBeInTheDocument()
  })

  it('toggles to decode mode', () => {
    renderTool(Base64Tool)
    fireEvent.click(screen.getByText('Encode →'))
    expect(screen.getByText('← Decode')).toBeInTheDocument()
  })

  it('decodes base64 to text', () => {
    renderTool(Base64Tool)
    fireEvent.click(screen.getByText('Encode →'))
    const input = screen.getByPlaceholderText(/enter base64/i)
    fireEvent.change(input, { target: { value: 'aGVsbG8=' } })
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})
