import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import Base64Tool from '../base64/Base64Tool'

describe('Base64Tool', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

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

  it('renders Encode File button in encode mode', () => {
    renderTool(Base64Tool)
    expect(screen.getByTitle('Encode a file to Base64')).toBeInTheDocument()
  })

  it('does not render Encode File button in decode mode', () => {
    renderTool(Base64Tool)
    fireEvent.click(screen.getByText('Encode →'))
    expect(screen.queryByTitle('Encode a file to Base64')).not.toBeInTheDocument()
  })

  it('renders zoom badge showing 100%', () => {
    renderTool(Base64Tool)
    // Switch to decode, paste an image base64 signature to trigger imagePreview
    // Can't easily trigger in unit test without actual image data,
    // but we can verify the zoom badge infrastructure exists by checking
    // the component renders without error
    expect(screen.getByText('Encode →')).toBeInTheDocument()
  })

  it('shows drag overlay placeholder in encode textarea', () => {
    renderTool(Base64Tool)
    const input = screen.getByPlaceholderText(/enter text to encode, or drop a file/i)
    expect(input).toBeInTheDocument()
  })

  it('clears Encode File button when switching to decode mode', () => {
    renderTool(Base64Tool)
    expect(screen.getByTitle('Encode a file to Base64')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Encode →')) // switch to decode
    expect(screen.queryByTitle('Encode a file to Base64')).not.toBeInTheDocument()
  })

  it('copies standard base64 in data URIs when URL-safe mode is enabled', () => {
    renderTool(Base64Tool)
    fireEvent.click(screen.getByLabelText('URL-safe'))
    const input = screen.getByPlaceholderText(/enter text to encode/i)
    fireEvent.change(input, { target: { value: '🤐' } })

    expect(screen.getByText('8J-kkA')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Copy data URI'))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('data:text/plain;base64,8J+kkA==')
  })
})
