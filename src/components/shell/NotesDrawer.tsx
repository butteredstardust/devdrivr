import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Fuse from 'fuse.js'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Select } from '@/components/shared/Select'
import { TabBar } from '@/components/shared/TabBar'
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react'
import { NoteEditor } from '@/components/shell/notes-drawer/NoteEditor'
import { NotesList } from '@/components/shell/notes-drawer/NotesList'
import { useDrawerWidth } from '@/components/shell/notes-drawer/hooks/useDrawerWidth'
import { useNoteReorder } from '@/components/shell/notes-drawer/hooks/useNoteReorder'
import {
  DRAWER_TABS,
  timeAgo,
  type DropPosition,
} from '@/components/shell/notes-drawer/note-helpers'
import { MIN_NOTES_DRAWER_WIDTH } from '@/lib/shell-layout'
import { sendToTool } from '@/lib/tool-handoff'
import { useHistoryStore } from '@/stores/history.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import type { Note as NoteType } from '@/types/models'

export function NotesDrawer() {
  const drawerOpen = useSettingsStore((state) => state.notesDrawerOpen)
  const savedWidth = useSettingsStore((state) => state.notesDrawerWidth)
  const updateSetting = useSettingsStore((state) => state.update)
  const notes = useNotesStore((state) => state.notes)
  const addNote = useNotesStore((state) => state.add)
  const updateNote = useNotesStore((state) => state.update)
  const editNote = useNotesStore((state) => state.edit)
  const flushPendingNote = useNotesStore((state) => state.flushPending)
  const pendingSaveIds = useNotesStore((state) => state.pendingSaveIds)
  const saveErrorIds = useNotesStore((state) => state.saveErrorIds)
  const reorderNotes = useNotesStore((state) => state.reorder)
  const removeNote = useNotesStore((state) => state.remove)
  const historyEntries = useHistoryStore((state) => state.entries)
  const setActiveTool = useWorkspaceStore((state) => state.setActiveTool)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const setPendingSendTo = useUiStore((state) => state.setPendingSendTo)
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed)
  const sidebarWidth = useSettingsStore((state) => state.sidebarWidth)

  const { drawerMax, handleDragStart, handleResizeKeyDown, renderedWidth, resizing } =
    useDrawerWidth({
      drawerOpen,
      savedWidth,
      sidebarCollapsed,
      sidebarWidth,
      updateSetting,
    })
  const [activeTab, setActiveTab] = useState('notes')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<NoteType | null>(null)
  const [fuseVersion, setFuseVersion] = useState(0)
  const fuseRef = useRef<Fuse<NoteType> | null>(null)
  const noteListRef = useRef<HTMLDivElement | null>(null)
  const drawerWasOpenRef = useRef(drawerOpen)

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

  useEffect(() => {
    if (drawerWasOpenRef.current && !drawerOpen && editingId) {
      void flushPendingNote(editingId).catch(() => {
        // The notes store rolls back and reports its own persistence failure.
      })
    }
    drawerWasOpenRef.current = drawerOpen
  }, [drawerOpen, editingId, flushPendingNote])

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
  const { draggedNoteId, dragOverNote, handleNotePointerDown } = useNoteReorder(noteListRef)

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
      setLastAction('Note moved to Trash', 'info')
    } catch {
      setLastAction('Failed to move note to Trash', 'error')
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
      data-key-scope="notes-drawer"
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
      className={`shell-panel relative flex shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] ease-[var(--ease-in-out)] ${
        resizing ? '' : 'transition-[width,opacity] duration-[var(--duration-panel)]'
      } ${
        drawerOpen ? 'opacity-100' : 'pointer-events-none w-0 overflow-hidden border-l-0 opacity-0'
      }`}
      style={drawerOpen ? { width: renderedWidth } : undefined}
    >
      <div
        onPointerDown={handleDragStart}
        onKeyDown={handleResizeKeyDown}
        role="separator"
        tabIndex={0}
        aria-label="Resize notes drawer"
        aria-orientation="vertical"
        // The rendered geometry, not the stored preference. A narrow row can render the drawer
        // below both the stored width and the floor, and an announced value outside its own
        // range is an invalid range.
        aria-valuenow={renderedWidth}
        aria-valuemin={Math.min(MIN_NOTES_DRAWER_WIDTH, renderedWidth)}
        aria-valuemax={drawerMax}
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-[var(--color-accent)]/40 active:bg-[var(--color-accent)]/60 focus-visible:outline-none focus-visible:bg-[var(--color-accent)]/60"
        title="Drag to resize — arrow keys also work"
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
          saveState={
            saveErrorIds.includes(editingNote.id)
              ? 'error'
              : pendingSaveIds.includes(editingNote.id)
                ? 'saving'
                : 'saved'
          }
          onEdit={editNote}
          onFlush={flushPendingNote}
          onUpdate={updateNote}
          onBack={() => setEditingId(null)}
          onOpenWorkspace={() => {
            const openWorkspace = () => sendToTool('notes', { selectedId: editingNote.id })
            void flushPendingNote(editingNote.id).then(openWorkspace, openWorkspace)
          }}
          onDelete={() => setDeleteCandidate(editingNote)}
          onCopy={(content) => copyNote({ ...editingNote, content })}
          onUseAsInput={handleUseAsInput}
        />
      ) : activeTab === 'notes' ? (
        <NotesList
          canReorderNotes={canReorderNotes}
          copyNote={copyNote}
          dragOverNote={dragOverNote}
          draggedNoteId={draggedNoteId}
          filteredNotes={filteredNotes}
          handleAddNote={handleAddNote}
          handleNotePointerDown={handleNotePointerDown}
          handleUseAsInput={handleUseAsInput}
          moveNote={moveNote}
          noteListRef={noteListRef}
          notes={notes}
          noteSections={noteSections}
          search={search}
          setDeleteCandidate={setDeleteCandidate}
          setEditingId={setEditingId}
          setSearch={setSearch}
          updateNote={updateNote}
        />
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
          title="Move note to Trash?"
          onClose={() => setDeleteCandidate(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteCandidate(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleDelete()}>
                Move to Trash
              </Button>
            </>
          }
        >
          <p className="text-sm text-[var(--color-text-muted)]">
            “{deleteCandidate.title || 'Untitled'}” can be restored from the Notes workspace Trash.
          </p>
        </Dialog>
      )}
    </aside>
  )
}
