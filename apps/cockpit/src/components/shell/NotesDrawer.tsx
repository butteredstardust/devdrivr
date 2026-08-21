import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type Fuse from 'fuse.js'
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ClockCounterClockwiseIcon,
  CopyIcon,
  DotsSixVerticalIcon,
  NoteIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  PushPinIcon,
  TagIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Select } from '@/components/shared/Select'
import { TabBar } from '@/components/shared/TabBar'
import { processMarkdown } from '@/lib/markdown'
import { useHistoryStore } from '@/stores/history.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import type { Note as NoteType, NoteColor } from '@/types/models'
import { SearchInput } from '@/components/shared/SearchInput'
import { InlineInput } from '@/components/shared/InlineInput'

const MIN_WIDTH = 280
const MAX_WIDTH = 600
const AUTOSAVE_DELAY_MS = 450
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

type DropPosition = 'before' | 'after'
type DragOverNote = { id: string; position: DropPosition }
type Draft = Pick<NoteType, 'title' | 'content'>
type SaveState = 'saved' | 'saving' | 'error'

function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width))
}

function timeAgo(timestamp: number): string {
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

function noteColorVar(color: NoteColor): string {
  return `var(--note-${color})`
}

function noteCardStyle(color: NoteColor): CSSProperties {
  const token = noteColorVar(color)
  return {
    backgroundColor: `color-mix(in srgb, ${token} 7%, var(--color-surface))`,
    borderColor: `color-mix(in srgb, ${token} 25%, var(--color-border))`,
    borderLeftColor: token,
  }
}

function MarkdownRenderer({ content }: { content: string }) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelled = false
    void processMarkdown(content)
      .then((result) => {
        if (!cancelled) setHtml(result)
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error('[MarkdownRenderer] Failed to process markdown:', error)
      })
    return () => {
      cancelled = true
    }
  }, [content])

  const htmlProp = useMemo(() => ({ __html: html }), [html])
  return (
    <div
      className="prose prose-xs max-w-none overflow-hidden text-xs text-[var(--color-text)]"
      dangerouslySetInnerHTML={htmlProp}
    />
  )
}

