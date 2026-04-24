import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { renderTool } from './test-utils'
import { useApiStore } from '@/stores/api.store'
import ApiClient, { buildUrlWithParams, parseQueryParams } from '@/tools/api-client/ApiClient'
import { CollectionsSidebar } from '@/tools/api-client/components/CollectionsSidebar'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: fetchMock,
}))

function base64EncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

describe('api-client URL helpers', () => {
  it('parses query params from templated URLs', () => {
    expect(parseQueryParams('{{baseUrl}}/users?page=1&filter=active')).toEqual([
      { key: 'page', value: '1' },
      { key: 'filter', value: 'active' },
    ])
  })

  it('rebuilds templated URLs after params change', () => {
    expect(
      buildUrlWithParams('{{baseUrl}}/users?page=1#details', [
        { key: 'filter', value: 'active users' },
        { key: 'page', value: '2' },
      ])
    ).toBe('{{baseUrl}}/users?filter=active+users&page=2#details')
  })
})

describe('ApiClient', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('ok', { status: 200, statusText: 'OK' }))
    useApiStore.setState({
      environments: [],
      collections: [],
      requests: [],
      activeEnvironmentId: null,
      requestHistory: [],
    })
  })

  it('renders URL input', () => {
    renderTool(ApiClient)
    expect(screen.getByPlaceholderText(/\{\{baseUrl\}\}\/endpoint/i)).toBeInTheDocument()
  })

  it('renders method selector', () => {
    renderTool(ApiClient)
    expect(screen.getByDisplayValue('GET')).toBeInTheDocument()
  })

  it('renders send button', () => {
    renderTool(ApiClient)
    expect(screen.getByText('Send')).toBeInTheDocument()
  })

  it('renders import button', () => {
    renderTool(ApiClient)
    expect(screen.getByText('Import...')).toBeInTheDocument()
  })

  it('renders request tabs', () => {
    renderTool(ApiClient)
    expect(screen.getByText('Params')).toBeInTheDocument()
    expect(screen.getByText('Headers')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('starts with the response pane collapsed and lets users reveal it', () => {
    renderTool(ApiClient)
    const emptyResponse = screen.getByText('Send a request to see the response')

    expect(screen.getByText('Show Response')).toBeInTheDocument()
    expect(emptyResponse.parentElement).toHaveClass('hidden')

    fireEvent.click(screen.getByText('Show Response'))

    expect(screen.getByText('Hide Response')).toBeInTheDocument()
    expect(emptyResponse.parentElement).not.toHaveClass('hidden')
  })

  it('keeps the response pane hidden during requests after the user hides it', async () => {
    renderTool(ApiClient)
    const emptyResponse = screen.getByText('Send a request to see the response')
    const responsePanel = emptyResponse.parentElement

    fireEvent.click(screen.getByText('Show Response'))
    fireEvent.click(screen.getByText('Hide Response'))
    fireEvent.change(screen.getByPlaceholderText(/\{\{baseUrl\}\}\/endpoint/i), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => expect(screen.getByText('Show Response')).toBeInTheDocument())
    expect(responsePanel).toHaveClass('hidden')
  })

  it('encodes non-ASCII Basic auth credentials as UTF-8 bytes', async () => {
    renderTool(ApiClient)

    fireEvent.change(screen.getByPlaceholderText(/\{\{baseUrl\}\}\/endpoint/i), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByText('Auth'))
    fireEvent.change(screen.getByDisplayValue('No Auth'), {
      target: { value: 'basic' },
    })
    fireEvent.change(screen.getByPlaceholderText('Username'), {
      target: { value: 'Jörg' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'päss🔐' },
    })

    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => expect(tauriFetch).toHaveBeenCalledOnce())
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: `Basic ${base64EncodeUtf8('Jörg:päss🔐')}`,
      },
    })
  })

  it('clears the previous response body when a new request fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('ok', { status: 200, statusText: 'OK' }))
      .mockRejectedValueOnce(new Error('Network down'))

    renderTool(ApiClient)

    fireEvent.change(screen.getByPlaceholderText(/\{\{baseUrl\}\}\/endpoint/i), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => expect(screen.getByDisplayValue('ok')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/\{\{baseUrl\}\}\/endpoint/i), {
      target: { value: 'https://offline.example.com' },
    })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => expect(screen.getByText('Network down')).toBeInTheDocument())
    expect(screen.queryByDisplayValue('ok')).not.toBeInTheDocument()
  })

  it('restores history entries with safe GET defaults instead of stale auth or body', async () => {
    useApiStore.setState({
      requestHistory: [
        {
          id: 'hist-1',
          tool: 'api-client',
          input: 'GET https://history.example.com/users?page=1',
          output: '200 OK · 12ms · 2 B',
          timestamp: Date.now(),
        },
      ],
    })

    renderTool(ApiClient)

    fireEvent.change(screen.getByDisplayValue('GET'), { target: { value: 'POST' } })
    fireEvent.click(screen.getByText('Body'))
    fireEvent.click(screen.getByText('JSON'))
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '{"stale":true}' },
    })
    fireEvent.click(screen.getByText('Auth'))
    fireEvent.change(screen.getByDisplayValue('No Auth'), {
      target: { value: 'bearer' },
    })
    fireEvent.change(screen.getByPlaceholderText(/token/i), {
      target: { value: 'secret-token' },
    })

    fireEvent.click(screen.getByText('History'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Restore GET https://history.example.com/users?page=1' })
    )
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => expect(tauriFetch).toHaveBeenCalledOnce())
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://history.example.com/users?page=1')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', headers: {} })
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('body')
  })

  it('renders saved request rows as selectable buttons', () => {
    const request = {
      id: 'req-1',
      collectionId: null,
      name: 'Get User',
      method: 'GET',
      url: 'https://example.com/user',
      headers: [],
      body: '',
      bodyMode: 'none',
      auth: { type: 'none' as const },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const onSelect = vi.fn()
    useApiStore.setState({ requests: [request], requestHistory: [] })

    render(<CollectionsSidebar activeRequestId={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get User' }))

    expect(onSelect).toHaveBeenCalledWith(request)
  })

  it('renders history rows as restore buttons', () => {
    useApiStore.setState({
      requestHistory: [
        {
          id: 'hist-1',
          tool: 'api-client',
          input: 'GET https://example.com/history',
          output: '200 OK · 10ms · 2 B',
          timestamp: Date.now(),
        },
      ],
    })

    render(
      <CollectionsSidebar activeRequestId={null} onSelect={vi.fn()} onLoadFromHistory={vi.fn()} />
    )
    fireEvent.click(screen.getByText('History'))

    expect(
      screen.getByRole('button', { name: 'Restore GET https://example.com/history' })
    ).toBeInTheDocument()
  })
})
