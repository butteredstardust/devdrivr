import { describe, expect, it } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import JwtDecoder from '@/tools/jwt-decoder/JwtDecoder'

const TEST_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZXhwIjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
const NULL_PAYLOAD_JWT = 'eyJhbGciOiJub25lIn0.bnVsbA.'

function base64UrlJson(value: unknown): string {
  return base64UrlText(JSON.stringify(value))
}

function base64UrlText(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

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

  it('strips a case-insensitive Bearer prefix from decoding and the token preview', () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), {
      target: { value: `bEaReR \t ${TEST_JWT}` },
    })
    expect(screen.getByText('Payload Claims')).toBeInTheDocument()
    expect(screen.getByText(TEST_JWT.split('.')[0] ?? '')).toBeInTheDocument()
  })

  it('keeps big-number claim text exact when re-signing', async () => {
    renderTool(JwtDecoder)
    const header = '{"alg":"HS256","typ":"JWT"}'
    const payload = '{"sub":12345678901234567890}'
    const token = `${base64UrlText(header)}.${base64UrlText(payload)}.signature`
    const tokenInput = screen.getByPlaceholderText(/paste a jwt/i) as HTMLTextAreaElement
    fireEvent.change(tokenInput, { target: { value: token } })

    const payloadEditor = screen.getByLabelText('Editable payload JSON') as HTMLTextAreaElement
    expect(payloadEditor.value).toContain('12345678901234567890')
    fireEvent.change(screen.getByPlaceholderText('your-256-bit-secret'), {
      target: { value: 'topsecret' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Re-sign with secret' }))

    await waitFor(() => expect(tokenInput.value).not.toBe(token))
    const encodedPayload = tokenInput.value.split('.')[1] ?? ''
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe(payload)
  })

  it('decodes UTF-8 claims without deprecated escape decoding', () => {
    renderTool(JwtDecoder)
    const token = `${base64UrlJson({ alg: 'none' })}.${base64UrlJson({ name: 'Ștefan 🌟' })}.`
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), { target: { value: token } })
    expect(screen.getByText(/Ștefan 🌟/)).toBeInTheDocument()
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

  it('names the JWT part and stage that failed', () => {
    renderTool(JwtDecoder)
    const header = base64UrlJson({ alg: 'none' })
    const invalidJson = btoa('{oops').replace(/=/g, '')
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), {
      target: { value: `${header}.${invalidJson}.` },
    })
    expect(screen.getByText(/invalid jwt payload json/i)).toBeInTheDocument()
  })

  it('treats non-object payloads as invalid instead of crashing', () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), {
      target: { value: NULL_PAYLOAD_JWT },
    })

    expect(screen.getByText(/invalid jwt/i)).toBeInTheDocument()
  })

  it('loads the fake sample token via Load sample and decodes it through the same input path as typing', () => {
    renderTool(JwtDecoder)
    expect(screen.getByText('Load sample')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Load sample'))

    const input = screen.getByPlaceholderText(/paste a jwt/i) as HTMLTextAreaElement
    expect(input.value).toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
    expect(screen.getByText('Header')).toBeInTheDocument()
    expect(screen.getByText('Payload Claims')).toBeInTheDocument()
  })

  it('annotates known claims', () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), {
      target: { value: TEST_JWT },
    })
    expect(screen.getByText('Subject')).toBeInTheDocument()
    expect(screen.getByText('Expiration')).toBeInTheDocument()
  })

  it('annotates multiple audiences instead of flattening the array', () => {
    renderTool(JwtDecoder)
    const token = `${base64UrlJson({ alg: 'none' })}.${base64UrlJson({ aud: ['api', 'web'] })}.`
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), { target: { value: token } })
    expect(screen.getByText(/2 audiences: api, web/)).toBeInTheDocument()
  })

  it('offers a shared secret for HMAC tokens', async () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), {
      target: { value: TEST_JWT },
    })
    expect(await screen.findByPlaceholderText('your-256-bit-secret')).toBeInTheDocument()
  })

  it('warns prominently for alg none', async () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), {
      target: { value: 'eyJhbGciOiJub25lIn0.e30.' },
    })
    expect(await screen.findByText(/This token is unsigned/)).toBeInTheDocument()
    expect(screen.getByText(/anyone who can reach this token can rewrite/i)).toBeInTheDocument()
  })
})
