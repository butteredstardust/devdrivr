import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import JwtDecoder from '../jwt-decoder/JwtDecoder'

const TEST_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZXhwIjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

describe('JwtDecoder', () => {
  it('renders input area', () => {
    renderTool(JwtDecoder)
    expect(screen.getByPlaceholderText(/paste a jwt/i)).toBeInTheDocument()
  })

  it('decodes a valid JWT', () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), {
      target: { value: TEST_JWT },
    })
    expect(screen.getByText('Header')).toBeInTheDocument()
    expect(screen.getByText('Payload Claims')).toBeInTheDocument()
    expect(screen.getByText('Signature')).toBeInTheDocument()
  })

  it('shows expiry badge for expired token', () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), {
      target: { value: TEST_JWT },
    })
    const matches = screen.getAllByText(/expired/i)
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(matches[0]).toBeInTheDocument()
  })

  it('shows error for invalid token', () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), {
      target: { value: 'not.a.jwt' },
    })
    expect(screen.getByText(/invalid jwt/i)).toBeInTheDocument()
  })

  it('annotates known claims', () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), {
      target: { value: TEST_JWT },
    })
    expect(screen.getByText('Subject')).toBeInTheDocument()
    expect(screen.getByText('Expiration')).toBeInTheDocument()
  })
})
