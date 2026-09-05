import Database from '@tauri-apps/plugin-sql'
import { invoke } from '@tauri-apps/api/core'
import type {
  Note,
  Snippet,
  HistoryEntry,
  ApiEnvironment,
  ApiCollection,
  ApiRequest,
  PromptTemplate,
  ResourceFolder,
  ResourceKind,
} from '@/types/models'
import {
  noteRowSchema,
  snippetRowSchema,
  historyRowSchema,
  apiEnvironmentRowSchema,
  apiCollectionRowSchema,
  apiRequestRowSchema,
  promptTemplateRowSchema,
  resourceFolderRowSchema,
} from '@/lib/schemas'

// Promise singleton prevents TOCTOU race when multiple callers hit getDb() concurrently
// (e.g., StrictMode double-mount or parallel store inits).
let dbPromise: Promise<Database> | null = null
let writeQueue: Promise<void> = Promise.resolve()

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    // Legacy filename kept deliberately so existing installations retain their local data.
    dbPromise = Database.load('sqlite:cockpit.db')
      .then(async (conn) => {
        await conn.execute('PRAGMA journal_mode=WAL')
        await conn.execute('PRAGMA busy_timeout=5000')
        return conn
      })
      .catch((err: unknown) => {
        // Clear the cached promise on failure — whether Database.load() itself
        // rejected or one of the PRAGMA statements did — so a transient failure
        // (e.g. a locked database at launch) doesn't latch every later getDb()
        // call for the rest of the process lifetime. A later call retries.
        dbPromise = null
        throw err
      })
  }
  return dbPromise
}

function enqueueWrite<T>(operation: (conn: Database) => Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => {
    const conn = await getDb()
    return operation(conn)
  })
  writeQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/** A parameterised statement destined for the atomic batch command. */
export type BatchStatement = { sql: string; params: unknown[] }

/**
 * Runs a group of statements atomically.
 *
 * These cannot be driven from JS with `BEGIN` / `COMMIT` through
 * `@tauri-apps/plugin-sql`: the plugin executes every statement via `pool.execute(...)`
 * on a multi-connection pool, so the statements of a "transaction" can land on different
 * connections — auto-committing individually, erroring on `COMMIT`, or stranding an open
 * transaction on a pooled connection. The `db_execute_batch` Tauri command owns a
 * dedicated single-connection pool and wraps the batch in a real sqlx transaction.
 * See ADR-013 in documentation/infrastructure/ARCHITECTURE_DECISIONS.md.
 *
 * Still routed through `writeQueue` so batches stay ordered against single-statement
 * writes going through the plugin pool.
 */
function runBatch(statements: BatchStatement[], immediate = false): Promise<void> {
  if (statements.length === 0) return Promise.resolve()
  // enqueueWrite awaits getDb() first, which guarantees the plugin has opened the
  // database and applied migrations before the Rust pool touches the same file.
  return enqueueWrite(async () => {
    await invoke('db_execute_batch', { statements, immediate })
  })
}

// --- Settings ---

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const conn = await getDb()
  const rows = await conn.select<Array<{ value: string }>>(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  )
  if (rows.length === 0) return fallback
  try {
    return JSON.parse(rows[0]?.value ?? 'null') as T
  } catch (err) {
    console.warn(`[db] getSetting: failed to parse value for key "${key}", using fallback`, err)
    return fallback
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2',
      [key, JSON.stringify(value)]
    )
  )
}

// --- Tool State ---

export async function loadToolState(toolId: string): Promise<Record<string, unknown> | null> {
  const conn = await getDb()
  const rows = await conn.select<Array<{ state: string }>>(
    'SELECT state FROM tool_state WHERE tool_id = $1',
    [toolId]
  )
  if (rows.length === 0) return null
  try {
    return JSON.parse(rows[0]?.state ?? 'null') as Record<string, unknown>
  } catch (err) {
    console.warn(`[db] loadToolState: failed to parse state for tool "${toolId}"`, err)
    return null
  }
}

export async function saveToolState(toolId: string, state: Record<string, unknown>): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute(
      'INSERT INTO tool_state (tool_id, state, updated_at) VALUES ($1, $2, $3) ON CONFLICT(tool_id) DO UPDATE SET state = $2, updated_at = $3',
      [toolId, JSON.stringify(state), Date.now()]
    )
  )
}

/**
 * Drops a tool's saved state. Used when a duplicate tab closes: its key is
 * `<toolId>#<tabId>` and the tab id never comes back, so the row would sit
 * there forever holding whatever the editor had in it.
 */
