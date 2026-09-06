import type { Note, TaskPriority } from '@/types/models'

export type TaskView = 'notes' | 'all' | 'today' | 'upcoming' | 'completed' | 'overdue'

export const TASK_VIEWS: ReadonlyArray<{ value: TaskView; label: string }> = [
  { value: 'notes', label: 'Notes' },
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
]

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export function localDateKey(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isTask(note: Note): boolean {
  return note.taskStatus !== undefined
}

export function taskMatchesView(note: Note, view: TaskView, today = localDateKey()): boolean {
  if (view === 'notes') return true
  if (!isTask(note)) return false
  if (view === 'all') return true
  if (view === 'completed') return note.taskStatus === 'done'
  if (note.taskStatus === 'done' || !note.taskDueDate) return false
  if (view === 'today') return note.taskDueDate === today
  if (view === 'upcoming') return note.taskDueDate > today
  return note.taskDueDate < today
}

export function sortTasks(notes: Note[]): Note[] {
  return [...notes].sort((left, right) => {
    const leftDone = left.taskStatus === 'done'
    const rightDone = right.taskStatus === 'done'
    if (leftDone !== rightDone) return leftDone ? 1 : -1
    if (left.taskDueDate !== right.taskDueDate) {
      if (!left.taskDueDate) return 1
      if (!right.taskDueDate) return -1
      return left.taskDueDate.localeCompare(right.taskDueDate)
    }
    const priorityDifference =
      (left.taskPriority ? PRIORITY_ORDER[left.taskPriority] : 3) -
      (right.taskPriority ? PRIORITY_ORDER[right.taskPriority] : 3)
    if (priorityDifference !== 0) return priorityDifference
    return left.sortOrder - right.sortOrder || right.updatedAt - left.updatedAt
  })
}
