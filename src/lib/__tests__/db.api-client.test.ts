import { describe, expect, it, vi } from 'vitest'
import type { ApiCollection, ApiEnvironment, ApiRequest } from '@/types/models'
import { useSqliteTestDatabase } from '@/test-utils/sqlite-db'

vi.mock(
  '@tauri-apps/plugin-sql',
  async () => (await import('@/test-utils/sqlite-db')).sqlitePluginModule
)
vi.mock(
  '@tauri-apps/api/core',
  async () => (await import('@/test-utils/sqlite-db')).sqliteCoreModule
)

const database = useSqliteTestDatabase()

const environment: ApiEnvironment = {
  id: 'env-1',
  name: 'Production',
  variables: { baseUrl: 'https://api.example.com', token: '{{secret}}' },
  createdAt: 1,
  updatedAt: 2,
}

const collection: ApiCollection = {
  id: 'collection-1',
  name: 'Users',
  createdAt: 3,
  updatedAt: 4,
}

const request: ApiRequest = {
  id: 'request-1',
  collectionId: collection.id,
  name: 'Create user',
  method: 'POST',
  url: '{{baseUrl}}/users',
  headers: [{ key: 'X-Trace', value: '{{traceId}}', enabled: false }],
  body: '{"name":"Ada"}',
  bodyMode: 'json',
  auth: { type: 'basic', username: '{{username}}', password: '{{password}}' },
  createdAt: 5,
  updatedAt: 6,
}

describe('API Client persistence', () => {
  it('round-trips environments, collections and requests intact', async () => {
    const db = await import('@/lib/db')

    await db.saveApiEnvironment(environment)
    await db.saveApiCollection(collection)
    await db.saveApiRequest(request)

    await expect(db.loadApiEnvironments()).resolves.toEqual([environment])
    expect((await db.loadApiCollections()).find((c) => c.id === collection.id)).toMatchObject(
      collection
    )
    await expect(db.loadApiRequests()).resolves.toEqual([request])
  })

  it('imports collections before the requests that reference them', async () => {
    const db = await import('@/lib/db')

    await db.saveApiImport([collection], [request], [environment], environment.id)

    await expect(db.loadApiRequests()).resolves.toEqual([request])
    await expect(db.loadApiEnvironments()).resolves.toEqual([environment])
    await expect(db.getSetting<string | null>('apiActiveEnvironmentId', null)).resolves.toBe(
      environment.id
    )
  })

  it('writes nothing from an import when one request fails', async () => {
    const db = await import('@/lib/db')
    const broken = { ...request, id: 'request-2', name: null as unknown as string }

    await expect(db.saveApiImport([collection], [request, broken])).rejects.toThrow(
      'NOT NULL constraint failed'
    )

    const requests = await database().connection.select<unknown[]>('SELECT id FROM api_requests')
    const collections = await database().connection.select<unknown[]>(
      'SELECT id FROM api_collections WHERE id = $1',
      [collection.id]
    )
    expect(requests).toEqual([])
    expect(collections).toEqual([])
  })
})
