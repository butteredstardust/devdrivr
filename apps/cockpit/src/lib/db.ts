import Database from '@tauri-apps/plugin-sql'
import type {
  Note,
  Snippet,
  HistoryEntry,
  ApiEnvironment,
  ApiCollection,
  ApiRequest,
  PromptTemplate,
} from '@/types/models'
import {
  noteRowSchema,
  snippetRowSchema,
  historyRowSchema,
  apiEnvironmentRowSchema,
  apiCollectionRowSchema,
  apiRequestRowSchema,
  promptTemplateRowSchema,
} from '@/lib/schemas'

// Promise singleton prevents TOCTOU race when multiple callers hit getDb() concurrently
// (e.g., StrictMode double-mount or parallel store inits).
let dbPromise: Promise<Database> | null = null

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load('sqlite:cockpit.db').then(async (conn) => {
      await conn.execute('PRAGMA journal_mode=WAL')
      return conn
    })
  }
  return dbPromise
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
  const conn = await getDb()
  await conn.execute(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2',
    [key, JSON.stringify(value)]
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
  const conn = await getDb()
  await conn.execute(
    'INSERT INTO tool_state (tool_id, state, updated_at) VALUES ($1, $2, $3) ON CONFLICT(tool_id) DO UPDATE SET state = $2, updated_at = $3',
    [toolId, JSON.stringify(state), Date.now()]
  )
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
    'SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC'
  )
  return rows.map(rowToNote).filter((n): n is Note => n !== null)
}

export async function saveNote(note: Note): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    `INSERT INTO notes (id, title, content, color, pinned, popped_out, window_x, window_y, window_width, window_height, created_at, updated_at, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, color=$4, pinned=$5, popped_out=$6, window_x=$7, window_y=$8, window_width=$9, window_height=$10, updated_at=$12, tags=$13`,
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
    ]
  )
}

export async function deleteNote(id: string): Promise<void> {
  const conn = await getDb()
  await conn.execute('DELETE FROM notes WHERE id = $1', [id])
}

// --- Snippets ---

type SnippetRow = {
  id: string
  title: string
  content: string
  language: string
  tags: string
  folder: string
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
  const conn = await getDb()
  await conn.execute(
    `INSERT INTO snippets (id, title, content, language, tags, folder, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, language=$4, tags=$5, folder=$6, updated_at=$8`,
    [
      snippet.id,
      snippet.title,
      snippet.content,
      snippet.language,
      JSON.stringify(snippet.tags),
      snippet.folder,
      snippet.createdAt,
      snippet.updatedAt,
    ]
  )
}

