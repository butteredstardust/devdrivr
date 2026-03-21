import Database from '@tauri-apps/plugin-sql'
import type { Note, NoteColor, Snippet, HistoryEntry } from '@/types/models'

let db: Database | null = null

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load('sqlite:cockpit.db')
    // WAL mode for concurrent reads — must be set at connection time, not in migrations
    await db.execute('PRAGMA journal_mode=WAL')
  }
  return db
}

// --- Settings ---

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const conn = await getDb()
  const rows = await conn.select<Array<{ value: string }>>(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  )
  if (rows.length === 0) return fallback
  return JSON.parse(rows[0]!.value) as T
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
  return JSON.parse(rows[0]!.state) as Record<string, unknown>
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

function rowToNote(row: NoteRow): Note {
  const note: Note = {
    id: row.id,
    title: row.title,
    content: row.content,
    color: row.color as NoteColor,
    pinned: row.pinned === 1,
    poppedOut: row.popped_out === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (row.window_x != null && row.window_y != null && row.window_width != null && row.window_height != null) {
    note.windowBounds = { x: row.window_x, y: row.window_y, width: row.window_width, height: row.window_height }
  }
  return note
}

export async function loadNotes(): Promise<Note[]> {
  const conn = await getDb()
  const rows = await conn.select<NoteRow[]>('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC')
  return rows.map(rowToNote)
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

function rowToSnippet(row: SnippetRow): Snippet {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    language: row.language,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function loadSnippets(): Promise<Snippet[]> {
  const conn = await getDb()
  const rows = await conn.select<SnippetRow[]>('SELECT * FROM snippets ORDER BY updated_at DESC')
  return rows.map(rowToSnippet)
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

function rowToHistory(row: HistoryRow): HistoryEntry {
  const entry: HistoryEntry = {
    id: row.id,
    tool: row.tool,
    input: row.input,
    output: row.output,
    timestamp: row.timestamp,
  }
  if (row.sub_tab != null) {
    entry.subTab = row.sub_tab
  }
  return entry
}

export async function loadHistory(tool?: string, limit: number = 100): Promise<HistoryEntry[]> {
  const conn = await getDb()
  if (tool) {
    return (await conn.select<HistoryRow[]>(
      'SELECT * FROM history WHERE tool = $1 ORDER BY timestamp DESC LIMIT $2',
      [tool, limit]
    )).map(rowToHistory)
  }
  return (await conn.select<HistoryRow[]>(
    'SELECT * FROM history ORDER BY timestamp DESC LIMIT $1',
    [limit]
  )).map(rowToHistory)
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
