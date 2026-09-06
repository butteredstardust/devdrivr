import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '@/types/models'

const sqlMock = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  load: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: sqlMock.load } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('note task DB helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    sqlMock.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 })
    sqlMock.select.mockResolvedValue([])
    sqlMock.load.mockResolvedValue({ execute: sqlMock.execute, select: sqlMock.select })
  })

  it('round-trips optional task metadata when saving a note', async () => {
    const { saveNote } = await import('@/lib/db')
    const note: Note = {
      id: 'task-1',
      title: 'Ship release',
      content: 'Keep the full note body',
      color: 'yellow',
      pinned: false,
      poppedOut: false,
      tags: ['release'],
      sortOrder: 1,
      folderId: 'notes-inbox',
      taskStatus: 'in_progress',
      taskPriority: 'high',
      taskDueDate: '2026-09-08',
      createdAt: 1,
      updatedAt: 2,
    }

    await saveNote(note)

    const [sql, params] = sqlMock.execute.mock.calls[2] as [string, unknown[]]
    expect(sql).toContain('task_status=$17')
    expect(params.slice(-3)).toEqual(['in_progress', 'high', '2026-09-08'])
  })

  it('soft-deletes only completed live tasks', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123)
    const { trashCompletedNotes } = await import('@/lib/db')

    await trashCompletedNotes()

    expect(sqlMock.execute).toHaveBeenCalledWith(
      "UPDATE notes SET deleted_at = $1 WHERE task_status = 'done' AND deleted_at IS NULL",
      [123]
    )
  })
})
