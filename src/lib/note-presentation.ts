export const NOTE_SAVE_LABELS = {
  saved: 'Saved',
  saving: 'Saving…',
  error: 'Save failed',
} as const

export type NoteSaveState = keyof typeof NOTE_SAVE_LABELS

export function getNoteSaveState(
  noteId: string,
  pendingSaveIds: readonly string[],
  saveErrorIds: readonly string[]
): NoteSaveState {
  if (saveErrorIds.includes(noteId)) return 'error'
  return pendingSaveIds.includes(noteId) ? 'saving' : 'saved'
}

/** Keep the drawer's shorter date display while sharing the relative-time calculation. */
export function noteTimeAgo(timestamp: number, compact = false): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < (compact ? 7 : 30)) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(
    undefined,
    compact ? { month: 'short', day: 'numeric' } : undefined
  )
}
