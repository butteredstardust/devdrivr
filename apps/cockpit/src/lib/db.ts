import Database from '@tauri-apps/plugin-sql'

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
