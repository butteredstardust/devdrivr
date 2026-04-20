import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type Fuse from 'fuse.js'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useHistoryStore } from '@/stores/history.store'
import { useUiStore } from '@/stores/ui.store'
import { TabBar } from '@/components/shared/TabBar'
import {
  PushPinIcon,
  TrashIcon,
  NoteIcon,
  ClockCounterClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CopyIcon,
  PaperPlaneTiltIcon,
  TagIcon,
  XIcon,
  DotsSixVerticalIcon,
} from '@phosphor-icons/react'
import type { NoteColor, Note as NoteType } from '@/types/models'
import { processMarkdown } from '@/lib/markdown'

const MIN_WIDTH = 200
const MAX_WIDTH = 600

type DropPosition = 'before' | 'after'

type DragOverNote = {
  id: string
  position: DropPosition
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const DRAWER_TABS = [
  { id: 'notes', label: 'Notes' },
  { id: 'history', label: 'History' },
]

const NOTE_COLORS: NoteColor[] = [
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
  'orange',
  'red',
  'gray',
]

function noteColorVar(color: NoteColor): string {
  return `var(--note-${color})`
}

function noteCardStyle(color: NoteColor): CSSProperties {
  const token = noteColorVar(color)
  return {
    backgroundColor: `color-mix(in srgb, ${token} 10%, var(--color-surface))`,
    borderColor: `color-mix(in srgb, ${token} 28%, var(--color-border))`,
    borderLeftColor: token,
  }
}

function MarkdownRenderer({ content }: { content: string }) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    processMarkdown(content).then(setHtml)
  }, [content])

  return (
    <div
      className="prose prose-xs max-w-none overflow-hidden text-xs text-[var(--color-text)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function NoteEditor({
  note,
  onUpdate,
  onDone,
}: {
  note: NoteType
  onUpdate: (id: string, patch: Partial<NoteType>) => void | Promise<void>
  onDone: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tagInput, setTagInput] = useState('')

  const applyUpdate = useCallback(
    (patch: Partial<NoteType>) => {
      void Promise.resolve(onUpdate(note.id, patch)).catch(() => {
        // The persisted notes store already raises the user-facing toast.
      })
    },
    [note.id, onUpdate]
  )

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !note.tags.includes(tag)) {
      applyUpdate({ tags: [...note.tags, tag] })
    }
    setTagInput('')
  }, [applyUpdate, tagInput, note.tags])

  const handleRemoveTag = useCallback(
    (tag: string) => {
      applyUpdate({ tags: note.tags.filter((t) => t !== tag) })
    },
    [applyUpdate, note.tags]
  )

  const autoGrow = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [])

  useEffect(() => {
    autoGrow()
  }, [note.content, autoGrow])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDone()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onDone])

  return (
    <div ref={containerRef} className="flex min-w-0 flex-col gap-1 overflow-hidden">
      <input
        value={note.title}
        onChange={(e) => applyUpdate({ title: e.target.value })}
        placeholder="Title"
        className="w-full bg-transparent text-xs font-bold text-[var(--color-text)] outline-none"
        autoFocus
      />
      <textarea
        ref={textareaRef}
        value={note.content}
        onChange={(e) => {
          applyUpdate({ content: e.target.value })
          autoGrow()
        }}
        onInput={autoGrow}
        placeholder="Write something (Markdown supported)..."
        rows={2}
        className="w-full min-h-[4rem] max-h-[20rem] resize-none overflow-auto bg-transparent text-xs text-[var(--color-text)] outline-none"
      />

      {/* Tag Editor */}
      <div className="mt-1 flex flex-wrap gap-1">
        {note.tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded bg-[var(--color-accent-dim)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]"
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              aria-label={`Remove ${tag} tag`}
              className="inline-flex min-h-5 min-w-5 items-center justify-center rounded transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            >
              <XIcon size={10} aria-hidden="true" />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
            placeholder="add tag..."
            className="w-16 bg-transparent text-[10px] text-[var(--color-text-muted)] outline-none"
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)]/20 pt-2">
        <div className="flex items-center gap-1">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => applyUpdate({ color: c })}
              aria-label={`Set note color to ${c}`}
              aria-pressed={note.color === c}
              className={`min-h-6 min-w-6 rounded-full border transition-transform duration-150 hover:scale-110 ${
                note.color === c
                  ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]'
                  : 'border-[var(--color-border)]'
              }`}
              style={{ backgroundColor: noteColorVar(c) }}
              title={c}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onDone}
          className="rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] transition-colors duration-150 hover:bg-[var(--color-accent-dim)]"
        >
          Done
        </button>
      </div>
    </div>
  )
}

