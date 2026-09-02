import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiCollection, ApiEnvironment, ApiRequest } from '@/types/models'

const sqlMock = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  load: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: sqlMock.load,
  },
}))

const coreMock = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: coreMock.invoke }))

type BatchPayload = { statements: Array<{ sql: string; params: unknown[] }>; immediate: boolean }

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

describe('API Client DB helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    coreMock.invoke.mockResolvedValue(undefined)
    sqlMock.execute.mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 })
    sqlMock.load.mockResolvedValue({
      execute: sqlMock.execute,
      select: sqlMock.select,
    })
  })

  it('serializes complete environment and request records on save', async () => {
    const { saveApiEnvironment, saveApiRequest } = await import('@/lib/db')

    await saveApiEnvironment(environment)
    await saveApiRequest(request)

    expect(sqlMock.execute).toHaveBeenCalledWith(expect.stringContaining('api_environments'), [
      environment.id,
      environment.name,
      JSON.stringify(environment.variables),
      environment.createdAt,
      environment.updatedAt,
    ])
    expect(sqlMock.execute).toHaveBeenCalledWith(expect.stringContaining('api_requests'), [
      request.id,
      request.collectionId,
      request.name,
      request.method,
      request.url,
      JSON.stringify(request.headers),
      request.body,
      request.bodyMode,
      JSON.stringify(request.auth),
      request.createdAt,
      request.updatedAt,
    ])
  })

  it('loads headers, auth, body mode, variables, and collection relationships intact', async () => {
    sqlMock.select
      .mockResolvedValueOnce([
        {
          id: environment.id,
          name: environment.name,
          variables: JSON.stringify(environment.variables),
          created_at: environment.createdAt,
          updated_at: environment.updatedAt,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: collection.id,
          name: collection.name,
          created_at: collection.createdAt,
          updated_at: collection.updatedAt,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: request.id,
          collection_id: request.collectionId,
          name: request.name,
          method: request.method,
          url: request.url,
          headers: JSON.stringify(request.headers),
          body: request.body,
          body_mode: request.bodyMode,
          auth: JSON.stringify(request.auth),
          created_at: request.createdAt,
          updated_at: request.updatedAt,
        },
      ])
    const { loadApiCollections, loadApiEnvironments, loadApiRequests } = await import('@/lib/db')

    await expect(loadApiEnvironments()).resolves.toEqual([environment])
    await expect(loadApiCollections()).resolves.toEqual([collection])
    await expect(loadApiRequests()).resolves.toEqual([request])
  })

  it('saves imports through the atomic batch command, collections before requests', async () => {
    const { saveApiImport } = await import('@/lib/db')

    await saveApiImport([collection], [request])

    // The whole import is one command invocation, so the Rust side can wrap it in a
    // single transaction on a single connection. Nothing is written via the plugin pool.
    expect(coreMock.invoke).toHaveBeenCalledTimes(1)
    const [command, payload] = coreMock.invoke.mock.calls[0] as [string, BatchPayload]
    expect(command).toBe('db_execute_batch')
    expect(payload.immediate).toBe(false)
    expect(payload.statements.map((s) => s.sql.trim())).toEqual([
      expect.stringContaining('INSERT INTO api_collections'),
      expect.stringContaining('INSERT INTO api_requests'),
    ])
    expect(payload.statements[1]?.params[1]).toBe(collection.id)

    const pluginStatements = sqlMock.execute.mock.calls.map(([sql]) => String(sql).trim())
    expect(pluginStatements).not.toContain('BEGIN TRANSACTION')
    expect(pluginStatements).not.toContain('COMMIT')
  })

  it('propagates a failed import batch instead of leaving partial state claims', async () => {
    coreMock.invoke.mockRejectedValueOnce(new Error('Batch statement failed: request write failed'))
    const { saveApiImport } = await import('@/lib/db')

    await expect(saveApiImport([collection], [request])).rejects.toThrow('request write failed')
    // Rollback is the Rust transaction's job — JS must not emit ROLLBACK on a pooled
    // connection that may never have had a transaction open on it.
    expect(sqlMock.execute).not.toHaveBeenCalledWith('ROLLBACK')
  })

  it('does not invoke the batch command for an empty import', async () => {
    const { saveApiImport } = await import('@/lib/db')

    await saveApiImport([], [])

    expect(coreMock.invoke).not.toHaveBeenCalled()
  })
})
