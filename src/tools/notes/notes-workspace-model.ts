import type { EditorMode } from '@/tools/markdown-editor/markdown-model'
import type { TaskPriority, TaskStatus } from '@/types/models'
import type { TaskView } from '@/tools/notes/task-model'

export type NotesWorkspaceState = {
  selectedId: string | null
  mode: EditorMode
  libraryOpen: boolean
  selectedFolderId: string | null
  taskView: TaskView
  hideCompleted: boolean
}

export type UpdateNotesWorkspaceState = (patch: Partial<NotesWorkspaceState>) => void

export const DEFAULT_NOTES_WORKSPACE_STATE: NotesWorkspaceState = {
  selectedId: null,
  mode: 'split',
  libraryOpen: true,
  selectedFolderId: null,
  taskView: 'notes',
  hideCompleted: false,
}

export function notePreview(content: string): string {
  const line =
    content
      .split('\n')
      .find((candidate) => candidate.trim())
      ?.trim() ?? ''
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d ago` : new Date(timestamp).toLocaleDateString()
}

export const TASK_STATUS_OPTIONS: ReadonlyArray<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

export const TASK_PRIORITY_OPTIONS: ReadonlyArray<{ value: TaskPriority; label: string }> = [
  { value: 'high', label: 'High priority' },
  { value: 'medium', label: 'Medium priority' },
  { value: 'low', label: 'Low priority' },
]

export function taskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

export function dueDateLabel(value: string, today: string): string {
  if (value === today) return 'Due today'
  if (value < today) return `Overdue · ${value}`
  return `Due ${value}`
}
