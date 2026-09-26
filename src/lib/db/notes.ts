import type { Note, ResourceFolder } from '@/types/models'
import { noteRowSchema } from '@/lib/schemas'
import { parseWikiLinks } from '@/lib/wiki-links'
import { enqueueWrite, getDb, runBatch } from './core'
import type { BatchStatement } from './core'
import { buildSaveResourceFolder } from './resource-folders'

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
  deleted_at: number | null
  task_status: string | null
  task_priority: string | null
  task_due_date: string | null
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
  return loadNotesByTrash(false)
}

export async function loadTrashedNotes(): Promise<Note[]> {
  return loadNotesByTrash(true)
}

export async function loadNote(id: string): Promise<Note | null> {
  const conn = await getDb()
  const rows = await conn.select<NoteRow[]>('SELECT * FROM notes WHERE id = $1', [id])
  const row = rows[0]
  return row ? rowToNote(row) : null
}

async function loadNotesByTrash(trashed: boolean): Promise<Note[]> {
  const conn = await getDb()
  const rows = await conn.select<NoteRow[]>(
    `SELECT * FROM notes WHERE deleted_at IS ${trashed ? 'NOT ' : ''}NULL ORDER BY pinned DESC, sort_order ASC, updated_at DESC`
  )
  return rows.map(rowToNote).filter((n): n is Note => n !== null)
}

function noteSaveStatement(note: Note): BatchStatement {
  return {
    sql: `INSERT INTO notes (id, title, content, color, pinned, popped_out, window_x, window_y, window_width, window_height, created_at, updated_at, tags, sort_order, folder_id, deleted_at, task_status, task_priority, task_due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, color=$4, pinned=$5, popped_out=$6, window_x=$7, window_y=$8, window_width=$9, window_height=$10, updated_at=$12, tags=$13, sort_order=$14, folder_id=$15, task_status=$17, task_priority=$18, task_due_date=$19`,
    params: [
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
      note.deletedAt ?? null,
      note.taskStatus ?? null,
      note.taskPriority ?? null,
      note.taskDueDate ?? null,
    ],
  }
}

function noteLinkStatements(note: Pick<Note, 'id' | 'content'>): BatchStatement[] {
  const unique = new Map(
    parseWikiLinks(note.content).map((link) => [`${link.kind}:${link.id}`, link] as const)
  )
  return [
    { sql: 'DELETE FROM note_links WHERE source_note_id = $1', params: [note.id] },
    ...[...unique.values()].map((link) => ({
      sql: `INSERT INTO note_links (source_note_id, target_kind, target_id, created_at)
        VALUES ($1, $2, $3, $4)`,
      params: [note.id, link.kind, link.id, Date.now()],
    })),
  ]
}

export async function saveNote(note: Note): Promise<void> {
  await runBatch([noteSaveStatement(note), ...noteLinkStatements(note)], true)
}

export async function saveNoteIfUnchanged(note: Note, expectedUpdatedAt: number): Promise<boolean> {
  const statement = noteSaveStatement(note)
  // Number the guard from the parameter count, so a new column cannot shift it.
  statement.params.push(expectedUpdatedAt)
  statement.sql += ` WHERE notes.updated_at = $${statement.params.length}`
  statement.stopOnZeroRows = true
  const results = await runBatch([statement, ...noteLinkStatements(note)], true)
  return results[0]?.rowsAffected === 1
}

export async function rebuildNoteLinks(notes: Note[]): Promise<void> {
  await runBatch(
    [
      { sql: 'DELETE FROM note_links', params: [] },
      ...notes.flatMap((note) => noteLinkStatements(note).slice(1)),
    ],
    true
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
  await enqueueWrite((conn) =>
    conn.execute('UPDATE notes SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL', [
      Date.now(),
      id,
    ])
  )
}

export async function restoreNote(id: string): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute(
      `UPDATE notes SET deleted_at = NULL,
       folder_id = CASE WHEN EXISTS (
         SELECT 1 FROM resource_folders folder
         WHERE folder.id = notes.folder_id AND folder.kind = 'notes' AND folder.deleted_at IS NULL
       ) THEN folder_id ELSE 'notes-inbox' END
       WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id]
    )
  )
}

export async function permanentlyDeleteNote(id: string): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute('DELETE FROM notes WHERE id = $1 AND deleted_at IS NOT NULL', [id])
  )
}

export async function trashCompletedNotes(): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute(
      "UPDATE notes SET deleted_at = $1 WHERE task_status = 'done' AND deleted_at IS NULL",
      [Date.now()]
    )
  )
}

// --- Bulk clear ---

export async function clearAllNotes(): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute('UPDATE notes SET deleted_at = $1 WHERE deleted_at IS NULL', [Date.now()])
  )
}

/** Restores a versioned Notes backup in one DB transaction and is safe to retry. */
export async function restoreNotesFromBackup(
  folders: ResourceFolder[],
  notes: Note[]
): Promise<void> {
  await runBatch(
    [
      ...folders.flatMap((folder) => [
        buildSaveResourceFolder(folder),
        {
          sql: "UPDATE resource_folders SET deleted_at = NULL WHERE id = $1 AND kind = 'notes'",
          params: [folder.id],
        },
      ]),
      ...notes.flatMap((note) => [
        noteSaveStatement(note),
        { sql: 'UPDATE notes SET deleted_at = NULL WHERE id = $1', params: [note.id] },
        ...noteLinkStatements(note),
      ]),
    ],
    true
  )
}
