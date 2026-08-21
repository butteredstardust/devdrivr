import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import UrlCodec, { transformUrlInput } from '../url-codec/UrlCodec'

describe('transformUrlInput', () => {
  it('decodes every nested level when requested', () => {
    expect(
      transformUrlInput('hello%252520world', {
        mode: 'decode',
        encodeMode: 'component',
        bulk: false,
        recursive: true,
      })
    ).toBe('hello world')
  })

  it('converts each line independently in bulk mode', () => {
    expect(
      transformUrlInput('hello world\na/b', {
        mode: 'encode',
        encodeMode: 'component',
        bulk: true,
        recursive: false,
      })
    ).toBe('hello%20world\na%2Fb')
  })

  it('keeps decoding valid bulk lines when another line is malformed', () => {
    expect(
      transformUrlInput('hello%20world\nbad%ZZ\na%2Fb', {
        mode: 'decode',
        encodeMode: 'component',
        bulk: true,
        recursive: false,
      })
    ).toBe('hello world\n[decode error: malformed percent encoding] bad%ZZ\na/b')
  })
})

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

  it('exposes bulk and recursive decoding controls', () => {
    renderTool(UrlCodec)
    expect(screen.getByRole('switch', { name: 'Each line' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Encode' }))
    expect(screen.getByRole('switch', { name: 'Decode all levels' })).toBeInTheDocument()
  })
})
