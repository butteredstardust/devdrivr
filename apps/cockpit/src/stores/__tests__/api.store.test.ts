import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addHistoryEntry,
  deleteApiCollection,
  deleteApiEnvironment,
  deleteApiRequest,
  loadApiCollections,
  loadApiEnvironments,
  loadApiRequests,
  loadHistory,
  saveApiCollection,
  saveApiEnvironment,
  saveApiImport,
  saveApiRequest,
} from '@/lib/db'
import { useApiStore } from '@/stores/api.store'
import type { ApiCollection, ApiEnvironment, ApiRequest } from '@/types/models'
import { expectInitRejectionRecovers } from './init-rejection-helper'

vi.mock('@/lib/db', () => ({
  addHistoryEntry: vi.fn(),
  deleteApiCollection: vi.fn(),
  deleteApiEnvironment: vi.fn(),
  deleteApiRequest: vi.fn(),
  loadApiCollections: vi.fn(),
  loadApiEnvironments: vi.fn(),
  loadApiRequests: vi.fn(),
  loadHistory: vi.fn(),
  saveApiCollection: vi.fn(),
  saveApiEnvironment: vi.fn(),
  saveApiImport: vi.fn(),
  saveApiRequest: vi.fn(),
}))

const persistedEnvironment: ApiEnvironment = {
  id: 'env-persisted',
  name: 'Production',
  variables: { baseUrl: 'https://api.example.com' },
  createdAt: 1,
  updatedAt: 2,
}

const persistedCollection: ApiCollection = {
  id: 'collection-persisted',
  name: 'Users',
  createdAt: 3,
  updatedAt: 4,
}

const persistedRequest: ApiRequest = {
  id: 'request-persisted',
  collectionId: persistedCollection.id,
  name: 'Create user',
  method: 'POST',
  url: '{{baseUrl}}/users',
  headers: [{ key: 'X-Trace', value: '{{traceId}}', enabled: true }],
  body: '{"name":"Ada"}',
  bodyMode: 'json',
  auth: { type: 'bearer', token: '{{apiToken}}' },
  createdAt: 5,
  updatedAt: 6,
}

