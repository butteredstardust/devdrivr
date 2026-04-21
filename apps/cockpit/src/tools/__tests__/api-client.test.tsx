import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { renderTool } from './test-utils'
import { useApiStore } from '@/stores/api.store'
import ApiClient from '../api-client/ApiClient'
import { CollectionsSidebar } from '../api-client/components/CollectionsSidebar'

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
})
