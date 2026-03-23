import Database from '@tauri-apps/plugin-sql'
import type { Note, Snippet, HistoryEntry } from '@/types/models'
import { noteRowSchema, snippetRowSchema, historyRowSchema } from '@/lib/schemas'

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
    return JSON.parse(rows[0]!.value) as T
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
    return JSON.parse(rows[0]!.state) as Record<string, unknown>
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
  const rows = await conn.select<NoteRow[]>('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC')
  return rows.map(rowToNote).filter((n): n is Note => n !== null)
}

export async function saveNote(note: Note): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    `INSERT INTO notes (id, title, content, color, pinned, popped_out, window_x, window_y, window_width, window_height, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, color=$4, pinned=$5, popped_out=$6, window_x=$7, window_y=$8, window_width=$9, window_height=$10, updated_at=$12`,
    [
      note.id, note.title, note.content, note.color,
      note.pinned ? 1 : 0, note.poppedOut ? 1 : 0,
      note.windowBounds?.x ?? null, note.windowBounds?.y ?? null,
      note.windowBounds?.width ?? null, note.windowBounds?.height ?? null,
      note.createdAt, note.updatedAt,
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
    `INSERT INTO snippets (id, title, content, language, tags, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, language=$4, tags=$5, updated_at=$7`,
    [snippet.id, snippet.title, snippet.content, snippet.language, JSON.stringify(snippet.tags), snippet.createdAt, snippet.updatedAt]
  )
}

export async function deleteSnippet(id: string): Promise<void> {
  const conn = await getDb()
  await conn.execute('DELETE FROM snippets WHERE id = $1', [id])
}

// --- History ---

type HistoryRow = {
  id: string
  tool: string
  sub_tab: string | null
  input: string
  output: string
  timestamp: number
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
    return (await conn.select<HistoryRow[]>(
      'SELECT * FROM history WHERE tool = $1 ORDER BY timestamp DESC LIMIT $2',
      [tool, limit]
    )).map(rowToHistory).filter((e): e is HistoryEntry => e !== null)
  }
  return (await conn.select<HistoryRow[]>(
    'SELECT * FROM history ORDER BY timestamp DESC LIMIT $1',
    [limit]
  )).map(rowToHistory).filter((e): e is HistoryEntry => e !== null)
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    'INSERT INTO history (id, tool, sub_tab, input, output, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
    [entry.id, entry.tool, entry.subTab ?? null, entry.input, entry.output, entry.timestamp]
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
