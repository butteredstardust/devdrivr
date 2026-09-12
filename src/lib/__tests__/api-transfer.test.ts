import { describe, expect, it } from 'vitest'
import { API_EXPORT_FORMAT, API_EXPORT_VERSION, serializeApiExport } from '@/lib/api-transfer'
import { importApiSpec } from '@/lib/api-import'
import type { ApiCollection, ApiEnvironment, ApiRequest } from '@/types/models'

const now = 1_700_000_000_000

const COLLECTIONS: ApiCollection[] = [
  {
    id: 'col-parent',
    name: 'Parent',
    parentId: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'col-child',
    name: 'Child',
    parentId: 'col-parent',
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  },
]

const REQUESTS: ApiRequest[] = [
  {
    id: 'req-1',
    name: 'List users',
    method: 'GET',
    url: 'https://example.test/users',
    headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
    body: '',
    bodyMode: 'none',
    auth: { type: 'none' },
    collectionId: 'col-child',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'req-2',
    name: 'Loose request',
    method: 'POST',
    url: 'https://example.test/users',
    headers: [],
    body: '{"name":"a"}',
    bodyMode: 'json',
    auth: { type: 'none' },
    collectionId: null,
    createdAt: now,
    updatedAt: now,
  },
]

const ENVIRONMENTS: ApiEnvironment[] = [
  {
    id: 'env-1',
    name: 'Local',
    variables: { host: 'example.test' },
    createdAt: now,
    updatedAt: now,
  },
]

function exportAll() {
  return serializeApiExport({
    collections: COLLECTIONS,
    requests: REQUESTS,
    environments: ENVIRONMENTS,
    activeEnvironmentId: 'env-1',
  })
}

describe('serializeApiExport', () => {
  it('stamps the format and version the importer detects', () => {
    const parsed: unknown = JSON.parse(exportAll())
    expect(parsed).toMatchObject({
      format: API_EXPORT_FORMAT,
      version: API_EXPORT_VERSION,
    })
  })

  it('round-trips through importApiSpec', () => {
    // The point of the format: what Settings → Data writes is what it can read back.
    const result = importApiSpec({ content: exportAll(), filename: 'devdrivr-api-backup.json' })

    expect(result.requests).toHaveLength(2)
    expect(result.collections).toHaveLength(2)
    expect(result.environments).toHaveLength(1)
    expect(result.warnings).toEqual([])
  })

  it('keeps the collection hierarchy and each request placement', () => {
    const result = importApiSpec({ content: exportAll(), filename: 'devdrivr-api-backup.json' })

    const child = result.collections.find((collection) => collection.name === 'Child')
    expect(child?.parentKey).toBe('col-parent')

    const listUsers = result.requests.find((request) => request.name === 'List users')
    expect(listUsers?.collectionKey).toBe('col-child')

    const loose = result.requests.find((request) => request.name === 'Loose request')
    expect(loose?.collectionKey).toBeNull()
  })

  it('exports an empty library without failing', () => {
    const json = serializeApiExport({
      collections: [],
      requests: [],
      environments: [],
      activeEnvironmentId: null,
    })
    const result = importApiSpec({ content: json, filename: 'devdrivr-api-backup.json' })
    expect(result.requests).toEqual([])
  })
})
