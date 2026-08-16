import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import UrlCodec from '../url-codec/UrlCodec'

describe('UrlCodec', () => {
  it('renders encode mode by default', () => {
    renderTool(UrlCodec)
    expect(screen.getByRole('button', { name: 'Encode' })).toBeInTheDocument()
  })

  it('encodes special characters', () => {
    renderTool(UrlCodec)
    const input = screen.getByPlaceholderText(/enter text or url/i)
    fireEvent.change(input, { target: { value: 'hello world' } })
    expect(screen.getByText('hello%20world')).toBeInTheDocument()
  })

  it('shows URL parts for a valid URL', () => {
    renderTool(UrlCodec)
    const input = screen.getByPlaceholderText(/enter text or url/i)
    fireEvent.change(input, { target: { value: 'https://example.com/path?q=1' } })
    expect(screen.getByText('URL Parts')).toBeInTheDocument()
  })

  it('toggles to decode mode', () => {
    renderTool(UrlCodec)
    fireEvent.click(screen.getByRole('button', { name: 'Encode' }))
    expect(screen.getByRole('button', { name: 'Decode' })).toBeInTheDocument()
  })
})
