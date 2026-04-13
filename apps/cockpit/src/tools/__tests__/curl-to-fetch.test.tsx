import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import CurlToFetch from '../curl-to-fetch/CurlToFetch'
import { useToolStateCache } from '@/stores/tool-state.store'

describe('CurlToFetch', () => {
  it('renders input and output areas', () => {
    renderTool(CurlToFetch)
    expect(screen.getByText('cURL Command')).toBeInTheDocument()
  })

  it('shows output tabs', () => {
    renderTool(CurlToFetch)
    expect(screen.getByText('fetch')).toBeInTheDocument()
    expect(screen.getByText('axios')).toBeInTheDocument()
    expect(screen.getByText('ky')).toBeInTheDocument()
    expect(screen.getByText('XHR')).toBeInTheDocument()
    expect(screen.getByText('Node.js')).toBeInTheDocument()
  })

  it('converts a simple curl command', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: "curl 'https://api.example.com/data'" } })
    expect(screen.getByText('GET')).toBeInTheDocument()
  })

  it('shows error for invalid input', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: 'not a curl command' } })
    expect(screen.getByText(/could not parse/i)).toBeInTheDocument()
  })

  it('does not show "Test in API Client" when no valid curl command', () => {
    renderTool(CurlToFetch)
    expect(screen.queryByTitle('Open this request in API Client')).not.toBeInTheDocument()
  })

  it('shows "Test in API Client" button after a valid curl command is parsed', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: "curl 'https://api.example.com/users'" } })
    expect(screen.getByTitle('Open this request in API Client')).toBeInTheDocument()
  })

  it('clicking "Test in API Client" writes parsed request to api-client tool state cache', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, {
      target: {
        value:
          "curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -d '{\"name\":\"alice\"}'",
      },
    })

    fireEvent.click(screen.getByTitle('Open this request in API Client'))

    const cached = useToolStateCache.getState().get('api-client') as Record<string, unknown>
    expect(cached).toBeTruthy()
    const draft = cached['draft'] as Record<string, unknown>
    expect(draft['method']).toBe('POST')
    expect(draft['url']).toBe('https://api.example.com/users')
    expect(draft['bodyMode']).toBe('json')
  })

  it('sets bodyMode to "text" for non-JSON body', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, {
      target: { value: "curl -X POST 'https://api.example.com' -d 'name=alice'" },
    })

    fireEvent.click(screen.getByTitle('Open this request in API Client'))

    const cached = useToolStateCache.getState().get('api-client') as Record<string, unknown>
    const draft = cached['draft'] as Record<string, unknown>
    expect(draft['bodyMode']).toBe('text')
  })

  it('maps curl headers to api-client draft headers array', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, {
      target: {
        value: "curl 'https://api.example.com' -H 'Authorization: Bearer abc123'",
      },
    })

    fireEvent.click(screen.getByTitle('Open this request in API Client'))

    const cached = useToolStateCache.getState().get('api-client') as Record<string, unknown>
    const draft = cached['draft'] as Record<string, unknown>
    const headers = draft['headers'] as Array<Record<string, unknown>>
    expect(
      headers.some((h) => h['key'] === 'Authorization' && h['value'] === 'Bearer abc123')
    ).toBe(true)
  })

  it('resets activeRequestId to null when writing to api-client cache', () => {
    // Pre-populate cache with an existing activeRequestId
    useToolStateCache.getState().set('api-client', { activeRequestId: 'existing-id', draft: {} })

    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: "curl 'https://api.example.com/data'" } })
    fireEvent.click(screen.getByTitle('Open this request in API Client'))

    const cached = useToolStateCache.getState().get('api-client') as Record<string, unknown>
    expect(cached['activeRequestId']).toBeNull()
  })
})
