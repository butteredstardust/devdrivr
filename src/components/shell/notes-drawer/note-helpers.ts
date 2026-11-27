import type { CSSProperties } from 'react'
import { NOTE_COLORS as NOTE_COLOR_VALUES } from '@/lib/domain-values'
import type { NoteColor } from '@/types/models'

export const DRAWER_TABS = [
  { id: 'notes', label: 'Notes' },
  { id: 'history', label: 'History' },
]

export const NOTE_COLORS: NoteColor[] = [...NOTE_COLOR_VALUES]

export type DropPosition = 'before' | 'after'
export type DragOverNote = { id: string; position: DropPosition }

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
