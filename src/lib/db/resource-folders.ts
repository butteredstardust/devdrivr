import type { ResourceFolder, ResourceKind } from '@/types/models'
import { resourceFolderRowSchema } from '@/lib/schemas'
import { enqueueWrite, getDb, runBatch } from './core'
import type { BatchStatement } from './core'

// --- Resource folders ---

export async function loadResourceFolders(): Promise<ResourceFolder[]> {
  return loadResourceFoldersByTrash(false)
}

export async function loadTrashedResourceFolders(): Promise<ResourceFolder[]> {
  return loadResourceFoldersByTrash(true)
}

async function loadResourceFoldersByTrash(trashed: boolean): Promise<ResourceFolder[]> {
  const conn = await getDb()
  const rows = await conn.select<Array<Record<string, unknown>>>(
    `SELECT * FROM resource_folders WHERE deleted_at IS ${trashed ? 'NOT ' : ''}NULL ORDER BY kind ASC, parent_id ASC, sort_order ASC, name ASC`
  )
  return rows
    .map((row) => {
      const result = resourceFolderRowSchema.safeParse(row)
      if (!result.success) {
        console.warn('[db] loadResourceFolders: invalid row', result.error.issues)
        return null
      }
      return result.data
    })
    .filter((folder): folder is ResourceFolder => folder !== null)
}

export function buildSaveResourceFolder(folder: ResourceFolder): BatchStatement {
  return {
    sql: `INSERT INTO resource_folders (id, name, parent_id, kind, sort_order, default_language, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT(id) DO UPDATE SET name=$2, parent_id=$3, kind=$4, sort_order=$5, default_language=$6, updated_at=$8`,
    params: [
      folder.id,
      folder.name,
      folder.parentId,
      folder.kind,
      folder.sortOrder,
      folder.defaultLanguage ?? null,
      folder.createdAt,
      folder.updatedAt,
      folder.deletedAt ?? null,
    ],
  }
}

export async function saveResourceFolder(folder: ResourceFolder): Promise<void> {
  const statement = buildSaveResourceFolder(folder)
  if (folder.kind !== 'apiRequests') {
    await enqueueWrite((conn) => conn.execute(statement.sql, statement.params))
    return
  }
  await runBatch([
    statement,
    {
      sql: `INSERT INTO api_collections (id, name, parent_id, sort_order, default_language, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NULL, $5, $6)
        ON CONFLICT(id) DO UPDATE SET name=$2, parent_id=$3, sort_order=$4, updated_at=$6`,
      params: [
        folder.id,
        folder.name,
        folder.parentId,
        folder.sortOrder,
        folder.createdAt,
        folder.updatedAt,
      ],
    },
  ])
}

export async function saveResourceFolderMove(
  folder: ResourceFolder,
  siblings: Pick<ResourceFolder, 'id' | 'sortOrder'>[]
): Promise<void> {
  const statements: BatchStatement[] = [
    buildSaveResourceFolder(folder),
    ...siblings.map((sibling) => ({
      sql: 'UPDATE resource_folders SET sort_order = $1 WHERE id = $2',
      params: [sibling.sortOrder, sibling.id],
    })),
  ]
  if (folder.kind === 'apiRequests') {
    statements.push(
      {
        sql: `INSERT INTO api_collections (id, name, parent_id, sort_order, default_language, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NULL, $5, $6)
          ON CONFLICT(id) DO UPDATE SET name=$2, parent_id=$3, sort_order=$4, updated_at=$6`,
        params: [
          folder.id,
          folder.name,
          folder.parentId,
          folder.sortOrder,
          folder.createdAt,
          folder.updatedAt,
        ],
      },
      ...siblings.map((sibling) => ({
        sql: 'UPDATE api_collections SET sort_order = $1 WHERE id = $2',
        params: [sibling.sortOrder, sibling.id],
      }))
    )
  }
  await runBatch(statements, true)
}

