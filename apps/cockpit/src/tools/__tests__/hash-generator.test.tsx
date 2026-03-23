import { describe, expect, it, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import HashGenerator from '../hash-generator/HashGenerator'

describe('HashGenerator', () => {
  it('renders input area', () => {
    renderTool(HashGenerator)
    expect(screen.getByPlaceholderText(/enter text to hash/i)).toBeInTheDocument()
  })

  it('shows hash values after typing', async () => {
    vi.useFakeTimers()
    renderTool(HashGenerator)
    const input = screen.getByPlaceholderText(/enter text to hash/i)
    fireEvent.change(input, { target: { value: 'test' } })
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await waitFor(() => {
      expect(screen.getByText('MD5')).toBeInTheDocument()
      expect(screen.getByText('SHA-256')).toBeInTheDocument()
    })
  })

  it('shows placeholder when input is empty', () => {
    renderTool(HashGenerator)
    expect(screen.getByText(/enter text above to see hashes/i)).toBeInTheDocument()
  })
})