describe('API store persistence', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadApiEnvironments).mockResolvedValue([])
    vi.mocked(loadApiCollections).mockResolvedValue([])
    vi.mocked(loadApiRequests).mockResolvedValue([])
    vi.mocked(loadHistory).mockResolvedValue([])
    vi.mocked(saveApiEnvironment).mockResolvedValue()
    vi.mocked(saveApiCollection).mockResolvedValue()
    vi.mocked(saveApiRequest).mockResolvedValue()
    vi.mocked(saveApiImport).mockResolvedValue()
    vi.mocked(deleteApiEnvironment).mockResolvedValue()
    vi.mocked(deleteApiCollection).mockResolvedValue()
    vi.mocked(deleteApiRequest).mockResolvedValue()
    vi.mocked(addHistoryEntry).mockResolvedValue()
    useApiStore.setState({
      initialized: false,
      environments: [],
      collections: [],
      requests: [],
      activeEnvironmentId: null,
      requestHistory: [],
    })
  })

  it('reloads environments, collections, requests, and history from persistence', async () => {
    vi.mocked(loadApiEnvironments).mockResolvedValue([persistedEnvironment])
    vi.mocked(loadApiCollections).mockResolvedValue([persistedCollection])
    vi.mocked(loadApiRequests).mockResolvedValue([persistedRequest])
    const history = [
      {
        id: 'history-1',
        tool: 'api-client',
        input: 'POST {{baseUrl}}/users',
        output: '201 Created',
        timestamp: 7,
      },
    ]
    vi.mocked(loadHistory).mockResolvedValue(history)

    await useApiStore.getState().refresh()

    expect(loadHistory).toHaveBeenCalledWith('api-client', 30)
    expect(useApiStore.getState()).toMatchObject({
      environments: [persistedEnvironment],
      collections: [persistedCollection],
      requests: [persistedRequest],
      requestHistory: history,
      activeEnvironmentId: persistedEnvironment.id,
    })
  })

  it('creates and updates complete environment and request records', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003')

    const environment = await useApiStore
      .getState()
      .createEnvironment('Local', { baseUrl: 'http://127.0.0.1:3000' })
    const collection = await useApiStore.getState().createCollection('Accounts')
    const request = await useApiStore.getState().createRequest({
      collectionId: collection.id,
      name: 'Create account',
      method: 'POST',
      url: '{{baseUrl}}/accounts',
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      body: '{"enabled":true}',
      bodyMode: 'json',
      auth: { type: 'basic', username: '{{username}}', password: '{{password}}' },
    })

    expect(saveApiEnvironment).toHaveBeenCalledWith(environment)
    expect(saveApiCollection).toHaveBeenCalledWith(collection)
    expect(saveApiRequest).toHaveBeenCalledWith(request)

    vi.setSystemTime(2_000)
    await useApiStore
      .getState()
      .updateEnvironment({ ...environment, variables: { baseUrl: 'https://local.example.com' } })
    await useApiStore.getState().updateCollection({ ...collection, name: 'Customers' })
    await useApiStore.getState().updateRequest({
      ...request,
      headers: [{ key: 'X-Token', value: '{{token}}', enabled: false }],
      body: '{"enabled":false}',
      bodyMode: 'raw',
      auth: { type: 'bearer', token: '{{token}}' },
    })

    expect(useApiStore.getState()).toMatchObject({
      environments: [
        expect.objectContaining({
          variables: { baseUrl: 'https://local.example.com' },
          updatedAt: 2_000,
        }),
      ],
      collections: [expect.objectContaining({ name: 'Customers', updatedAt: 2_000 })],
      requests: [
        expect.objectContaining({
          headers: [{ key: 'X-Token', value: '{{token}}', enabled: false }],
          body: '{"enabled":false}',
          bodyMode: 'raw',
          auth: { type: 'bearer', token: '{{token}}' },
          updatedAt: 2_000,
        }),
      ],
    })
  })

  it('deletes environments, requests, and cascaded collection requests from local state', async () => {
    useApiStore.setState({
      environments: [persistedEnvironment],
      activeEnvironmentId: persistedEnvironment.id,
      collections: [persistedCollection],
      requests: [
        persistedRequest,
        { ...persistedRequest, id: 'unfiled', collectionId: null, name: 'Health' },
      ],
    })

    await useApiStore.getState().deleteEnvironment(persistedEnvironment.id)
    await useApiStore.getState().deleteCollection(persistedCollection.id)
    await useApiStore.getState().deleteRequest('unfiled')

    expect(deleteApiEnvironment).toHaveBeenCalledWith(persistedEnvironment.id)
    expect(deleteApiCollection).toHaveBeenCalledWith(persistedCollection.id)
    expect(deleteApiRequest).toHaveBeenCalledWith('unfiled')
    expect(useApiStore.getState()).toMatchObject({
      environments: [],
      activeEnvironmentId: null,
      collections: [],
      requests: [],
    })
  })

  it('imports multiple collections with fresh IDs and preserves request metadata', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(3_000)
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000011')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000012')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000013')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000014')

    useApiStore.setState({
      collections: [{ ...persistedCollection, id: '00000000-0000-4000-8000-000000000099' }],
    })

    const result = await useApiStore.getState().importApiData({
      format: 'cockpit-json',
      sourceTitle: 'Round trip',
      collections: [
        { key: 'users', name: 'Users' },
        { key: 'billing', name: 'Billing' },
      ],
      requests: [
        {
          collectionKey: 'users',
          name: 'Create user',
          method: 'POST',
          url: '{{baseUrl}}/users',
          headers: [{ key: 'X-Trace', value: '{{traceId}}', enabled: false }],
          body: '{"name":"Ada"}',
          bodyMode: 'json',
          auth: { type: 'bearer', token: '{{apiToken}}' },
        },
        {
          collectionKey: 'billing',
          name: 'Invoice',
          method: 'PATCH',
          url: '{{baseUrl}}/invoices/1',
          headers: [],
          body: 'status=paid',
          bodyMode: 'text',
          auth: { type: 'basic', username: '{{user}}', password: '{{password}}' },
        },
      ],
      warnings: [],
    })

    expect(result).toEqual({ collections: 2, requests: 2 })
    expect(saveApiImport).toHaveBeenCalledOnce()
    const [collections, requests] = vi.mocked(saveApiImport).mock.calls[0]!
    expect(collections.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: '00000000-0000-4000-8000-000000000011', name: 'Users' },
      { id: '00000000-0000-4000-8000-000000000012', name: 'Billing' },
    ])
    expect(requests).toEqual([
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000013',
        collectionId: collections[0]?.id,
        headers: [{ key: 'X-Trace', value: '{{traceId}}', enabled: false }],
        bodyMode: 'json',
        auth: { type: 'bearer', token: '{{apiToken}}' },
      }),
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000014',
        collectionId: collections[1]?.id,
        bodyMode: 'text',
        auth: { type: 'basic', username: '{{user}}', password: '{{password}}' },
      }),
    ])
    expect(
      new Set(useApiStore.getState().collections.map((collection) => collection.id)).size
    ).toBe(3)
  })
})

describe('API store initialization', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('init() clears the cached promise on rejection so a later call retries', async () => {
    const { useApiStore: freshStore } = await import('@/stores/api.store')
    vi.mocked(loadApiCollections).mockResolvedValue([])
    vi.mocked(loadApiRequests).mockResolvedValue([])
    vi.mocked(loadHistory).mockResolvedValue([])

    await expectInitRejectionRecovers({
      runInit: () => freshStore.getState().init(),
      arrangeFailure: () => {
        vi.mocked(loadApiEnvironments).mockRejectedValueOnce(new Error('db locked'))
      },
      arrangeSuccess: () => {
        vi.mocked(loadApiEnvironments).mockResolvedValueOnce([persistedEnvironment])
      },
      rejectMessage: 'db locked',
      assertAfterFailure: () => {
        // A rejected Promise.all means `set()` was never called, so state is
        // untouched from its module-fresh defaults — unlike mcp.store, api.store's
        // init() does not set `initialized: true` on failure, only on success.
        expect(freshStore.getState().environments).toEqual([])
        expect(freshStore.getState().initialized).toBe(false)
      },
      assertAfterSuccess: () => {
        expect(freshStore.getState().environments).toEqual([persistedEnvironment])
        expect(freshStore.getState().initialized).toBe(true)
      },
      getCallCount: () => vi.mocked(loadApiEnvironments).mock.calls.length,
    })
  })
})