export async function saveResourceFolderOrder(
  folders: Pick<ResourceFolder, 'id' | 'sortOrder'>[],
  kind?: ResourceKind
): Promise<void> {
  if (folders.length === 0) return
  await runBatch(
    [
      ...folders.map((folder) => ({
        sql: 'UPDATE resource_folders SET sort_order = $1 WHERE id = $2',
        params: [folder.sortOrder, folder.id],
      })),
      ...(kind === 'apiRequests'
        ? folders.map((folder) => ({
            sql: 'UPDATE api_collections SET sort_order = $1 WHERE id = $2',
            params: [folder.sortOrder, folder.id],
          }))
        : []),
    ],
    true
  )
}

const subtreeIdsSql = `WITH RECURSIVE subtree(id) AS (
  SELECT id FROM resource_folders WHERE id = $2
  UNION ALL
  SELECT folder.id FROM resource_folders folder JOIN subtree ON folder.parent_id = subtree.id
) SELECT id FROM subtree`
const subtreeIdsForIdSql = subtreeIdsSql.replace('$2', '$1')
const trashedSubtreeIdsForIdSql = subtreeIdsForIdSql.replace(
  'WHERE id = $1',
  'WHERE id = $1 AND deleted_at IS NOT NULL'
)

/** Soft-deletes a folder, every descendant, and the resources they contain. */
export async function trashResourceFolderSubtree(id: string): Promise<void> {
  const deletedAt = Date.now()
  await runBatch(
    [
      {
        sql: `UPDATE resource_folders SET deleted_at = $1
          WHERE id IN (${subtreeIdsSql}) AND deleted_at IS NULL`,
        params: [deletedAt, id],
      },
      {
        sql: `UPDATE notes SET deleted_at = $1
          WHERE folder_id IN (${subtreeIdsSql}) AND deleted_at IS NULL`,
        params: [deletedAt, id],
      },
      {
        sql: `UPDATE snippets SET deleted_at = $1
          WHERE folder_id IN (${subtreeIdsSql}) AND deleted_at IS NULL`,
        params: [deletedAt, id],
      },
      {
        sql: `UPDATE api_collections SET deleted_at = $1
          WHERE id IN (${subtreeIdsSql}) AND deleted_at IS NULL`,
        params: [deletedAt, id],
      },
      {
        sql: `UPDATE api_requests SET deleted_at = $1
          WHERE collection_id IN (${subtreeIdsSql}) AND deleted_at IS NULL`,
        params: [deletedAt, id],
      },
    ],
    true
  )
}

/** Restores only rows marked by this folder deletion, retaining their original parents. */
export async function restoreResourceFolderSubtree(id: string): Promise<void> {
  const conn = await getDb()
  const rows = await conn.select<Array<{ deleted_at: number | null }>>(
    'SELECT deleted_at FROM resource_folders WHERE id = $1',
    [id]
  )
  const deletedAt = rows[0]?.deleted_at
  if (deletedAt == null) return
  await runBatch(
    [
      {
        sql: `UPDATE resource_folders SET deleted_at = NULL
          WHERE id IN (${subtreeIdsSql}) AND deleted_at = $1`,
        params: [deletedAt, id],
      },
      {
        sql: `UPDATE notes SET deleted_at = NULL
          WHERE folder_id IN (${subtreeIdsSql}) AND deleted_at = $1`,
        params: [deletedAt, id],
      },
      {
        sql: `UPDATE snippets SET deleted_at = NULL
          WHERE folder_id IN (${subtreeIdsSql}) AND deleted_at = $1`,
        params: [deletedAt, id],
      },
      {
        sql: `UPDATE api_collections SET deleted_at = NULL
          WHERE id IN (${subtreeIdsSql}) AND deleted_at = $1`,
        params: [deletedAt, id],
      },
      {
        sql: `UPDATE api_requests SET deleted_at = NULL
          WHERE collection_id IN (${subtreeIdsSql}) AND deleted_at = $1`,
        params: [deletedAt, id],
      },
    ],
    true
  )
}