export function NotesDrawer() {
  const drawerOpen = useSettingsStore((s) => s.notesDrawerOpen)
  const savedWidth = useSettingsStore((s) => s.notesDrawerWidth)
  const updateSetting = useSettingsStore((s) => s.update)
  const [width, setWidth] = useState(savedWidth)
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Sync local width if the saved value changes (e.g. on init)
  useEffect(() => {
    setWidth(savedWidth)
  }, [savedWidth])

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragState.current = { startX: e.clientX, startWidth: width }

      const onMove = (ev: MouseEvent) => {
        if (!dragState.current) return
        const delta = dragState.current.startX - ev.clientX
        const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragState.current.startWidth + delta))
        setWidth(next)
      }

      const onUp = (ev: MouseEvent) => {
        if (!dragState.current) return
        const delta = dragState.current.startX - ev.clientX
        const final = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragState.current.startWidth + delta))
        dragState.current = null
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        // Debounce the DB write
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          void updateSetting('notesDrawerWidth', final)
        }, 500)
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [width, updateSetting]
  )

  const notes = useNotesStore((s) => s.notes)
  const addNote = useNotesStore((s) => s.add)
  const updateNote = useNotesStore((s) => s.update)
  const reorderNotes = useNotesStore((s) => s.reorder)
  const removeNote = useNotesStore((s) => s.remove)
  const historyEntries = useHistoryStore((s) => s.entries)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const setLastAction = useUiStore((s) => s.setLastAction)

  const [activeTab, setActiveTab] = useState('notes')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState('')
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)
  const [dragOverNote, setDragOverNote] = useState<DragOverNote | null>(null)
  const [fuseVersion, setFuseVersion] = useState(0)

  const fuseRef = useRef<Fuse<NoteType> | null>(null)

  useEffect(() => {
    if (!drawerOpen) return
    import('fuse.js').then(({ default: FuseClass }) => {
      fuseRef.current = new FuseClass(notes, { keys: ['title', 'content', 'tags'], threshold: 0.3 })
      setFuseVersion((version) => version + 1)
    })
  }, [drawerOpen, notes])

  const fuseReady = fuseVersion > 0

  const filteredNotes = useMemo(() => {
    if (!search.trim()) return notes
    return fuseReady && fuseRef.current ? fuseRef.current.search(search).map((r) => r.item) : notes
  }, [fuseReady, notes, search])

  const noteSections = useMemo(() => {
    if (search.trim()) {
      return [{ id: 'results', label: 'Results', notes: filteredNotes }]
    }

    return [
      { id: 'pinned', label: 'Pinned', notes: filteredNotes.filter((note) => note.pinned) },
      { id: 'notes', label: 'Notes', notes: filteredNotes.filter((note) => !note.pinned) },
    ].filter((section) => section.notes.length > 0)
  }, [filteredNotes, search])

  const canReorderNotes = !search.trim()

  const filteredHistory = useMemo(() => {
    if (!historyFilter) return historyEntries
    return historyEntries.filter((e) => e.tool === historyFilter)
  }, [historyEntries, historyFilter])

  const handleAddNote = useCallback(async () => {
    try {
      const note = await addNote('New note', '', 'yellow')
      setEditingId(note.id)
      setLastAction('Note created', 'success')
    } catch {
      setLastAction('Failed to create note', 'error')
    }
  }, [addNote, setLastAction])

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await removeNote(id)
        setLastAction('Note deleted', 'info')
      } catch {
        setLastAction('Failed to delete note', 'error')
      }
    },
    [removeNote, setLastAction]
  )

  const handleNoteDragStart = useCallback(
    (note: NoteType, e: React.DragEvent<HTMLDivElement>) => {
      if (!canReorderNotes || editingId === note.id) {
        e.preventDefault()
        return
      }
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', note.id)
      setDraggedNoteId(note.id)
    },
    [canReorderNotes, editingId]
  )

  const handleNoteDragOver = useCallback(
    (note: NoteType, e: React.DragEvent<HTMLDivElement>) => {
      if (!draggedNoteId || draggedNoteId === note.id) return
      const dragged = notes.find((n) => n.id === draggedNoteId)
      if (!dragged || dragged.pinned !== note.pinned) return

      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const bounds = e.currentTarget.getBoundingClientRect()
      const position: DropPosition = e.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
      setDragOverNote({ id: note.id, position })
    },
    [draggedNoteId, notes]
  )

  const clearNoteDragState = useCallback(() => {
    setDraggedNoteId(null)
    setDragOverNote(null)
  }, [])

  const handleNoteDrop = useCallback(
    (note: NoteType, e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const sourceId = draggedNoteId ?? e.dataTransfer.getData('text/plain')
      const position = dragOverNote?.id === note.id ? dragOverNote.position : 'before'
      clearNoteDragState()
      if (!sourceId || sourceId === note.id) return

      void reorderNotes(sourceId, note.id, position)
        .then(() => setLastAction('Note moved', 'success'))
        .catch(() => setLastAction('Failed to move note', 'error'))
    },
    [clearNoteDragState, dragOverNote, draggedNoteId, reorderNotes, setLastAction]
  )

  const setPendingSendTo = useUiStore((s) => s.setPendingSendTo)
  const handleHistoryReplay = useCallback(
    (tool: string, input: string) => {
      if (input) setPendingSendTo(input)
      setActiveTool(tool)
      setLastAction(`Replayed to ${tool}`, 'info')
    },
    [setActiveTool, setPendingSendTo, setLastAction]
  )

  return (
    <aside
      className={`relative flex shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] transition-[width,opacity] duration-200 ease-in-out ${drawerOpen ? 'opacity-100' : 'pointer-events-none w-0 overflow-hidden opacity-0 border-l-0'}`}
      style={drawerOpen ? { width } : undefined}
    >
      {/* Drag handle — sits on the left edge */}
      <div
        onMouseDown={handleDragStart}
        role="separator"
        aria-label="Resize notes drawer"
        aria-orientation="vertical"
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-[var(--color-accent)]/40 active:bg-[var(--color-accent)]/60 transition-colors"
        title="Drag to resize"
      />
      <div className="border-b border-[var(--color-border)]">
        <TabBar tabs={DRAWER_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {activeTab === 'notes' && (
        <>
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 focus-within:border-[var(--color-accent)]">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes..."
                className="min-w-0 flex-1 bg-transparent text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear notes search"
                  className="inline-flex min-h-5 min-w-5 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                >
                  <XIcon size={11} aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                void handleAddNote()
              }}
              aria-label="New note"
              className="rounded border border-[var(--color-accent)] px-2 py-1 font-mono text-xs text-[var(--color-accent)] transition-colors duration-150 hover:bg-[var(--color-accent-dim)]"
            >
              +
            </button>
          </div>
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5 text-[10px] text-[var(--color-text-muted)]">
            <span>
              {search
                ? `${filteredNotes.length} of ${notes.length} note${notes.length === 1 ? '' : 's'}`
                : `${notes.length} note${notes.length === 1 ? '' : 's'}`}
            </span>
            {canReorderNotes && notes.length > 1 && <span>Drag notes to reorder</span>}
          </div>
          <div className="flex-1 overflow-auto p-2">
            {filteredNotes.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-[var(--color-text-muted)]">
                <NoteIcon size={24} weight="light" />
                <span>{search ? 'No matching notes' : 'No notes yet'}</span>
                {!search && <span className="text-[10px] opacity-60">Click + to create one</span>}
              </div>
            )}
            {noteSections.map((section) => (
              <section key={section.id} className="mb-3">
                <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  <span>{section.label}</span>
                  <span>{section.notes.length}</span>
                </div>
                {section.notes.map((note) => {
                  const dragPlacement = dragOverNote?.id === note.id ? dragOverNote.position : null
                  return (
                    <div
                      key={note.id}
                      data-testid={`note-card-${note.id}`}
                      draggable={canReorderNotes && editingId !== note.id}
                      onDragStart={(e) => handleNoteDragStart(note, e)}
                      onDragOver={(e) => handleNoteDragOver(note, e)}
                      onDrop={(e) => handleNoteDrop(note, e)}
                      onDragEnd={clearNoteDragState}
                      className={`mb-3 rounded-lg border border-l-4 shadow-sm transition-colors duration-150 ${
                        editingId === note.id ? 'ring-1 ring-[var(--color-accent)]' : ''
                      } ${draggedNoteId === note.id ? 'opacity-60' : ''} ${
                        dragPlacement === 'before'
                          ? 'border-t-2 border-t-[var(--color-accent)]'
                          : ''
                      } ${
                        dragPlacement === 'after' ? 'border-b-2 border-b-[var(--color-accent)]' : ''
                      }`}
                      style={noteCardStyle(note.color)}
                    >
                      <div className="p-3">
                        {editingId === note.id ? (
                          <NoteEditor
                            note={note}
                            onUpdate={updateNote}
                            onDone={() => setEditingId(null)}
                          />
                        ) : (
                          <div
                            className="group cursor-pointer"
                            onClick={() => setEditingId(note.id)}
                          >
                            <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
                              {canReorderNotes && (
                                <span
                                  aria-hidden="true"
                                  className="inline-flex min-h-6 min-w-4 cursor-grab items-center justify-center rounded opacity-60 transition-opacity group-hover:opacity-100"
                                  title="Drag to reorder"
                                >
                                  <DotsSixVerticalIcon size={13} />
                                </span>
                              )}
                              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                <span className="truncate text-xs font-bold text-[var(--color-text)]">
                                  {note.title || 'Untitled'}
                                </span>
                                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      navigator.clipboard
                                        .writeText(note.content)
                                        .then(() => setLastAction('Copied to clipboard', 'info'))
                                        .catch(() => setLastAction('Failed to copy note', 'error'))
                                    }}
                                    aria-label={`Copy ${note.title || 'untitled note'} content`}
                                    className="inline-flex min-h-7 min-w-7 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-accent-dim)] hover:text-[var(--color-accent)]"
                                    title="Copy content"
                                  >
                                    <CopyIcon size={12} aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setPendingSendTo(note.content)
                                      setLastAction('Ready to send to tool', 'info')
                                    }}
                                    aria-label={`Use ${note.title || 'untitled note'} as input`}
                                    className="inline-flex min-h-7 min-w-7 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-accent-dim)] hover:text-[var(--color-accent)]"
                                    title="Use as input"
                                  >
                                    <PaperPlaneTiltIcon size={12} aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void updateNote(note.id, { pinned: !note.pinned }).catch(() =>
                                        setLastAction('Failed to update note', 'error')
                                      )
                                    }}
                                    aria-label={`${note.pinned ? 'Unpin' : 'Pin'} ${note.title || 'untitled note'}`}
                                    aria-pressed={note.pinned}
                                    className={`inline-flex min-h-7 min-w-7 items-center justify-center rounded transition-colors duration-150 ${note.pinned ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'}`}
                                    title={note.pinned ? 'Unpin' : 'Pin'}
                                  >
                                    <PushPinIcon
                                      size={12}
                                      weight={note.pinned ? 'fill' : 'regular'}
                                      aria-hidden="true"
                                    />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void handleDelete(note.id)
                                    }}
                                    aria-label={`Delete ${note.title || 'untitled note'}`}
                                    className="inline-flex min-h-7 min-w-7 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-error)]"
                                    title="Delete note"
                                  >
                                    <TrashIcon size={12} aria-hidden="true" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {note.content && (
                              <div className="mt-2 line-clamp-6">
                                <MarkdownRenderer content={note.content} />
                              </div>
                            )}

                            {note.tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {note.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="flex items-center gap-0.5 rounded-full bg-[var(--color-text-muted)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]"
                                  >
                                    <TagIcon size={8} aria-hidden="true" />
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
                              <span>{timeAgo(note.updatedAt)}</span>
                              {note.content.length > 0 && (
                                <span>{note.content.split(/\s+/).length} words</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </section>
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
              className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">All tools</option>
              {Array.from(new Set(historyEntries.map((e) => e.tool))).map((tool) => (
                <option key={tool} value={tool}>
                  {tool}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {filteredHistory.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-[var(--color-text-muted)]">
                <ClockCounterClockwiseIcon size={24} weight="light" />
                <span>{historyFilter ? 'No history for this tool' : 'No history yet'}</span>
              </div>
            )}
            {filteredHistory.map((entry) => (
              <div
                key={entry.id}
                className="mb-2 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2 transition-colors duration-150 hover:bg-[var(--color-surface-hover)]"
                onClick={() => handleHistoryReplay(entry.tool, entry.input)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--color-accent)]">{entry.tool}</span>
                  <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
                    <ArrowCounterClockwiseIcon size={10} />
                    <span className="text-[10px]">{timeAgo(entry.timestamp)}</span>
                  </div>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-muted)]">
                  {entry.input.slice(0, 100)}
                  {entry.input.length > 100 ? '...' : ''}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