function NoteEditor({
  note,
  onUpdate,
  onBack,
  onDelete,
  onCopy,
  onUseAsInput,
}: {
  note: NoteType
  onUpdate: (id: string, patch: Partial<NoteType>) => Promise<void>
  onBack: () => void
  onDelete: () => void
  onCopy: (content: string) => void
  onUseAsInput: (content: string) => void
}) {
  const [draft, setDraft] = useState<Draft>({ title: note.title, content: note.content })
  const [tagInput, setTagInput] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const draftRef = useRef(draft)
  const persistedRef = useRef(draft)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const mountedRef = useRef(true)

  const resizeTextarea = useCallback((element?: HTMLTextAreaElement | null) => {
    const textarea = element ?? textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [])

  const setTextareaRef = useCallback(
    (element: HTMLTextAreaElement | null) => {
      textareaRef.current = element
      resizeTextarea(element)
    },
    [resizeTextarea]
  )

  const flushDraft = useCallback((): Promise<void> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const next = draftRef.current
    const previous = persistedRef.current
    if (next.title === previous.title && next.content === previous.content) {
      return Promise.resolve()
    }
    persistedRef.current = next
    if (mountedRef.current) setSaveState('saving')
    return onUpdate(note.id, next)
      .then(() => {
        if (mountedRef.current) setSaveState('saved')
      })
      .catch((error: unknown) => {
        persistedRef.current = previous
        if (mountedRef.current) setSaveState('error')
        throw error
      })
  }, [note.id, onUpdate])

  const scheduleSave = useCallback(
    (next: Draft) => {
      draftRef.current = next
      setDraft(next)
      setSaveState('saving')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        void flushDraft().catch(() => {
          // The notes store provides the user-facing persistence error.
        })
      }, AUTOSAVE_DELAY_MS)
    },
    [flushDraft]
  )

  const applyImmediateUpdate = useCallback(
    (patch: Partial<NoteType>) => {
      void onUpdate(note.id, patch).catch(() => {
        // The notes store provides the user-facing persistence error.
      })
    },
    [note.id, onUpdate]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void flushDraft().catch(() => {
        // The notes store provides the user-facing persistence error.
      })
    }
  }, [flushDraft])

  const handleBack = useCallback(() => {
    void flushDraft()
      .catch(() => {
        // The notes store provides the user-facing persistence error.
      })
      .finally(onBack)
  }, [flushDraft, onBack])

  const handleDeleteRequest = useCallback(() => {
    void flushDraft()
      .catch(() => {
        // Deletion can still proceed when the latest draft could not be saved.
      })
      .finally(onDelete)
  }, [flushDraft, onDelete])

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !note.tags.includes(tag)) applyImmediateUpdate({ tags: [...note.tags, tag] })
    setTagInput('')
  }, [applyImmediateUpdate, note.tags, tagInput])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <Button variant="icon" size="sm" onClick={handleBack} aria-label="Back to all notes">
          <ArrowLeftIcon size={16} aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-[var(--color-text)]">
            {draft.title || 'Untitled note'}
          </p>
          <p
            className={`text-2xs ${saveState === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-text-muted)]'}`}
            aria-live="polite"
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved'}
          </p>
        </div>
        <Button
          variant="icon"
          size="sm"
          onClick={() => applyImmediateUpdate({ pinned: !note.pinned })}
          aria-label={`${note.pinned ? 'Unpin' : 'Pin'} ${draft.title || 'untitled note'}`}
          aria-pressed={note.pinned}
          title={note.pinned ? 'Unpin' : 'Pin'}
          className={note.pinned ? 'text-[var(--color-accent)]' : ''}
        >
          <PushPinIcon size={16} weight={note.pinned ? 'fill' : 'regular'} aria-hidden="true" />
        </Button>
        <Button
          variant="icon"
          size="sm"
          onClick={() => onCopy(draftRef.current.content)}
          aria-label="Copy note content"
        >
          <CopyIcon size={16} aria-hidden="true" />
        </Button>
        <Button variant="icon" size="sm" onClick={handleDeleteRequest} aria-label="Delete note">
          <TrashIcon size={16} aria-hidden="true" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        <InlineInput
          value={draft.title}
          onChange={(event) => scheduleSave({ ...draftRef.current, title: event.target.value })}
          placeholder="Note title"
          aria-label="Note title"
          variant="display"
          className="w-full"
          autoFocus
        />
        <textarea
          ref={setTextareaRef}
          value={draft.content}
          onChange={(event) => {
            scheduleSave({ ...draftRef.current, content: event.target.value })
            resizeTextarea(event.currentTarget)
          }}
          onInput={(event) => resizeTextarea(event.currentTarget)}
          placeholder="Start writing… Markdown is supported."
          aria-label="Note content"
          rows={8}
          className="mt-3 min-h-48 w-full resize-none overflow-hidden bg-transparent text-sm leading-6 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none"
        />

        <div className="mt-5 border-t border-[var(--color-border)] pt-4">
          <SectionLabel as="div" className="mb-2">
            <TagIcon size={12} aria-hidden="true" /> Tags
          </SectionLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-dim)] px-2 py-1 text-2xs text-[var(--color-accent)]"
              >
                {tag}
                <button
                  type="button"
                  onClick={() =>
                    applyImmediateUpdate({ tags: note.tags.filter((item) => item !== tag) })
                  }
                  aria-label={`Remove ${tag} tag`}
                  className="rounded-full focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  <XIcon size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
            <InlineInput
              variant="plain"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleAddTag()
                }
              }}
              onBlur={handleAddTag}
              placeholder="Add tag"
              aria-label="Add tag"
              className="min-w-20 flex-1 px-1 py-1"
            />
          </div>
        </div>

        <fieldset className="mt-5 border-t border-[var(--color-border)] pt-4">
          <SectionLabel as="legend" className="mb-2">
            Color
          </SectionLabel>
          <div className="flex flex-wrap gap-2">
            {NOTE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => applyImmediateUpdate({ color })}
                aria-label={`Set note color to ${color}`}
                aria-pressed={note.color === color}
                className={`min-h-7 min-w-7 rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
                  note.color === color
                    ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]'
                    : 'border-[var(--color-border)]'
                }`}
                style={{ backgroundColor: noteColorVar(color) }}
                title={color}
              />
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-3 py-2">
        <span className="text-2xs text-[var(--color-text-muted)]">
          {draft.content.trim()
            ? `${draft.content.trim().split(/\s+/).length} words`
            : 'Empty note'}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onUseAsInput(draftRef.current.content)}
          disabled={!draft.content}
        >
          <PaperPlaneTiltIcon size={14} aria-hidden="true" className="mr-1.5" />
          Use as input
        </Button>
      </div>
    </div>
  )
}

