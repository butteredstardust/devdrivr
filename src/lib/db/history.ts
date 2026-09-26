import type { HistoryEntry } from '@/types/models'
import { historyRowSchema } from '@/lib/schemas'
import { enqueueWrite, getDb } from './core'

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

export async function clearAllHistory(): Promise<void> {
  await enqueueWrite((conn) => conn.execute('DELETE FROM history'))
}
