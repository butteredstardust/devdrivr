import { enqueueWrite, getDb } from './core'
import type { BatchStatement } from './core'

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

export function buildSettingStatement<T>(key: string, value: T): BatchStatement {
  return {
    sql: 'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2',
    params: [key, JSON.stringify(value)],
  }
}