export async function deleteToolState(toolId: string): Promise<void> {
  await enqueueWrite((conn) => conn.execute('DELETE FROM tool_state WHERE tool_id = $1', [toolId]))
}

// --- Notes ---

type NoteRow = {
  id: string
  title: string
  content: string
  color: string
  pinned: number
  popped_out: number
  window_x: number | null
  window_y: number | null
  window_width: number | null
  window_height: number | null
  created_at: number
  updated_at: number
  tags: string
  sort_order: number
  folder_id: string | null
}

function rowToNote(row: NoteRow): Note | null {
  const result = noteRowSchema.safeParse(row)
  if (!result.success) {
    console.warn('[db] rowToNote: invalid row, skipping', result.error.issues)
    return null
  }
  return result.data
}

export async function loadNotes(): Promise<Note[]> {
  const conn = await getDb()
  const rows = await conn.select<NoteRow[]>(
    'SELECT * FROM notes ORDER BY pinned DESC, sort_order ASC, updated_at DESC'
  )
  return rows.map(rowToNote).filter((n): n is Note => n !== null)
}

export async function saveNote(note: Note): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute(
      `INSERT INTO notes (id, title, content, color, pinned, popped_out, window_x, window_y, window_width, window_height, created_at, updated_at, tags, sort_order, folder_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, color=$4, pinned=$5, popped_out=$6, window_x=$7, window_y=$8, window_width=$9, window_height=$10, updated_at=$12, tags=$13, sort_order=$14, folder_id=$15`,
      [
        note.id,
        note.title,
        note.content,
        note.color,
        note.pinned ? 1 : 0,
        note.poppedOut ? 1 : 0,
        note.windowBounds?.x ?? null,
        note.windowBounds?.y ?? null,
        note.windowBounds?.width ?? null,
        note.windowBounds?.height ?? null,
        note.createdAt,
        note.updatedAt,
        JSON.stringify(note.tags || []),
        note.sortOrder,
        note.folderId ?? 'notes-inbox',
      ]
    )
  )
}

export async function saveNotesOrder(notes: Pick<Note, 'id' | 'sortOrder'>[]): Promise<void> {
  if (notes.length === 0) return
  await runBatch(
    notes.map((note) => ({
      sql: 'UPDATE notes SET sort_order = $1 WHERE id = $2',
      params: [note.sortOrder, note.id],
    })),
    true
  )
}

export async function deleteNote(id: string): Promise<void> {
  await enqueueWrite((conn) => conn.execute('DELETE FROM notes WHERE id = $1', [id]))
}

// --- Snippets ---

type SnippetRow = {
  id: string
  title: string
  content: string
  language: string
  tags: string
  folder: string
  folder_id: string | null
  favorite: number
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
  const conn = await getDb()
  const rows = await conn.select<SnippetRow[]>('SELECT * FROM snippets ORDER BY updated_at DESC')
  return rows.map(rowToSnippet).filter((s): s is Snippet => s !== null)
}

export async function saveSnippet(snippet: Snippet): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute(
      `INSERT INTO snippets (id, title, content, language, tags, folder, folder_id, favorite, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, language=$4, tags=$5, folder=$6, folder_id=$7, favorite=$8, updated_at=$10`,
      [
        snippet.id,
        snippet.title,
        snippet.content,
        snippet.language,
        JSON.stringify(snippet.tags),
        snippet.folder,
        snippet.folderId ?? 'snippets-inbox',
        snippet.favorite ? 1 : 0,
        snippet.createdAt,
        snippet.updatedAt,
      ]
    )
  )
}

export async function deleteSnippet(id: string): Promise<void> {
  await enqueueWrite((conn) => conn.execute('DELETE FROM snippets WHERE id = $1', [id]))
}

// --- Prompt Templates ---

type PromptTemplateRow = {
  id: string
  name: string
  description: string
  category: string
  tags: string
  prompt: string
  variables_schema: string
  estimated_tokens: number
  optimized_for: string
  author: string
  version: string
  tips: string
  created_at: number
  updated_at: number
}

function rowToPromptTemplate(row: PromptTemplateRow): PromptTemplate | null {
  const result = promptTemplateRowSchema.safeParse(row)
  if (!result.success) {
    console.warn('[db] rowToPromptTemplate: invalid row, skipping', result.error.issues)
    return null
  }
  return result.data
}