export function NotesDrawer() {
  const drawerOpen = useSettingsStore((state) => state.notesDrawerOpen)
  const savedWidth = useSettingsStore((state) => state.notesDrawerWidth)
  const updateSetting = useSettingsStore((state) => state.update)
  const notes = useNotesStore((state) => state.notes)
  const addNote = useNotesStore((state) => state.add)
  const updateNote = useNotesStore((state) => state.update)
  const reorderNotes = useNotesStore((state) => state.reorder)
  const removeNote = useNotesStore((state) => state.remove)
  const historyEntries = useHistoryStore((state) => state.entries)
  const setActiveTool = useUiStore((state) => state.setActiveTool)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const setPendingSendTo = useUiStore((state) => state.setPendingSendTo)

  const [width, setWidth] = useState(() => clampWidth(savedWidth))
  const [resizing, setResizing] = useState(false)
  const [activeTab, setActiveTab] = useState('notes')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<NoteType | null>(null)
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)
  const [dragOverNote, setDragOverNote] = useState<DragOverNote | null>(null)
  const [fuseVersion, setFuseVersion] = useState(0)
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fuseRef = useRef<Fuse<NoteType> | null>(null)
  const draggedNoteIdRef = useRef<string | null>(null)

  useEffect(() => setWidth(clampWidth(savedWidth)), [savedWidth])

  useEffect(() => {
    if (!drawerOpen) return
    let cancelled = false
    void import('fuse.js').then(({ default: FuseClass }) => {
      if (cancelled) return
      fuseRef.current = new FuseClass(notes, {
        keys: ['title', 'content', 'tags'],
        threshold: 0.3,
      })
      setFuseVersion((version) => version + 1)
    })
    return () => {
      cancelled = true
    }
  }, [drawerOpen, notes])

  useEffect(() => {
    if (editingId && !notes.some((note) => note.id === editingId)) setEditingId(null)
  }, [editingId, notes])

  const filteredNotes = useMemo(() => {
    if (!search.trim()) return notes
    return fuseVersion > 0 && fuseRef.current
      ? fuseRef.current.search(search).map((result) => result.item)
      : notes
  }, [fuseVersion, notes, search])

  const noteSections = useMemo(() => {
    if (search.trim()) return [{ id: 'results', label: 'Results', notes: filteredNotes }]
    return [
      { id: 'pinned', label: 'Pinned', notes: filteredNotes.filter((note) => note.pinned) },
      { id: 'notes', label: 'Notes', notes: filteredNotes.filter((note) => !note.pinned) },
    ].filter((section) => section.notes.length > 0)
  }, [filteredNotes, search])

  const filteredHistory = useMemo(
    () =>
      historyFilter
        ? historyEntries.filter((entry) => entry.tool === historyFilter)
        : historyEntries,
    [historyEntries, historyFilter]
  )
  const editingNote = notes.find((note) => note.id === editingId)
  const canReorderNotes = !search.trim()

  const handleDragStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      dragState.current = { startX: event.clientX, startWidth: width }
      setResizing(true)
      const onMove = (moveEvent: MouseEvent) => {
        if (!dragState.current) return
        setWidth(
          clampWidth(dragState.current.startWidth + dragState.current.startX - moveEvent.clientX)
        )
      }
      const onUp = (upEvent: MouseEvent) => {
        if (!dragState.current) return
        const final = clampWidth(
          dragState.current.startWidth + dragState.current.startX - upEvent.clientX
        )
        dragState.current = null
        setResizing(false)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => void updateSetting('notesDrawerWidth', final), 500)
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [updateSetting, width]
  )

  const handleAddNote = useCallback(async () => {
    try {
      const note = await addNote('', '', 'yellow')
      setEditingId(note.id)
      setLastAction('Note created', 'success')
    } catch {
      setLastAction('Failed to create note', 'error')
    }
  }, [addNote, setLastAction])

  const handleDelete = useCallback(async () => {
    if (!deleteCandidate) return
    try {
      await removeNote(deleteCandidate.id)
      setDeleteCandidate(null)
      setLastAction('Note deleted', 'info')
    } catch {
      setLastAction('Failed to delete note', 'error')
    }
  }, [deleteCandidate, removeNote, setLastAction])

  const copyNote = useCallback(
    (note: NoteType) => {
      void navigator.clipboard
        .writeText(note.content)
        .then(() => setLastAction('Copied to clipboard', 'info'))
        .catch(() => setLastAction('Failed to copy note', 'error'))
    },
    [setLastAction]
  )

  const handleUseAsInput = useCallback(
    (content: string) => {
      setPendingSendTo(content)
      setLastAction('Ready to send to tool', 'info')
    },
    [setLastAction, setPendingSendTo]
  )

  const clearNoteDragState = useCallback(() => {
    draggedNoteIdRef.current = null
    setDraggedNoteId(null)
    setDragOverNote(null)
  }, [])

  const handleNoteDragStart = useCallback(
    (note: NoteType, event: React.DragEvent<HTMLButtonElement>) => {
      if (!canReorderNotes) return event.preventDefault()
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', note.id)
      draggedNoteIdRef.current = note.id
      setDraggedNoteId(note.id)
    },
    [canReorderNotes]
  )

  const handleNoteDragOver = useCallback(
    (note: NoteType, event: React.DragEvent<HTMLDivElement>) => {
      const sourceId = draggedNoteIdRef.current ?? draggedNoteId
      if (!sourceId || sourceId === note.id) return
      const dragged = notes.find((item) => item.id === sourceId)
      if (!dragged || dragged.pinned !== note.pinned) return
      event.preventDefault()
      const bounds = event.currentTarget.getBoundingClientRect()
      setDragOverNote({
        id: note.id,
        position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
      })
    },
    [draggedNoteId, notes]
  )

  const handleNoteDrop = useCallback(
    (note: NoteType, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const sourceId =
        draggedNoteIdRef.current ?? draggedNoteId ?? event.dataTransfer.getData('text/plain')
      const position = dragOverNote?.id === note.id ? dragOverNote.position : 'before'
      clearNoteDragState()
      if (!sourceId || sourceId === note.id) return
      void reorderNotes(sourceId, note.id, position)
        .then(() => setLastAction('Note moved', 'success'))
        .catch(() => setLastAction('Failed to move note', 'error'))
    },
    [clearNoteDragState, dragOverNote, draggedNoteId, reorderNotes, setLastAction]
  )

  const moveNote = useCallback(
    (source: NoteType, target: NoteType | undefined, position: DropPosition) => {
      if (!target) return
      void reorderNotes(source.id, target.id, position)
        .then(() => setLastAction('Note moved', 'success'))
        .catch(() => setLastAction('Failed to move note', 'error'))
    },
    [reorderNotes, setLastAction]
  )

  return (
    <aside
      aria-label="Notes and history"
      // `w-0 opacity-0 pointer-events-none` hides the closed drawer from the eye and the mouse
      // only: its five controls and their text stay in the accessibility tree and in the tab
      // order, so a screen reader still announces a search field and a note list that aren't
      // there. `inert` is the one switch that covers focus, activation and AT together.
      inert={!drawerOpen}
      // The open/close slide is animated; a drag is not. Setting an inline width
      // does not opt out of a `transition-[width]` class, so every mousemove was
      // re-aiming an eased 200ms animation at a target that had already moved —
      // the edge trailed the cursor and arrived in visible steps. Same fix, and
      // same reason, as the sidebar.
      className={`relative flex shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] ease-[var(--ease-in-out)] ${
        resizing ? '' : 'transition-[width,opacity] duration-[var(--duration-panel)]'
      } ${
        drawerOpen ? 'opacity-100' : 'pointer-events-none w-0 overflow-hidden border-l-0 opacity-0'
      }`}
      style={drawerOpen ? { width } : undefined}
    >
      <div
        onMouseDown={handleDragStart}
        role="separator"
        aria-label="Resize notes drawer"
        aria-orientation="vertical"
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-[var(--color-accent)]/40 active:bg-[var(--color-accent)]/60"
        title="Drag to resize"
      />

      {!editingNote && (
        <div className="border-b border-[var(--color-border)]">
          <TabBar tabs={DRAWER_TABS} activeTab={activeTab} onTabChange={setActiveTab} noBorder />
        </div>
      )}

      {activeTab === 'notes' && editingNote ? (
        <NoteEditor
          key={editingNote.id}
          note={editingNote}
          onUpdate={updateNote}
          onBack={() => setEditingId(null)}
          onDelete={() => setDeleteCandidate(editingNote)}
          onCopy={(content) => copyNote({ ...editingNote, content })}
          onUseAsInput={handleUseAsInput}
        />
      ) : activeTab === 'notes' ? (
        <>
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2.5">
            <SearchInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search notes..."
              aria-label="Search notes"
              clearLabel="Clear notes search"
              className="min-w-0 flex-1"
            />
            <Button variant="primary" size="sm" onClick={() => void handleAddNote()}>
              <PlusIcon size={14} className="mr-1" aria-hidden="true" /> New
            </Button>
          </div>

          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5 text-2xs text-[var(--color-text-muted)]">
            <span>
              {search
                ? `${filteredNotes.length} of ${notes.length} note${notes.length === 1 ? '' : 's'}`
                : `${notes.length} note${notes.length === 1 ? '' : 's'}`}
            </span>
            {canReorderNotes && notes.length > 1 && <span>Drag to reorder</span>}
          </div>

          <div className="flex-1 overflow-auto p-2.5">
            {filteredNotes.length === 0 && (
              <EmptyState
                icon={NoteIcon}
                size="sm"
                title={search ? 'No matching notes' : 'Capture your first note'}
                description={
                  search
                    ? 'Try a different title, tag, or phrase.'
                    : 'Keep useful context close while you work.'
                }
                action={
                  !search ? (
                    <Button variant="primary" size="sm" onClick={() => void handleAddNote()}>
                      <PlusIcon size={14} className="mr-1" aria-hidden="true" /> New note
                    </Button>
                  ) : undefined
                }
              />
            )}
            {noteSections.map((section) => (
              <section key={section.id} className="mb-4">
                <SectionLabel as="div" className="mb-1.5 justify-between px-1">
                  <span>{section.label}</span>
                  <span>{section.notes.length}</span>
                </SectionLabel>
                <div className="space-y-2">
                  {section.notes.map((note, noteIndex) => {
                    const previousNote = section.notes[noteIndex - 1]
                    const nextNote = section.notes[noteIndex + 1]
                    const dragPlacement =
                      dragOverNote?.id === note.id ? dragOverNote.position : null
                    return (
                      <div
                        key={note.id}
                        data-testid={`note-card-${note.id}`}
                        onDragOver={(event) => handleNoteDragOver(note, event)}
                        onDrop={(event) => handleNoteDrop(note, event)}
                        onDragEnd={clearNoteDragState}
                        className={`group rounded-[var(--radius-lg)] border border-l-[3px] transition-colors ${
                          draggedNoteId === note.id ? 'opacity-60' : ''
                        } ${dragPlacement === 'before' ? 'border-t-2 border-t-[var(--color-accent)]' : ''} ${
                          dragPlacement === 'after'
                            ? 'border-b-2 border-b-[var(--color-accent)]'
                            : ''
                        }`}
                        style={noteCardStyle(note.color)}
                      >
                        <div className="flex items-start gap-1.5 p-2.5 pb-1">
                          {canReorderNotes && (
                            <button
                              type="button"
                              draggable
                              onDragStart={(event) => handleNoteDragStart(note, event)}
                              aria-label={`Drag ${note.title || 'untitled note'} to reorder`}
                              // Rests at muted and brightens to full text on hover/focus. It used
                              // to rest at opacity-60 over muted, which composited below the 3:1
                              // WCAG minimum for a UI control on every theme.
                              className="mt-0.5 inline-flex min-h-6 min-w-5 cursor-grab items-center justify-center rounded text-[var(--color-text-muted)] transition-colors focus-visible:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] group-hover:text-[var(--color-text)]"
                            >
                              <DotsSixVerticalIcon size={14} aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditingId(note.id)}
                            className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                            aria-label={`Edit ${note.title || 'untitled note'}`}
                          >
                            <span className="flex items-center gap-1.5">
                              {note.pinned && (
                                <PushPinIcon
                                  size={12}
                                  weight="fill"
                                  className="shrink-0 text-[var(--color-accent)]"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="truncate text-xs font-semibold text-[var(--color-text)]">
                                {note.title || 'Untitled'}
                              </span>
                            </span>
                            {note.content && (
                              <span className="mt-1.5 block line-clamp-3">
                                <MarkdownRenderer content={note.content} />
                              </span>
                            )}
                          </button>
                        </div>

                        <div className="flex items-center gap-1 px-2.5 pb-2.5">
                          <span className="mr-auto text-2xs text-[var(--color-text-muted)]">
                            {timeAgo(note.updatedAt)}
                          </span>
                          <Button
                            variant="icon"
                            size="xs"
                            onClick={() => moveNote(note, previousNote, 'before')}
                            disabled={!canReorderNotes || !previousNote}
                            aria-label={`Move ${note.title || 'untitled note'} up`}
                          >
                            <ArrowUpIcon size={12} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="icon"
                            size="xs"
                            onClick={() => moveNote(note, nextNote, 'after')}
                            disabled={!canReorderNotes || !nextNote}
                            aria-label={`Move ${note.title || 'untitled note'} down`}
                          >
                            <ArrowDownIcon size={12} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="icon"
                            size="xs"
                            onClick={() => copyNote(note)}
                            aria-label={`Copy ${note.title || 'untitled note'} content`}
                          >
                            <CopyIcon size={12} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="icon"
                            size="xs"
                            onClick={() => handleUseAsInput(note.content)}
                            aria-label={`Use ${note.title || 'untitled note'} as input`}
                          >
                            <PaperPlaneTiltIcon size={12} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="icon"
                            size="xs"
                            onClick={() => {
                              void updateNote(note.id, { pinned: !note.pinned }).catch(() => {
                                // The notes store provides the user-facing persistence error.
                              })
                            }}
                            aria-label={`${note.pinned ? 'Unpin' : 'Pin'} ${note.title || 'untitled note'}`}
                            aria-pressed={note.pinned}
                            className={note.pinned ? 'text-[var(--color-accent)]' : ''}
                          >
                            <PushPinIcon
                              size={12}
                              weight={note.pinned ? 'fill' : 'regular'}
                              aria-hidden="true"
                            />
                          </Button>
                          <Button
                            variant="icon"
                            size="xs"
                            onClick={() => setDeleteCandidate(note)}
                            aria-label={`Delete ${note.title || 'untitled note'}`}
                          >
                            <TrashIcon size={12} aria-hidden="true" />
                          </Button>
                        </div>

                        {note.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 border-t border-[var(--color-border)]/50 px-2.5 py-2">
                            {note.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-text-muted)]/10 px-1.5 py-0.5 text-2xs text-[var(--color-text-muted)]"
                              >
                                <TagIcon size={12} aria-hidden="true" /> {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="border-b border-[var(--color-border)] px-3 py-2.5">
            <Select
              value={historyFilter}
              onChange={(event) => setHistoryFilter(event.target.value)}
              className="w-full bg-[var(--color-bg)]"
              aria-label="Filter history by tool"
            >
              <option value="">All tools</option>
              {Array.from(new Set(historyEntries.map((entry) => entry.tool))).map((tool) => (
                <option key={tool} value={tool}>
                  {tool}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1 overflow-auto p-2.5">
            {filteredHistory.length === 0 && (
              <EmptyState
                icon={ClockCounterClockwiseIcon}
                size="sm"
                title={historyFilter ? 'No history for this tool' : 'No history yet'}
                description="Recent tool inputs appear here for quick replay."
              />
            )}
            <div className="space-y-2">
              {filteredHistory.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-left transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  onClick={() => {
                    if (entry.input) setPendingSendTo(entry.input)
                    setActiveTool(entry.tool)
                    setLastAction(`Replayed to ${entry.tool}`, 'info')
                  }}
                  aria-label={`Replay ${entry.tool} history entry`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-[var(--color-accent)]">
                      {entry.tool}
                    </span>
                    <span className="shrink-0 text-2xs text-[var(--color-text-muted)]">
                      {timeAgo(entry.timestamp)}
                    </span>
                  </span>
                  <span className="mt-1 block line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">
                    {entry.input.slice(0, 120)}
                    {entry.input.length > 120 ? '…' : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {deleteCandidate && (
        <Dialog
          title="Delete note?"
          onClose={() => setDeleteCandidate(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteCandidate(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleDelete()}>
                Delete note
              </Button>
            </>
          }
        >
          <p className="text-sm text-[var(--color-text-muted)]">
            “{deleteCandidate.title || 'Untitled'}” will be permanently deleted. This cannot be
            undone.
          </p>
        </Dialog>
      )}
    </aside>
  )
}
