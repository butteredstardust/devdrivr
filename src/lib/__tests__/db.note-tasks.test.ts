import { describe, expect, it, vi } from 'vitest'
import type { Note } from '@/types/models'
import { useSqliteTestDatabase } from '@/test-utils/sqlite-db'

vi.mock(
  '@tauri-apps/plugin-sql',
  async () => (await import('@/test-utils/sqlite-db')).sqlitePluginModule
)
vi.mock(
  '@tauri-apps/api/core',
  async () => (await import('@/test-utils/sqlite-db')).sqliteCoreModule
)

useSqliteTestDatabase()

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    title: id,
    content: 'Keep the full note body',
    color: 'yellow',
    pinned: false,
    poppedOut: false,
    tags: ['release'],
    sortOrder: 1,
    folderId: 'notes-inbox',
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  }
}

describe('note tasks', () => {
  it('round-trips task metadata, and leaves it absent on a plain note', async () => {
    const { loadNote, saveNote } = await import('@/lib/db')
    const task = note('task-1', {
      taskStatus: 'in_progress',
      taskPriority: 'high',
      taskDueDate: '2026-09-08',
    })

    await saveNote(task)
    await saveNote(note('plain'))

    await expect(loadNote('task-1')).resolves.toEqual(task)
    const plain = await loadNote('plain')
    expect(plain).not.toHaveProperty('taskStatus')
    expect(plain).not.toHaveProperty('taskPriority')
    expect(plain).not.toHaveProperty('taskDueDate')
  })

  it('trashes only completed live tasks', async () => {
    const db = await import('@/lib/db')
    await db.saveNote(note('done', { taskStatus: 'done' }))
    await db.saveNote(note('open', { taskStatus: 'todo' }))
    await db.saveNote(note('plain'))

    await db.trashCompletedNotes()

    expect((await db.loadNotes()).map((n) => n.id).sort()).toEqual(['open', 'plain'])
    expect((await db.loadTrashedNotes()).map((n) => n.id)).toEqual(['done'])
  })
})
