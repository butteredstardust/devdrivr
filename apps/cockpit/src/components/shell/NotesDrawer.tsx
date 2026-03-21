import { useCallback, useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useHistoryStore } from '@/stores/history.store'
import { useUiStore } from '@/stores/ui.store'
import { TabBar } from '@/components/shared/TabBar'
import type { NoteColor } from '@/types/models'

const DRAWER_TABS = [
  { id: 'notes', label: 'Notes' },
  { id: 'history', label: 'History' },
]

const NOTE_COLORS: NoteColor[] = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'red', 'gray']

const COLOR_MAP: Record<NoteColor, string> = {
  yellow: 'bg-yellow-500/20 border-yellow-500/30',
  green: 'bg-green-500/20 border-green-500/30',
  blue: 'bg-blue-500/20 border-blue-500/30',
  pink: 'bg-pink-500/20 border-pink-500/30',
  purple: 'bg-purple-500/20 border-purple-500/30',
  orange: 'bg-orange-500/20 border-orange-500/30',
  red: 'bg-red-500/20 border-red-500/30',
  gray: 'bg-gray-500/20 border-gray-500/30',
}

export function NotesDrawer() {
  const drawerOpen = useSettingsStore((s) => s.notesDrawerOpen)
  const notes = useNotesStore((s) => s.notes)
  const addNote = useNotesStore((s) => s.add)
  const updateNote = useNotesStore((s) => s.update)
  const removeNote = useNotesStore((s) => s.remove)
  const historyEntries = useHistoryStore((s) => s.entries)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const setLastAction = useUiStore((s) => s.setLastAction)

  const [activeTab, setActiveTab] = useState('notes')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState('')

  const fuse = useMemo(
    () => new Fuse(notes, { keys: ['title', 'content'], threshold: 0.4 }),
    [notes]
  )

  const filteredNotes = useMemo(() => {
    if (!search.trim()) return notes
    return fuse.search(search).map((r) => r.item)
  }, [notes, search, fuse])

  const filteredHistory = useMemo(() => {
    if (!historyFilter) return historyEntries
    return historyEntries.filter((e) => e.tool === historyFilter)
  }, [historyEntries, historyFilter])

  const handleAddNote = useCallback(async () => {
    const note = await addNote('New note', '', 'yellow')
    setEditingId(note.id)
    setLastAction('Note created', 'success')
  }, [addNote, setLastAction])

  const handleDelete = useCallback(async (id: string) => {
    await removeNote(id)
    setLastAction('Note deleted', 'info')
  }, [removeNote, setLastAction])

  const handleHistoryReplay = useCallback((tool: string, _input: string) => {
    setActiveTool(tool)
    setLastAction(`Switched to ${tool}`, 'info')
  }, [setActiveTool, setLastAction])

  if (!drawerOpen) return null

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)]">
        <TabBar tabs={DRAWER_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {activeTab === 'notes' && (
        <>
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              onClick={handleAddNote}
              className="rounded border border-[var(--color-accent)] px-2 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
            >
              +
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {filteredNotes.length === 0 && (
              <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
                {search ? 'No matching notes' : 'No notes yet — click + to create one'}
              </div>
            )}
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className={`mb-2 rounded border p-2 ${COLOR_MAP[note.color] ?? 'bg-[var(--color-surface)] border-[var(--color-border)]'}`}
              >
                {editingId === note.id ? (
                  <div className="flex flex-col gap-1">
                    <input
                      value={note.title}
                      onChange={(e) => updateNote(note.id, { title: e.target.value })}
                      placeholder="Title"
                      className="bg-transparent text-xs font-bold text-[var(--color-text)] outline-none"
                      autoFocus
                    />
                    <textarea
                      value={note.content}
                      onChange={(e) => updateNote(note.id, { content: e.target.value })}
                      placeholder="Write something..."
                      rows={4}
                      className="resize-none bg-transparent text-xs text-[var(--color-text)] outline-none"
                    />
                    <div className="flex items-center gap-1">
                      {NOTE_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateNote(note.id, { color: c })}
                          className={`h-4 w-4 rounded-full border ${note.color === c ? 'ring-2 ring-[var(--color-accent)]' : ''}`}
                          style={{ backgroundColor: `var(--note-${c}, ${c})` }}
                          title={c}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setEditingId(null)}
                      className="mt-1 self-end text-xs text-[var(--color-accent)] hover:underline"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <span
                        className="cursor-pointer text-xs font-bold text-[var(--color-text)] hover:underline"
                        onClick={() => setEditingId(note.id)}
                      >
                        {note.title || 'Untitled'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateNote(note.id, { pinned: !note.pinned })}
                          className={`text-xs ${note.pinned ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                          title={note.pinned ? 'Unpin' : 'Pin'}
                        >
                          {note.pinned ? '★' : '☆'}
                        </button>
                        <button
                          onClick={() => handleDelete(note.id)}
                          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {note.content && (
                      <p className="mt-1 line-clamp-3 text-xs text-[var(--color-text-muted)]">{note.content}</p>
                    )}
                    <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <>
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
            >
              <option value="">All tools</option>
              {Array.from(new Set(historyEntries.map((e) => e.tool))).map((tool) => (
                <option key={tool} value={tool}>{tool}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {filteredHistory.length === 0 && (
              <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
                No history yet
              </div>
            )}
            {filteredHistory.map((entry) => (
              <div
                key={entry.id}
                className="mb-2 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2 hover:bg-[var(--color-surface-hover)]"
                onClick={() => handleHistoryReplay(entry.tool, entry.input)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--color-accent)]">{entry.tool}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-muted)]">
                  {entry.input.slice(0, 100)}{entry.input.length > 100 ? '...' : ''}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