export async function deleteSnippet(id: string): Promise<void> {
  const conn = await getDb()
  await conn.execute('DELETE FROM snippets WHERE id = $1', [id])
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

async function executeSaveUserPromptTemplate(
  conn: Database,
  template: PromptTemplate
): Promise<void> {
  await conn.execute(
    `INSERT INTO user_prompt_templates
      (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT(id) DO UPDATE SET
      name=$2, description=$3, category=$4, tags=$5, prompt=$6, variables_schema=$7,
      estimated_tokens=$8, optimized_for=$9, author=$10, version=$11, tips=$12, updated_at=$14`,
    [
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
    ]
  )
}

async function executeSeedBuiltinPromptTemplate(
  conn: Database,
  template: PromptTemplate
): Promise<void> {
  await conn.execute(
    `INSERT INTO user_prompt_templates
      (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'builtin', $10, $11, $12, $13)
     ON CONFLICT(id) DO UPDATE SET
      name=$2, description=$3, category=$4, tags=$5, prompt=$6, variables_schema=$7,
      estimated_tokens=$8, optimized_for=$9, author='builtin', version=$10, tips=$11, updated_at=$13
     WHERE author = 'builtin'`,
    [
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
    ]
  )
}

export async function saveUserPromptTemplate(template: PromptTemplate): Promise<void> {
  const conn = await getDb()
  await executeSaveUserPromptTemplate(conn, template)
}

export async function saveUserPromptTemplates(templates: PromptTemplate[]): Promise<void> {
  if (templates.length === 0) return
  const conn = await getDb()
  await conn.execute('BEGIN TRANSACTION')
  try {
    for (const template of templates) {
      await executeSaveUserPromptTemplate(conn, template)
    }
    await conn.execute('COMMIT')
  } catch (err) {
    await conn.execute('ROLLBACK')
    throw err
  }
}

export async function deleteUserPromptTemplate(id: string): Promise<void> {
  const conn = await getDb()
  await conn.execute("DELETE FROM user_prompt_templates WHERE id = $1 AND author = 'user'", [id])
}

export async function seedBuiltinPromptTemplates(templates: PromptTemplate[]): Promise<void> {
  if (templates.length === 0) return
  const conn = await getDb()
  await conn.execute('BEGIN TRANSACTION')
  try {
    for (const template of templates) {
      await executeSeedBuiltinPromptTemplate(conn, template)
    }
    await conn.execute('COMMIT')
  } catch (err) {
    await conn.execute('ROLLBACK')
    throw err
  }
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
  const conn = await getDb()
  await conn.execute(
    `INSERT INTO history (id, tool, sub_tab, input, output, timestamp, duration_ms, success, output_size, starred)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
    ]
  )
}

export async function pruneHistory(tool: string, keepCount: number): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    `DELETE FROM history WHERE tool = $1 AND id NOT IN (
       SELECT id FROM history WHERE tool = $1 ORDER BY timestamp DESC LIMIT $2
     )`,
    [tool, keepCount]
  )
}

// --- Bulk clear ---

export async function clearAllNotes(): Promise<void> {
  const conn = await getDb()
  await conn.execute('DELETE FROM notes')
}

export async function clearAllSnippets(): Promise<void> {
  const conn = await getDb()
  await conn.execute('DELETE FROM snippets')
}

export async function clearAllHistory(): Promise<void> {
  const conn = await getDb()
  await conn.execute('DELETE FROM history')
}

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

export async function saveApiEnvironment(env: ApiEnvironment): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    `INSERT INTO api_environments (id, name, variables, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(id) DO UPDATE SET name=$2, variables=$3, updated_at=$5`,
    [env.id, env.name, JSON.stringify(env.variables), env.createdAt, env.updatedAt]
  )
}

export async function deleteApiEnvironment(id: string): Promise<void> {
  const conn = await getDb()
  await conn.execute('DELETE FROM api_environments WHERE id = $1', [id])
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

export async function saveApiCollection(col: ApiCollection): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    `INSERT INTO api_collections (id, name, created_at, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(id) DO UPDATE SET name=$2, updated_at=$4`,
    [col.id, col.name, col.createdAt, col.updatedAt]
  )
}

async function executeSaveApiCollection(conn: Database, col: ApiCollection): Promise<void> {
  await conn.execute(
    `INSERT INTO api_collections (id, name, created_at, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(id) DO UPDATE SET name=$2, updated_at=$4`,
    [col.id, col.name, col.createdAt, col.updatedAt]
  )
}

export async function deleteApiCollection(id: string): Promise<void> {
  const conn = await getDb()
  await conn.execute('DELETE FROM api_collections WHERE id = $1', [id])
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

export async function saveApiRequest(req: ApiRequest): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    `INSERT INTO api_requests (id, collection_id, name, method, url, headers, body, body_mode, auth, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(id) DO UPDATE SET collection_id=$2, name=$3, method=$4, url=$5, headers=$6, body=$7, body_mode=$8, auth=$9, updated_at=$11`,
    [
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
    ]
  )
}

async function executeSaveApiRequest(conn: Database, req: ApiRequest): Promise<void> {
  await conn.execute(
    `INSERT INTO api_requests (id, collection_id, name, method, url, headers, body, body_mode, auth, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(id) DO UPDATE SET collection_id=$2, name=$3, method=$4, url=$5, headers=$6, body=$7, body_mode=$8, auth=$9, updated_at=$11`,
    [
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
    ]
  )
}

export async function saveApiImport(
  collections: ApiCollection[],
  requests: ApiRequest[]
): Promise<void> {
  if (collections.length === 0 && requests.length === 0) return
  const conn = await getDb()
  await conn.execute('BEGIN TRANSACTION')
  try {
    for (const collection of collections) {
      await executeSaveApiCollection(conn, collection)
    }
    for (const request of requests) {
      await executeSaveApiRequest(conn, request)
    }
    await conn.execute('COMMIT')
  } catch (err) {
    await conn.execute('ROLLBACK')
    throw err
  }
}

export async function deleteApiRequest(id: string): Promise<void> {
  const conn = await getDb()
  await conn.execute('DELETE FROM api_requests WHERE id = $1', [id])
}