export async function permanentlyDeleteResourceFolderSubtree(id: string): Promise<void> {
  const folderIds = await loadTrashedFolderIdsChildFirst({ rootId: id })
  if (folderIds.length === 0) return
  await runBatch(
    [
      {
        sql: `DELETE FROM notes WHERE folder_id IN (${trashedSubtreeIdsForIdSql}) AND deleted_at IS NOT NULL`,
        params: [id],
      },
      {
        sql: `DELETE FROM snippets WHERE folder_id IN (${trashedSubtreeIdsForIdSql}) AND deleted_at IS NOT NULL`,
        params: [id],
      },
      {
        sql: `DELETE FROM api_requests WHERE collection_id IN (${trashedSubtreeIdsForIdSql}) AND deleted_at IS NOT NULL`,
        params: [id],
      },
      ...folderIds.map((folderId) => ({
        sql: 'DELETE FROM api_collections WHERE id = $1 AND deleted_at IS NOT NULL',
        params: [folderId],
      })),
      ...folderIds.map((folderId) => ({
        sql: 'DELETE FROM resource_folders WHERE id = $1 AND deleted_at IS NOT NULL',
        params: [folderId],
      })),
    ],
    true
  )
}

async function loadTrashedFolderIdsChildFirst(options: {
  kind?: ResourceKind
  rootId?: string
}): Promise<string[]> {
  const conn = await getDb()
  const params: unknown[] = []
  let where = 'deleted_at IS NOT NULL'
  if (options.kind) {
    params.push(options.kind)
    where += ` AND kind = $${params.length}`
  }
  if (options.rootId) {
    params.push(options.rootId)
    where += ` AND id IN (${trashedSubtreeIdsForIdSql.replaceAll('$1', `$${params.length}`)})`
  }
  const rows = await conn.select<Array<{ id: string; parent_id: string | null }>>(
    `SELECT id, parent_id FROM resource_folders WHERE ${where}`,
    params
  )
  const parentById = new Map(rows.map((row) => [row.id, row.parent_id]))
  const depth = (id: string): number => {
    let current = parentById.get(id)
    let result = 0
    const visited = new Set([id])
    while (current && parentById.has(current) && !visited.has(current)) {
      visited.add(current)
      result++
      current = parentById.get(current)
    }
    return result
  }
  return rows.map((row) => row.id).sort((a, b) => depth(b) - depth(a) || a.localeCompare(b))
}

/** Permanently removes only trashed data belonging to the requested resource kind. */
export async function emptyResourceTrash(kind: ResourceKind): Promise<void> {
  const folderIds = await loadTrashedFolderIdsChildFirst({ kind })
  const statementsByKind: Record<ResourceKind, BatchStatement[]> = {
    notes: [
      { sql: 'DELETE FROM notes WHERE deleted_at IS NOT NULL', params: [] },
      ...folderIds.map((id) => ({
        sql: "DELETE FROM resource_folders WHERE id = $1 AND kind = 'notes' AND deleted_at IS NOT NULL",
        params: [id],
      })),
    ],
    snippets: [
      { sql: 'DELETE FROM snippets WHERE deleted_at IS NOT NULL', params: [] },
      ...folderIds.map((id) => ({
        sql: "DELETE FROM resource_folders WHERE id = $1 AND kind = 'snippets' AND deleted_at IS NOT NULL",
        params: [id],
      })),
    ],
    apiRequests: [
      { sql: 'DELETE FROM api_requests WHERE deleted_at IS NOT NULL', params: [] },
      ...folderIds.map((id) => ({
        sql: 'DELETE FROM api_collections WHERE id = $1 AND deleted_at IS NOT NULL',
        params: [id],
      })),
      ...folderIds.map((id) => ({
        sql: "DELETE FROM resource_folders WHERE id = $1 AND kind = 'apiRequests' AND deleted_at IS NOT NULL",
        params: [id],
      })),
    ],
  }
  await runBatch(statementsByKind[kind], true)
}
