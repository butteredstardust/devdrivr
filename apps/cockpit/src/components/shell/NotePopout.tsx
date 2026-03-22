import { useEffect, useState } from 'react'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import type { NoteColor } from '@/types/models'

const NOTE_COLORS: NoteColor[] = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'red', 'gray']

const COLOR_BG: Record<NoteColor, string> = {
  yellow: 'bg-yellow-500/10',
  green: 'bg-green-500/10',
  blue: 'bg-blue-500/10',
  pink: 'bg-pink-500/10',
  purple: 'bg-purple-500/10',
  orange: 'bg-orange-500/10',
  red: 'bg-red-500/10',
  gray: 'bg-gray-500/10',
}

export function NotePopout({ noteId }: { noteId: string }) {
  const notes = useNotesStore((s) => s.notes)
  const updateNote = useNotesStore((s) => s.update)
  const initialized = useNotesStore((s) => s.initialized)
  const initNotes = useNotesStore((s) => s.init)
  const initSettings = useSettingsStore((s) => s.init)
  const settingsReady = useSettingsStore((s) => s.initialized)
  const [localTitle, setLocalTitle] = useState('')
  const [localContent, setLocalContent] = useState('')

  // Pop-out windows bypass <Providers>, so init settings (for theme) and notes store here
  useEffect(() => {
    if (!settingsReady) { initSettings() }
    if (!initialized) { initNotes() }
  }, [settingsReady, initialized, initSettings, initNotes])

  const note = notes.find((n) => n.id === noteId)

  useEffect(() => {
    if (note) {
      setLocalTitle(note.title)
      setLocalContent(note.content)
    }
  }, [note?.id])

  if (!initialized || !settingsReady) {
    return <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">Loading...</div>
  }
  if (!note) {
    return <div className="flex h-full items-center justify-center text-[var(--color-error)]">Note not found</div>
  }

  const handleTitleBlur = () => updateNote(noteId, { title: localTitle })
  const handleContentBlur = () => updateNote(noteId, { content: localContent })

  return (
    <div className={`flex h-full flex-col ${COLOR_BG[note.color]}`}>
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-3 py-2" data-tauri-drag-region>
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => updateNote(noteId, { color: c })}
            className={`h-3 w-3 rounded-full ${note.color === c ? 'ring-2 ring-[var(--color-accent)]' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <input
        value={localTitle}
        onChange={(e) => setLocalTitle(e.target.value)}
        onBlur={handleTitleBlur}
        placeholder="Title"
        className="bg-transparent px-3 py-2 text-sm font-bold text-[var(--color-text)] outline-none"
      />
      <textarea
        value={localContent}
        onChange={(e) => setLocalContent(e.target.value)}
        onBlur={handleContentBlur}
        placeholder="Write something..."
        className="flex-1 resize-none bg-transparent px-3 py-1 text-sm text-[var(--color-text)] outline-none"
      />
    </div>
  )
}
