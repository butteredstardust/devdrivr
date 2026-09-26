import type { ApiCollection, ApiEnvironment, ApiRequest, ResourceFolder } from '@/types/models'
import { apiCollectionRowSchema, apiEnvironmentRowSchema, apiRequestRowSchema } from '@/lib/schemas'
import { enqueueWrite, getDb, runBatch } from './core'
import type { BatchStatement } from './core'
import { buildSettingStatement } from './settings'
import {
  buildSaveResourceFolder,
  permanentlyDeleteResourceFolderSubtree,
  restoreResourceFolderSubtree,
  trashResourceFolderSubtree,
} from './resource-folders'

// --- API Client ---

export async function loadApiEnvironments(): Promise<ApiEnvironment[]> {
  const conn = await getDb()
  const rows = await conn.select<Array<Record<string, unknown>>>(
    'SELECT * FROM api_environments ORDER BY updated_at DESC'
  )
  return rows
    .map((r) => {
      const res = apiEnvironmentRowSchema.safeParse(r)
      if (!res.success) {
        console.warn('[db] loadApiEnvironments: invalid row', res.error.issues)
        return null
      }
      return res.data
    })
    .filter((x): x is ApiEnvironment => x !== null)
}

function buildSaveApiEnvironment(env: ApiEnvironment): BatchStatement {
  return {
    sql: `INSERT INTO api_environments (id, name, variables, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET name=$2, variables=$3, updated_at=$5`,
    params: [env.id, env.name, JSON.stringify(env.variables), env.createdAt, env.updatedAt],
  }
}

export async function saveApiEnvironment(env: ApiEnvironment): Promise<void> {
  const statement = buildSaveApiEnvironment(env)
  await enqueueWrite((conn) => conn.execute(statement.sql, statement.params))
}

export async function deleteApiEnvironment(id: string): Promise<void> {
  await enqueueWrite((conn) => conn.execute('DELETE FROM api_environments WHERE id = $1', [id]))
}

export async function loadApiCollections(): Promise<ApiCollection[]> {
  return loadApiCollectionsByTrash(false)
}

export async function loadTrashedApiCollections(): Promise<ApiCollection[]> {
  return loadApiCollectionsByTrash(true)
}

async function loadApiCollectionsByTrash(trashed: boolean): Promise<ApiCollection[]> {
  const conn = await getDb()
  const rows = await conn.select<Array<Record<string, unknown>>>(
    `SELECT * FROM api_collections WHERE deleted_at IS ${trashed ? 'NOT ' : ''}NULL ORDER BY name ASC`
  )
  return rows
    .map((r) => {
      const res = apiCollectionRowSchema.safeParse(r)
      if (!res.success) {
        console.warn('[db] loadApiCollections: invalid row', res.error.issues)
        return null
      }
      return res.data
    })
    .filter((x): x is ApiCollection => x !== null)
}

function buildSaveApiCollection(col: ApiCollection): BatchStatement {
  return {
    sql: `INSERT INTO api_collections (id, name, parent_id, sort_order, default_language, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(id) DO UPDATE SET name=$2, parent_id=$3, sort_order=$4, default_language=$5, updated_at=$7`,
    params: [
      col.id,
      col.name,
      col.parentId ?? 'api-requests-inbox',
      col.sortOrder ?? 0,
      col.defaultLanguage ?? null,
      col.createdAt,
      col.updatedAt,
      col.deletedAt ?? null,
    ],
  }
}

function buildApiCollectionFolder(col: ApiCollection): BatchStatement {
  const folder: ResourceFolder = {
    id: col.id,
    name: col.name,
    parentId: col.parentId ?? 'api-requests-inbox',
    kind: 'apiRequests',
    sortOrder: col.sortOrder ?? 0,
    createdAt: col.createdAt,
    updatedAt: col.updatedAt,
  }
  if (col.defaultLanguage !== undefined) folder.defaultLanguage = col.defaultLanguage
  if (col.deletedAt !== undefined) folder.deletedAt = col.deletedAt
  return buildSaveResourceFolder(folder)
}

