import { describe, expect, it } from 'vitest'
import type { Note } from '@/types/models'
import { localDateKey, sortTasks, taskMatchesView } from '@/tools/notes/task-model'

function task(
  id: string,
  taskStatus: Note['taskStatus'],
  taskDueDate?: string,
  taskPriority?: Note['taskPriority']
): Note {
  const note: Note = {
    id,
    title: id,
    content: '',
    color: 'yellow',
    pinned: false,
    poppedOut: false,
    tags: [],
    sortOrder: 0,
    folderId: 'notes-inbox',
    createdAt: 1,
    updatedAt: 1,
  }
  if (taskStatus) note.taskStatus = taskStatus
  if (taskDueDate) note.taskDueDate = taskDueDate
  if (taskPriority) note.taskPriority = taskPriority
  return note
}

describe('note task views', () => {
  it('derives local date keys at both sides of a local midnight boundary', () => {
    expect(localDateKey(new Date(2026, 8, 5, 23, 59, 59))).toBe('2026-09-05')
    expect(localDateKey(new Date(2026, 8, 6, 0, 0, 1))).toBe('2026-09-06')
  })

  it('keeps completed tasks out of Today, Upcoming, and Overdue', () => {
    const today = '2026-09-06'
    expect(taskMatchesView(task('today', 'todo', today), 'today', today)).toBe(true)
    expect(taskMatchesView(task('future', 'blocked', '2026-09-07'), 'upcoming', today)).toBe(true)
    expect(taskMatchesView(task('late', 'in_progress', '2026-09-05'), 'overdue', today)).toBe(true)
    expect(taskMatchesView(task('done', 'done', '2026-09-05'), 'overdue', today)).toBe(false)
    expect(taskMatchesView(task('undated', 'todo'), 'upcoming', today)).toBe(false)
    expect(taskMatchesView(task('plain', undefined), 'all', today)).toBe(false)
    expect(taskMatchesView(task('plain', undefined), 'notes', today)).toBe(true)
  })

  it('sorts active tasks by due date and priority, with completed tasks last', () => {
    const notes = [
      task('done', 'done', '2026-09-01', 'high'),
      task('low', 'todo', '2026-09-07', 'low'),
      task('high', 'todo', '2026-09-07', 'high'),
      task('undated', 'todo', undefined, 'high'),
      task('early', 'todo', '2026-09-06', 'medium'),
    ]

    expect(sortTasks(notes).map((note) => note.id)).toEqual([
      'early',
      'high',
      'low',
      'undated',
      'done',
    ])
  })
})