export async function loadUserPromptTemplates(): Promise<PromptTemplate[]> {
  const conn = await getDb()
  const rows = await conn.select<PromptTemplateRow[]>(
    "SELECT * FROM user_prompt_templates WHERE author = 'user' ORDER BY updated_at DESC"
  )
  return rows
    .map(rowToPromptTemplate)
    .filter((template): template is PromptTemplate => template !== null)
}

function buildSaveUserPromptTemplate(template: PromptTemplate): BatchStatement {
  return {
    sql: `INSERT INTO user_prompt_templates
      (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT(id) DO UPDATE SET
      name=$2, description=$3, category=$4, tags=$5, prompt=$6, variables_schema=$7,
      estimated_tokens=$8, optimized_for=$9, author=$10, version=$11, tips=$12, updated_at=$14`,
    params: [
      template.id,
      template.name,
      template.description,
      template.category,
      JSON.stringify(template.tags),
      template.prompt,
      JSON.stringify(template.variables),
      template.estimatedTokens,
      template.optimizedFor,
      template.author,
      template.version,
      JSON.stringify(template.tips ?? []),
      template.createdAt ?? Date.now(),
      template.updatedAt ?? Date.now(),
    ],
  }
}

function buildSeedBuiltinPromptTemplate(template: PromptTemplate): BatchStatement {
  return {
    sql: `INSERT INTO user_prompt_templates
      (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'builtin', $10, $11, $12, $13)
     ON CONFLICT(id) DO UPDATE SET
      name=$2, description=$3, category=$4, tags=$5, prompt=$6, variables_schema=$7,
      estimated_tokens=$8, optimized_for=$9, author='builtin', version=$10, tips=$11, updated_at=$13
     WHERE author = 'builtin'`,
    params: [
      template.id,
      template.name,
      template.description,
      template.category,
      JSON.stringify(template.tags),
      template.prompt,
      JSON.stringify(template.variables),
      template.estimatedTokens,
      template.optimizedFor,
      template.version,
      JSON.stringify(template.tips ?? []),
      template.createdAt ?? Date.now(),
      template.updatedAt ?? Date.now(),
    ],
  }
}

export async function saveUserPromptTemplate(template: PromptTemplate): Promise<void> {
  const statement = buildSaveUserPromptTemplate(template)
  await enqueueWrite((conn) => conn.execute(statement.sql, statement.params))
}

export async function saveUserPromptTemplates(templates: PromptTemplate[]): Promise<void> {
  await runBatch(templates.map(buildSaveUserPromptTemplate))
}

export async function deleteUserPromptTemplate(id: string): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute("DELETE FROM user_prompt_templates WHERE id = $1 AND author = 'user'", [id])
  )
}

export async function seedBuiltinPromptTemplates(templates: PromptTemplate[]): Promise<void> {
  await runBatch(templates.map(buildSeedBuiltinPromptTemplate))
}

// --- History ---

type HistoryRow = {
  id: string
  tool: string
  sub_tab: string | null
  input: string
  output: string
  timestamp: number
  duration_ms: number | null
  success: number | null
  output_size: number | null
  starred: number | null
  response_body?: string | null
  response_mime_type?: string | null
  response_status?: number | null
  response_status_text?: string | null
}

function rowToHistory(row: HistoryRow): HistoryEntry | null {
  const result = historyRowSchema.safeParse(row)
  if (!result.success) {
    console.warn('[db] rowToHistory: invalid row, skipping', result.error.issues)
    return null
  }
  return result.data
}

