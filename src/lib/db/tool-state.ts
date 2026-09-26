import { enqueueWrite, getDb } from './core'

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
