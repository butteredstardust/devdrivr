import type { CSSProperties } from 'react'
import type { NoteColor } from '@/types/models'

export const DRAWER_TABS = [
  { id: 'notes', label: 'Notes' },
  { id: 'history', label: 'History' },
]

export const NOTE_COLORS: NoteColor[] = [
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
  'orange',
  'red',
  'gray',
]

export type DropPosition = 'before' | 'after'
export type DragOverNote = { id: string; position: DropPosition }
export type SaveState = 'saved' | 'saving' | 'error'

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function noteColorVar(color: NoteColor): string {
  return `var(--note-${color})`
}

export function noteCardStyle(color: NoteColor): CSSProperties {
  const token = noteColorVar(color)
  return {
    backgroundColor: `color-mix(in srgb, ${token} 7%, var(--color-surface))`,
    borderColor: `color-mix(in srgb, ${token} 25%, var(--color-border))`,
    borderLeftColor: token,
  }
}