export async function saveApiCollection(col: ApiCollection): Promise<void> {
  // The matching folder uses the collection's stable ID. Keeping both writes in
  // one batch lets legacy collection_id foreign keys continue to work while the
  // shared tree sees new and renamed collections immediately after restart.
  await runBatch([buildApiCollectionFolder(col), buildSaveApiCollection(col)])
}

export async function deleteApiCollection(id: string): Promise<void> {
  await trashResourceFolderSubtree(id)
}

export async function restoreApiCollection(id: string): Promise<void> {
  await restoreResourceFolderSubtree(id)
}

export async function permanentlyDeleteApiCollection(id: string): Promise<void> {
  await permanentlyDeleteResourceFolderSubtree(id)
}

export async function loadApiRequests(): Promise<ApiRequest[]> {
  return loadApiRequestsByTrash(false)
}

export async function loadTrashedApiRequests(): Promise<ApiRequest[]> {
  return loadApiRequestsByTrash(true)
}

async function loadApiRequestsByTrash(trashed: boolean): Promise<ApiRequest[]> {
  const conn = await getDb()
  const rows = await conn.select<Array<Record<string, unknown>>>(
    `SELECT * FROM api_requests WHERE deleted_at IS ${trashed ? 'NOT ' : ''}NULL ORDER BY name ASC`
  )
  return rows
    .map((r) => {
      const res = apiRequestRowSchema.safeParse(r)
      if (!res.success) {
        console.warn('[db] loadApiRequests: invalid row', res.error.issues)
        return null
      }
      return res.data
    })
    .filter((x): x is ApiRequest => x !== null)
}

function buildSaveApiRequest(req: ApiRequest): BatchStatement {
  return {
    sql: `INSERT INTO api_requests (id, collection_id, name, method, url, headers, body, body_mode, auth, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT(id) DO UPDATE SET collection_id=$2, name=$3, method=$4, url=$5, headers=$6, body=$7, body_mode=$8, auth=$9, updated_at=$11`,
    params: [
      req.id,
      req.collectionId,
      req.name,
      req.method,
      req.url,
      JSON.stringify(req.headers),
      req.body,
      req.bodyMode,
      JSON.stringify(req.auth),
      req.createdAt,
      req.updatedAt,
      req.deletedAt ?? null,
    ],
  }
}

export async function saveApiRequest(req: ApiRequest): Promise<void> {
  const statement = buildSaveApiRequest(req)
  await enqueueWrite((conn) => conn.execute(statement.sql, statement.params))
}

export async function saveApiImport(
  collections: ApiCollection[],
  requests: ApiRequest[],
  environments: ApiEnvironment[] = [],
  activeEnvironmentId?: string | null
): Promise<void> {
  // Collections first: api_requests.collection_id references them.
  await runBatch([
    ...environments.map(buildSaveApiEnvironment),
    ...collections.map(buildApiCollectionFolder),
    ...collections.map(buildSaveApiCollection),
    ...requests.map(buildSaveApiRequest),
    ...(activeEnvironmentId !== undefined
      ? [buildSettingStatement('apiActiveEnvironmentId', activeEnvironmentId)]
      : []),
  ])
}

export async function deleteApiRequest(id: string): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute('UPDATE api_requests SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL', [
      Date.now(),
      id,
    ])
  )
}

export async function restoreApiRequest(id: string): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute(
      `UPDATE api_requests SET deleted_at = NULL,
       collection_id = CASE WHEN EXISTS (
         SELECT 1 FROM api_collections collection
         WHERE collection.id = api_requests.collection_id AND collection.deleted_at IS NULL
       ) THEN collection_id ELSE 'api-requests-inbox' END
       WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id]
    )
  )
}

export async function permanentlyDeleteApiRequest(id: string): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute('DELETE FROM api_requests WHERE id = $1 AND deleted_at IS NOT NULL', [id])
  )
}

/** Moves every saved request to the Trash. Collections and environments stay. */
export async function clearAllApiRequests(): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute('UPDATE api_requests SET deleted_at = $1 WHERE deleted_at IS NULL', [Date.now()])
  )
}
