import type { ResourceFolder, Snippet } from '@/types/models'
import { snippetFragmentRowSchema, snippetRowSchema } from '@/lib/schemas'
import { normalizeSnippet } from '@/lib/snippet-fragments'
import { enqueueWrite, getDb, runBatch } from './core'
import type { BatchStatement } from './core'
import { buildSaveResourceFolder } from './resource-folders'

// --- Snippets ---

type SnippetRow = {
  id: string
  title: string
  content: string
  language: string
  description: string
  tags: string
  folder: string
  folder_id: string | null
  deleted_at: number | null
  favorite: number
  created_at: number
  updated_at: number
}

type SnippetFragmentRow = {
  id: string
  snippet_id: string
  name: string
  content: string
  language: string
  sort_order: number
  created_at: number
  updated_at: number
}

function rowToSnippet(row: SnippetRow): Snippet | null {
  const result = snippetRowSchema.safeParse(row)
  if (!result.success) {
    console.warn('[db] rowToSnippet: invalid row, skipping', result.error.issues)
    return null
  }
  return result.data
}

export async function loadSnippets(): Promise<Snippet[]> {
  return loadSnippetsByTrash(false)
}

export async function loadTrashedSnippets(): Promise<Snippet[]> {
  return loadSnippetsByTrash(true)
}

export async function loadSnippet(id: string): Promise<Snippet | null> {
  const conn = await getDb()
  const [rows, fragmentRows] = await Promise.all([
    conn.select<SnippetRow[]>('SELECT * FROM snippets WHERE id = $1', [id]),
    conn.select<SnippetFragmentRow[]>(
      'SELECT * FROM snippet_fragments WHERE snippet_id = $1 ORDER BY sort_order, created_at',
      [id]
    ),
  ])
  const row = rows[0]
  if (!row) return null
  const snippet = rowToSnippet(row)
  if (!snippet) return null
  const fragments = fragmentRows
    .map((fragmentRow) => snippetFragmentRowSchema.safeParse(fragmentRow))
    .filter((result) => result.success)
    .map((result) => result.data)
  return normalizeSnippet({ ...snippet, fragments })
}

async function loadSnippetsByTrash(trashed: boolean): Promise<Snippet[]> {
  const conn = await getDb()
  const [rows, fragmentRows] = await Promise.all([
    conn.select<SnippetRow[]>(
      `SELECT * FROM snippets WHERE deleted_at IS ${trashed ? 'NOT ' : ''}NULL ORDER BY updated_at DESC`
    ),
    conn.select<SnippetFragmentRow[]>(
      `SELECT fragment.* FROM snippet_fragments fragment
       JOIN snippets snippet ON snippet.id = fragment.snippet_id
       WHERE snippet.deleted_at IS ${trashed ? 'NOT ' : ''}NULL
       ORDER BY fragment.snippet_id, fragment.sort_order`
    ),
  ])
  const fragmentsBySnippet = new Map<string, Snippet['fragments']>()
  for (const row of fragmentRows) {
    const result = snippetFragmentRowSchema.safeParse(row)
    if (!result.success) {
      console.warn('[db] invalid snippet fragment, skipping', result.error.issues)
      continue
    }
    const fragments = fragmentsBySnippet.get(row.snippet_id) ?? []
    fragments.push(result.data)
    fragmentsBySnippet.set(row.snippet_id, fragments)
  }
  return rows
    .map(rowToSnippet)
    .filter((snippet): snippet is Snippet => snippet !== null)
    .map((snippet) => {
      const fragments = [...(fragmentsBySnippet.get(snippet.id) ?? [])].sort(
        (left, right) => left.sortOrder - right.sortOrder || left.createdAt - right.createdAt
      )
      return normalizeSnippet({ ...snippet, fragments })
    })
}

function buildSaveSnippetStatements(snippet: Snippet): BatchStatement[] {
  const normalized = normalizeSnippet(snippet)
  return [
    {
      sql: `INSERT INTO snippets (id, title, content, language, description, tags, folder, folder_id, favorite, created_at, updated_at, deleted_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, language=$4, description=$5, tags=$6, folder=$7, folder_id=$8, favorite=$9, updated_at=$11`,
      params: [
        normalized.id,
        normalized.title,
        normalized.content,
        normalized.language,
        normalized.description ?? '',
        JSON.stringify(normalized.tags),
        normalized.folder,
        normalized.folderId ?? 'snippets-inbox',
        normalized.favorite ? 1 : 0,
        normalized.createdAt,
        normalized.updatedAt,
        normalized.deletedAt ?? null,
      ],
    },
    { sql: 'DELETE FROM snippet_fragments WHERE snippet_id = $1', params: [normalized.id] },
    ...normalized.fragments.map((fragment) => ({
      sql: `INSERT INTO snippet_fragments
          (id, snippet_id, name, content, language, sort_order, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      params: [
        fragment.id,
        normalized.id,
        fragment.name,
        fragment.content,
        fragment.language,
        fragment.sortOrder,
        fragment.createdAt,
        fragment.updatedAt,
      ],
    })),
  ]
}

export async function saveSnippet(snippet: Snippet): Promise<void> {
  await runBatch(buildSaveSnippetStatements(snippet), true)
}

export async function saveSnippetIfUnchanged(
  snippet: Snippet,
  expectedUpdatedAt: number
): Promise<boolean> {
  const statements = buildSaveSnippetStatements(snippet)
  const statement = statements[0]
  if (!statement) return false
  // Number the guard from the parameter count, so a new column cannot shift it.
  statement.params.push(expectedUpdatedAt)
  statement.sql += ` WHERE snippets.updated_at = $${statement.params.length}`
  statement.stopOnZeroRows = true
  const results = await runBatch(statements, true)
  return results[0]?.rowsAffected === 1
}

export async function saveSnippetImport(
  folders: ResourceFolder[],
  snippets: Snippet[]
): Promise<void> {
  await runBatch(
    [...folders.map(buildSaveResourceFolder), ...snippets.flatMap(buildSaveSnippetStatements)],
    true
  )
}

export async function deleteSnippet(id: string): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute('UPDATE snippets SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL', [
      Date.now(),
      id,
    ])
  )
}

export async function restoreSnippet(id: string): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute(
      `UPDATE snippets SET deleted_at = NULL,
       folder_id = CASE WHEN EXISTS (
         SELECT 1 FROM resource_folders folder
         WHERE folder.id = snippets.folder_id AND folder.kind = 'snippets' AND folder.deleted_at IS NULL
       ) THEN folder_id ELSE 'snippets-inbox' END,
       folder = CASE WHEN EXISTS (
         SELECT 1 FROM resource_folders folder
         WHERE folder.id = snippets.folder_id AND folder.kind = 'snippets' AND folder.deleted_at IS NULL
       ) THEN folder ELSE '' END
       WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id]
    )
  )
}

export async function permanentlyDeleteSnippet(id: string): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute('DELETE FROM snippets WHERE id = $1 AND deleted_at IS NOT NULL', [id])
  )
}

export async function clearAllSnippets(): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute('UPDATE snippets SET deleted_at = $1 WHERE deleted_at IS NULL', [Date.now()])
  )
}
