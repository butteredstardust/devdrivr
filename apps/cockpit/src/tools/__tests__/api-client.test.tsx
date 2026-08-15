import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { renderTool } from './test-utils'
import { useApiStore } from '@/stores/api.store'
import { importApiSpec } from '@/lib/api-import'
import ApiClient, { buildUrlWithParams, parseQueryParams } from '@/tools/api-client/ApiClient'
import { CollectionsSidebar } from '@/tools/api-client/components/CollectionsSidebar'

const fetchMock = vi.hoisted(() => vi.fn())
const clipboardWriteText = vi.fn()

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
    clipboardWriteText.mockReset()
    clipboardWriteText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
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

  it('renders import and export controls in the library footer', () => {
    renderTool(ApiClient)
    expect(screen.getByRole('button', { name: 'Import requests' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export requests' })).toBeInTheDocument()
  })

  it('exports requests in a format that preserves collections and request metadata on import', async () => {
    useApiStore.setState({
      collections: [
        {
          id: 'collection-1',
          name: 'Accounts',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      requests: [
        {
          id: 'request-1',
          collectionId: 'collection-1',
          name: 'Create account',
          method: 'POST',
          url: '{{baseUrl}}/accounts',
          headers: [{ key: 'X-Trace', value: '{{traceId}}', enabled: false }],
          body: '{"enabled":true}',
          bodyMode: 'json',
          auth: { type: 'bearer', token: '{{apiToken}}' },
          createdAt: 3,
          updatedAt: 4,
        },
      ],
    })
    renderTool(ApiClient)

    fireEvent.click(screen.getByRole('button', { name: 'Export requests' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledOnce())
    const exported = clipboardWriteText.mock.calls[0]?.[0]
    expect(exported).toBeTypeOf('string')
    expect(JSON.parse(exported as string)).toEqual([
      {
        name: 'Create account',
        method: 'POST',
        url: '{{baseUrl}}/accounts',
        headers: [{ key: 'X-Trace', value: '{{traceId}}', enabled: false }],
        body: '{"enabled":true}',
        bodyMode: 'json',
        auth: { type: 'bearer', token: '{{apiToken}}' },
        collectionKey: 'collection-1',
        collectionName: 'Accounts',
      },
    ])

    const imported = importApiSpec({ content: exported as string })
    expect(imported.collections).toEqual([{ key: 'collection-1', name: 'Accounts' }])
    expect(imported.requests[0]).toMatchObject({
      collectionKey: 'collection-1',
      headers: [{ key: 'X-Trace', value: '{{traceId}}', enabled: false }],
      body: '{"enabled":true}',
      bodyMode: 'json',
      auth: { type: 'bearer', token: '{{apiToken}}' },
    })
  })

  it('round-trips distinct collections with duplicate names using export-local keys', async () => {
    useApiStore.setState({
      collections: [
        { id: 'collection-1', name: 'Users', createdAt: 1, updatedAt: 1 },
        { id: 'collection-2', name: 'users', createdAt: 2, updatedAt: 2 },
      ],
      requests: [
        {
          id: 'request-1',
          collectionId: 'collection-1',
          name: 'List users',
          method: 'GET',
          url: '{{baseUrl}}/users',
          headers: [],
          body: '',
          bodyMode: 'none',
          auth: { type: 'none' },
          createdAt: 3,
          updatedAt: 3,
        },
        {
          id: 'request-2',
          collectionId: 'collection-2',
          name: 'List legacy users',
          method: 'GET',
          url: '{{legacyUrl}}/users',
          headers: [],
          body: '',
          bodyMode: 'none',
          auth: { type: 'none' },
          createdAt: 4,
          updatedAt: 4,
        },
      ],
    })
    renderTool(ApiClient)

    fireEvent.click(screen.getByRole('button', { name: 'Export requests' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledOnce())
    const imported = importApiSpec({ content: clipboardWriteText.mock.calls[0]?.[0] as string })
    expect(imported.collections).toEqual([
      { key: 'collection-1', name: 'Users' },
      { key: 'collection-2', name: 'users' },
    ])
    expect(imported.requests.map((request) => request.collectionKey)).toEqual([
      'collection-1',
      'collection-2',
    ])
  })

  it('renders request tabs', () => {
    renderTool(ApiClient)
    expect(screen.getByText('Params')).toBeInTheDocument()
    expect(screen.getByText('Headers')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('enables a JSON body and content type when switching GET to POST', () => {
    renderTool(ApiClient)

    fireEvent.change(screen.getByDisplayValue('GET'), { target: { value: 'POST' } })
    fireEvent.click(screen.getByText('Body'))

    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    expect(screen.queryByText('Body is disabled')).not.toBeInTheDocument()

    // The tab label now carries the active-header count.
    fireEvent.click(screen.getByRole('button', { name: 'Headers (1)' }))
    expect(screen.getByDisplayValue('Content-Type')).toBeInTheDocument()
    expect(screen.getByDisplayValue('application/json')).toBeInTheDocument()
  })

  it('starts with the response pane collapsed and lets users reveal it', () => {
    renderTool(ApiClient)

    const toggle = screen.getByRole('button', { name: 'Show Response' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Response' })).not.toBeInTheDocument()
    expect(screen.queryByText('Send a request to see the response')).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Hide Response' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByText('Send a request to see the response')).toBeInTheDocument()
  })

  it('keeps the response pane hidden during requests after the user hides it', async () => {
    renderTool(ApiClient)

    fireEvent.click(screen.getByRole('button', { name: 'Show Response' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hide Response' }))
    fireEvent.change(screen.getByPlaceholderText(/\{\{baseUrl\}\}\/endpoint/i), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => expect(tauriFetch).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Show Response' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Response' })).not.toBeInTheDocument()
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

  it('announces a request error via role="alert"', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network down'))

    renderTool(ApiClient)

    fireEvent.change(screen.getByPlaceholderText(/\{\{baseUrl\}\}\/endpoint/i), {
      target: { value: 'https://offline.example.com' },
    })
    fireEvent.click(screen.getByText('Send'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Network down')
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
    // The edited draft is unsaved, so the guard asks before replacing it.
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
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

  it('resets a loaded request when its collection deletion removes it from the store', async () => {
    const request = {
      id: 'req-active',
      collectionId: 'collection-active',
      name: 'Get active user',
      method: 'GET',
      url: 'https://example.com/active-user',
      headers: [],
      body: '',
      bodyMode: 'none',
      auth: { type: 'none' as const },
      createdAt: 1,
      updatedAt: 2,
    }
    useApiStore.setState({
      collections: [
        {
          id: 'collection-active',
          name: 'Active',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      requests: [request],
    })
    renderTool(ApiClient)

    fireEvent.click(screen.getByRole('button', { name: 'Get active user' }))
    expect(screen.getByDisplayValue('https://example.com/active-user')).toBeInTheDocument()

    act(() => {
      useApiStore.setState({ collections: [], requests: [] })
    })

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/\{\{baseUrl\}\}\/endpoint/i)).toHaveValue('')
    )
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
  const savedRequest = {
    id: 'req-saved',
    collectionId: null,
    name: 'Get User',
    method: 'GET',
    url: 'https://example.com/user',
    headers: [],
    body: '',
    bodyMode: 'none',
    auth: { type: 'none' as const },
    createdAt: 1,
    updatedAt: 2,
  }

  it('guards unsaved draft edits before opening a saved request', () => {
    useApiStore.setState({ requests: [savedRequest] })
    renderTool(ApiClient)

    const urlInput = screen.getByPlaceholderText(/\{\{baseUrl\}\}\/endpoint/i)
    fireEvent.change(urlInput, { target: { value: 'https://draft.example.com' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Get User' }))

    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByPlaceholderText(/\{\{baseUrl\}\}\/endpoint/i)).toHaveValue(
      'https://draft.example.com'
    )
  })

  it('loads the saved request once the discard is confirmed', () => {
    useApiStore.setState({ requests: [savedRequest] })
    renderTool(ApiClient)

    fireEvent.change(screen.getByPlaceholderText(/\{\{baseUrl\}\}\/endpoint/i), {
      target: { value: 'https://draft.example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Get User' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(screen.getByDisplayValue('https://example.com/user')).toBeInTheDocument()
    expect(screen.getByLabelText('Request name')).toHaveValue('Get User')
  })

  it('opens a saved request without prompting when the draft is untouched', () => {
    useApiStore.setState({ requests: [savedRequest] })
    renderTool(ApiClient)

    fireEvent.click(screen.getByRole('button', { name: 'Get User' }))

    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('https://example.com/user')).toBeInTheDocument()
  })

  it('does not treat a bare method switch as unsaved work', () => {
    renderTool(ApiClient)

    expect(screen.getByText('New request — not saved yet')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('GET'), { target: { value: 'POST' } })

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('confirms before deleting a saved request', () => {
    const deleteRequest = vi.fn().mockResolvedValue(undefined)
    useApiStore.setState({ requests: [savedRequest], deleteRequest })
    render(<CollectionsSidebar activeRequestId={null} onSelect={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Get User' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))

    expect(deleteRequest).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete request' }))
    expect(deleteRequest).toHaveBeenCalledWith('req-saved')
  })

  it('warns that deleting a collection also deletes the requests inside it', () => {
    const deleteCollection = vi.fn().mockResolvedValue(undefined)
    useApiStore.setState({
      collections: [{ id: 'col-1', name: 'Accounts', createdAt: 1, updatedAt: 1 }],
      requests: [{ ...savedRequest, collectionId: 'col-1' }],
      deleteCollection,
    })
    render(<CollectionsSidebar activeRequestId={null} onSelect={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete collection Accounts' }))

    expect(screen.getByText('1 saved request inside it will also be deleted.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete collection' }))
    expect(deleteCollection).toHaveBeenCalledWith('col-1')
  })

  it('filters saved requests by name, URL, and method', () => {
    useApiStore.setState({
      requests: [
        savedRequest,
        { ...savedRequest, id: 'req-2', name: 'Create order', method: 'POST', url: '/orders' },
      ],
    })
    render(<CollectionsSidebar activeRequestId={null} onSelect={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search saved requests'), {
      target: { value: 'order' },
    })

    expect(screen.getByRole('button', { name: 'Create order' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Get User' })).not.toBeInTheDocument()
    expect(screen.getByText('1 matching request')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search saved requests'), { target: { value: 'zzz' } })
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('moves arrow-key focus between visible request rows', () => {
    useApiStore.setState({
      requests: [savedRequest, { ...savedRequest, id: 'req-2', name: 'Create order' }],
    })
    render(<CollectionsSidebar activeRequestId={null} onSelect={vi.fn()} />)

    const first = screen.getByRole('button', { name: 'Get User' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create order' }))
  })

  it('saves an already-saved request without reopening the save dialog', async () => {
    const updateRequest = vi.fn().mockResolvedValue(undefined)
    useApiStore.setState({ requests: [savedRequest], updateRequest })
    renderTool(ApiClient)

    fireEvent.click(screen.getByRole('button', { name: 'Get User' }))
    fireEvent.change(screen.getByDisplayValue('https://example.com/user'), {
      target: { value: 'https://example.com/user?page=2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateRequest).toHaveBeenCalledOnce())
    expect(updateRequest.mock.calls[0]?.[0]).toMatchObject({
      id: 'req-saved',
      url: 'https://example.com/user?page=2',
    })
    expect(screen.queryByText('Save Request')).not.toBeInTheDocument()
  })

  it('closes only the confirm dialog when Escape is pressed inside the environment manager', () => {
    useApiStore.setState({
      environments: [
        {
          id: 'env-1',
          name: 'Local',
          variables: { baseUrl: 'http://x' },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })
    renderTool(ApiClient)

    fireEvent.click(screen.getByRole('button', { name: 'Manage environments' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const confirm = screen.getByRole('dialog', { name: 'Delete environment?' })
    fireEvent.keyDown(confirm, { key: 'Escape' })

    expect(screen.queryByText('Delete environment?')).not.toBeInTheDocument()
    expect(screen.getByText('Manage Environments')).toBeInTheDocument()
  })

  it('keeps focus while renaming an environment variable', () => {
    useApiStore.setState({
      environments: [
        {
          id: 'env-1',
          name: 'Local',
          variables: { baseUrl: 'http://x' },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      updateEnvironment: vi.fn().mockResolvedValue(undefined),
    })
    renderTool(ApiClient)

    fireEvent.click(screen.getByRole('button', { name: 'Manage environments' }))
    const keyInput = screen.getByLabelText('Variable 1 name')
    keyInput.focus()
    fireEvent.change(keyInput, { target: { value: 'baseUrlX' } })

    expect(screen.getByLabelText('Variable 1 name')).toHaveValue('baseUrlX')
    expect(document.activeElement).toBe(screen.getByLabelText('Variable 1 name'))
  })
})