export async function loadHistory(tool?: string, limit: number = 100): Promise<HistoryEntry[]> {
  const conn = await getDb()
  if (tool) {
    return (
      await conn.select<HistoryRow[]>(
        'SELECT * FROM history WHERE tool = $1 ORDER BY timestamp DESC LIMIT $2',
        [tool, limit]
      )
    )
      .map(rowToHistory)
      .filter((e): e is HistoryEntry => e !== null)
  }
  return (
    await conn.select<HistoryRow[]>('SELECT * FROM history ORDER BY timestamp DESC LIMIT $1', [
      limit,
    ])
  )
    .map(rowToHistory)
    .filter((e): e is HistoryEntry => e !== null)
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute(
      `INSERT INTO history (id, tool, sub_tab, input, output, timestamp, duration_ms, success, output_size, starred, response_body, response_mime_type, response_status, response_status_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        entry.id,
        entry.tool,
        entry.subTab ?? null,
        entry.input,
        entry.output,
        entry.timestamp,
        entry.durationMs ?? null,
        entry.success ? 1 : 0,
        entry.outputSize ?? null,
        entry.starred ? 1 : 0,
        entry.responseBody ?? null,
        entry.responseMimeType ?? null,
        entry.responseStatus ?? null,
        entry.responseStatusText ?? null,
      ]
    )
  )
}

export async function pruneHistory(tool: string, keepCount: number): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute(
      `DELETE FROM history WHERE tool = $1 AND id NOT IN (
         SELECT id FROM history WHERE tool = $1 ORDER BY timestamp DESC LIMIT $2
       )`,
      [tool, keepCount]
    )
  )
}

// --- Bulk clear ---

export async function clearAllNotes(): Promise<void> {
  await enqueueWrite((conn) => conn.execute('DELETE FROM notes'))
}

export async function clearAllSnippets(): Promise<void> {
  await enqueueWrite((conn) => conn.execute('DELETE FROM snippets'))
}

export async function clearAllHistory(): Promise<void> {
  await enqueueWrite((conn) => conn.execute('DELETE FROM history'))
}

// --- API Client ---

// --- Resource folders ---

export async function loadResourceFolders(): Promise<ResourceFolder[]> {
  const conn = await getDb()
  const rows = await conn.select<Array<Record<string, unknown>>>(
    'SELECT * FROM resource_folders ORDER BY kind ASC, parent_id ASC, sort_order ASC, name ASC'
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

function buildSaveResourceFolder(folder: ResourceFolder): BatchStatement {
  return {
    sql: `INSERT INTO resource_folders (id, name, parent_id, kind, sort_order, default_language, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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

export async function saveApiEnvironment(env: ApiEnvironment): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute(
      `INSERT INTO api_environments (id, name, variables, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET name=$2, variables=$3, updated_at=$5`,
      [env.id, env.name, JSON.stringify(env.variables), env.createdAt, env.updatedAt]
    )
  )
}

export async function deleteApiEnvironment(id: string): Promise<void> {
  await enqueueWrite((conn) => conn.execute('DELETE FROM api_environments WHERE id = $1', [id]))
}

export async function loadApiCollections(): Promise<ApiCollection[]> {
  const conn = await getDb()
  const rows = await conn.select<Array<Record<string, unknown>>>(
    'SELECT * FROM api_collections ORDER BY name ASC'
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
    sql: `INSERT INTO api_collections (id, name, parent_id, sort_order, default_language, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(id) DO UPDATE SET name=$2, parent_id=$3, sort_order=$4, default_language=$5, updated_at=$7`,
    params: [
      col.id,
      col.name,
      col.parentId ?? 'api-requests-inbox',
      col.sortOrder ?? 0,
      col.defaultLanguage ?? null,
      col.createdAt,
      col.updatedAt,
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
  return buildSaveResourceFolder(folder)
}

export async function saveApiCollection(col: ApiCollection): Promise<void> {
  // The matching folder uses the collection's stable ID. Keeping both writes in
  // one batch lets legacy collection_id foreign keys continue to work while the
  // shared tree sees new and renamed collections immediately after restart.
  await runBatch([buildApiCollectionFolder(col), buildSaveApiCollection(col)])
}

export async function deleteApiCollection(id: string): Promise<void> {
  await enqueueWrite((conn) => conn.execute('DELETE FROM api_collections WHERE id = $1', [id]))
}

export async function loadApiRequests(): Promise<ApiRequest[]> {
  const conn = await getDb()
  const rows = await conn.select<Array<Record<string, unknown>>>(
    'SELECT * FROM api_requests ORDER BY name ASC'
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
    sql: `INSERT INTO api_requests (id, collection_id, name, method, url, headers, body, body_mode, auth, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
    ],
  }
}

export async function saveApiRequest(req: ApiRequest): Promise<void> {
  const statement = buildSaveApiRequest(req)
  await enqueueWrite((conn) => conn.execute(statement.sql, statement.params))
}

export async function saveApiImport(
  collections: ApiCollection[],
  requests: ApiRequest[]
): Promise<void> {
  // Collections first: api_requests.collection_id references them.
  await runBatch([
    ...collections.map(buildApiCollectionFolder),
    ...collections.map(buildSaveApiCollection),
    ...requests.map(buildSaveApiRequest),
  ])
}

export async function deleteApiRequest(id: string): Promise<void> {
  await enqueueWrite((conn) => conn.execute('DELETE FROM api_requests WHERE id = $1', [id]))
}
