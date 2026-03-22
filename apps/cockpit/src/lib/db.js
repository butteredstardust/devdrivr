import Database from '@tauri-apps/plugin-sql';
let db = null;
export async function getDb() {
    if (!db) {
        db = await Database.load('sqlite:cockpit.db');
        // WAL mode for concurrent reads — must be set at connection time, not in migrations
        await db.execute('PRAGMA journal_mode=WAL');
    }
    return db;
}
// --- Settings ---
export async function getSetting(key, fallback) {
    const conn = await getDb();
    const rows = await conn.select('SELECT value FROM settings WHERE key = $1', [key]);
    if (rows.length === 0)
        return fallback;
    return JSON.parse(rows[0].value);
}
export async function setSetting(key, value) {
    const conn = await getDb();
    await conn.execute('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2', [key, JSON.stringify(value)]);
}
// --- Tool State ---
export async function loadToolState(toolId) {
    const conn = await getDb();
    const rows = await conn.select('SELECT state FROM tool_state WHERE tool_id = $1', [toolId]);
    if (rows.length === 0)
        return null;
    return JSON.parse(rows[0].state);
}
export async function saveToolState(toolId, state) {
    const conn = await getDb();
    await conn.execute('INSERT INTO tool_state (tool_id, state, updated_at) VALUES ($1, $2, $3) ON CONFLICT(tool_id) DO UPDATE SET state = $2, updated_at = $3', [toolId, JSON.stringify(state), Date.now()]);
}
function rowToNote(row) {
    const note = {
        id: row.id,
        title: row.title,
        content: row.content,
        color: row.color,
        pinned: row.pinned === 1,
        poppedOut: row.popped_out === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
    if (row.window_x != null && row.window_y != null && row.window_width != null && row.window_height != null) {
        note.windowBounds = { x: row.window_x, y: row.window_y, width: row.window_width, height: row.window_height };
    }
    return note;
}
export async function loadNotes() {
    const conn = await getDb();
    const rows = await conn.select('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC');
    return rows.map(rowToNote);
}
export async function saveNote(note) {
    const conn = await getDb();
    await conn.execute(`INSERT INTO notes (id, title, content, color, pinned, popped_out, window_x, window_y, window_width, window_height, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, color=$4, pinned=$5, popped_out=$6, window_x=$7, window_y=$8, window_width=$9, window_height=$10, updated_at=$12`, [
        note.id, note.title, note.content, note.color,
        note.pinned ? 1 : 0, note.poppedOut ? 1 : 0,
        note.windowBounds?.x ?? null, note.windowBounds?.y ?? null,
        note.windowBounds?.width ?? null, note.windowBounds?.height ?? null,
        note.createdAt, note.updatedAt,
    ]);
}
export async function deleteNote(id) {
    const conn = await getDb();
    await conn.execute('DELETE FROM notes WHERE id = $1', [id]);
}
function rowToSnippet(row) {
    return {
        id: row.id,
        title: row.title,
        content: row.content,
        language: row.language,
        tags: JSON.parse(row.tags),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
export async function loadSnippets() {
    const conn = await getDb();
    const rows = await conn.select('SELECT * FROM snippets ORDER BY updated_at DESC');
    return rows.map(rowToSnippet);
}
export async function saveSnippet(snippet) {
    const conn = await getDb();
    await conn.execute(`INSERT INTO snippets (id, title, content, language, tags, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, language=$4, tags=$5, updated_at=$7`, [snippet.id, snippet.title, snippet.content, snippet.language, JSON.stringify(snippet.tags), snippet.createdAt, snippet.updatedAt]);
}
export async function deleteSnippet(id) {
    const conn = await getDb();
    await conn.execute('DELETE FROM snippets WHERE id = $1', [id]);
}
function rowToHistory(row) {
    const entry = {
        id: row.id,
        tool: row.tool,
        input: row.input,
        output: row.output,
        timestamp: row.timestamp,
    };
    if (row.sub_tab != null) {
        entry.subTab = row.sub_tab;
    }
    return entry;
}
export async function loadHistory(tool, limit = 100) {
    const conn = await getDb();
    if (tool) {
        return (await conn.select('SELECT * FROM history WHERE tool = $1 ORDER BY timestamp DESC LIMIT $2', [tool, limit])).map(rowToHistory);
    }
    return (await conn.select('SELECT * FROM history ORDER BY timestamp DESC LIMIT $1', [limit])).map(rowToHistory);
}
export async function addHistoryEntry(entry) {
    const conn = await getDb();
    await conn.execute('INSERT INTO history (id, tool, sub_tab, input, output, timestamp) VALUES ($1, $2, $3, $4, $5, $6)', [entry.id, entry.tool, entry.subTab ?? null, entry.input, entry.output, entry.timestamp]);
}
export async function pruneHistory(tool, keepCount) {
    const conn = await getDb();
    await conn.execute(`DELETE FROM history WHERE tool = $1 AND id NOT IN (
       SELECT id FROM history WHERE tool = $1 ORDER BY timestamp DESC LIMIT $2
     )`, [tool, keepCount]);
}
