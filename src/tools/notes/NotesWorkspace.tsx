import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { OnMount } from '@monaco-editor/react'
import Fuse from 'fuse.js'
import {
  CheckCircleIcon,
  CopyIcon,
  NoteIcon,
  PlusIcon,
  PushPinIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { InlineInput } from '@/components/shared/InlineInput'
import { Input, Select } from '@/components/shared/Input'
import { MasterDetailLayout } from '@/components/shared/MasterDetailLayout'
import { ResourceFolderTree } from '@/components/shared/ResourceFolderTree'
import { TrashDialog, type TrashEntry } from '@/components/shared/TrashDialog'
import { SearchInput } from '@/components/shared/SearchInput'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { SplitPane } from '@/components/shared/SplitPane'
import { useIsInstanceActive } from '@/app/tool-instance'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useMonaco } from '@/hooks/useMonaco'
import { useScrollSync } from '@/tools/markdown-editor/hooks/useScrollSync'
import { useTabDirty } from '@/hooks/useTabDirty'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolState } from '@/hooks/useToolState'
import { useNotesStore } from '@/stores/notes.store'
import { useFoldersStore } from '@/stores/folders.store'
import { useUiStore } from '@/stores/ui.store'
import { MarkdownPreview } from '@/tools/markdown-editor/MarkdownPreview'
import {
  MODE_OPTIONS,
  renderMarkdownContent,
  type EditorInstance,
  type EditorMode,
} from '@/tools/markdown-editor/markdown-model'
import { toggleTaskAtIndex } from '@/tools/markdown-editor/task-list'
import type { Note, ResourceFolder, TaskPriority, TaskStatus } from '@/types/models'
import { formatShortcut } from '@/lib/shortcut-label'
import { descendantFolderIds, folderPath, foldersForKind } from '@/lib/resource-folders'
import {
  isTask,
  localDateKey,
  sortTasks,
  taskMatchesView,
  TASK_VIEWS,
  type TaskView,
} from '@/tools/notes/task-model'

type NotesWorkspaceState = {
  selectedId: string | null
  mode: EditorMode
  libraryOpen: boolean
  selectedFolderId: string | null
  taskView: TaskView
  hideCompleted: boolean
}

function notePreview(content: string): string {
  const line =
    content
      .split('\n')
      .find((candidate) => candidate.trim())
      ?.trim() ?? ''
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
}

function timeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d ago` : new Date(timestamp).toLocaleDateString()
}

const TASK_STATUS_OPTIONS: ReadonlyArray<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

const TASK_PRIORITY_OPTIONS: ReadonlyArray<{ value: TaskPriority; label: string }> = [
  { value: 'high', label: 'High priority' },
  { value: 'medium', label: 'Medium priority' },
  { value: 'low', label: 'Low priority' },
]

function taskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

function dueDateLabel(value: string, today: string): string {
  if (value === today) return 'Due today'
  if (value < today) return `Overdue · ${value}`
  return `Due ${value}`
}

export default function NotesWorkspace() {
  const isInstanceActive = useIsInstanceActive()
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const notes = useNotesStore((state) => state.notes)
  const trashedNotes = useNotesStore((state) => state.trashedNotes)
  const pendingSaveIds = useNotesStore((state) => state.pendingSaveIds)
  const saveErrorIds = useNotesStore((state) => state.saveErrorIds)
  const addNote = useNotesStore((state) => state.add)
  const editNote = useNotesStore((state) => state.edit)
  const updateNote = useNotesStore((state) => state.update)
  const updateTask = useNotesStore((state) => state.updateTask)
  const flushPending = useNotesStore((state) => state.flushPending)
  const removeNote = useNotesStore((state) => state.remove)
  const restoreNote = useNotesStore((state) => state.restore)
  const permanentlyDeleteNote = useNotesStore((state) => state.permanentlyDelete)
  const trashCompletedNotes = useNotesStore((state) => state.trashCompleted)
  const refreshNotes = useNotesStore((state) => state.refresh)
  const folders = useFoldersStore((state) => state.folders)
  const trashedFolders = useFoldersStore((state) => state.trashedFolders)
  const createFolder = useFoldersStore((state) => state.create)
  const updateFolder = useFoldersStore((state) => state.update)
  const moveFolder = useFoldersStore((state) => state.move)
  const trashFolder = useFoldersStore((state) => state.trash)
  const restoreFolder = useFoldersStore((state) => state.restore)
  const permanentlyDeleteFolder = useFoldersStore((state) => state.permanentlyDelete)
  const emptyFolderTrash = useFoldersStore((state) => state.emptyTrash)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const copy = useCopyToClipboard()
  const [state, updateState] = useToolState<NotesWorkspaceState>('notes', {
    selectedId: null,
    mode: 'split',
    libraryOpen: true,
    selectedFolderId: null,
    taskView: 'notes',
    hideCompleted: false,
  })
  const [search, setSearch] = useState('')
  const [html, setHtml] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<Note | null>(null)
  const [folderTrashCandidate, setFolderTrashCandidate] = useState<ResourceFolder | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [removeTaskCandidate, setRemoveTaskCandidate] = useState<Note | null>(null)
  const [trashCompletedOpen, setTrashCompletedOpen] = useState(false)
  const [today, setToday] = useState(() => localDateKey())
  const [mountedEditor, setMountedEditor] = useState<EditorInstance | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const previousSelectedIdRef = useRef<string | null>(null)

  useEffect(() => {
    const now = new Date()
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timer = window.setTimeout(
      () => setToday(localDateKey()),
      nextMidnight.getTime() - now.getTime() + 50
    )
    return () => window.clearTimeout(timer)
  }, [today])

  const selected = useMemo(
    () => notes.find((note) => note.id === state.selectedId) ?? null,
    [notes, state.selectedId]
  )
  const selectedId = selected?.id ?? null

  const fuse = useMemo(
    () =>
      new Fuse(notes, {
        keys: ['title', 'content', 'tags'],
        threshold: 0.3,
      }),
    [notes]
  )
  const noteFolders = useMemo(() => foldersForKind(folders, 'notes'), [folders])
  const trashedNoteFolders = useMemo(
    () => foldersForKind(trashedFolders, 'notes'),
    [trashedFolders]
  )
  const trashEntries = useMemo<TrashEntry[]>(() => {
    const trashedFolderIds = new Set(trashedNoteFolders.map((folder) => folder.id))
    const folderEntries = trashedNoteFolders
      .filter((folder) => !folder.parentId || !trashedFolderIds.has(folder.parentId))
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        detail: 'Folder and its contents',
        type: 'folder' as const,
      }))
    const noteEntries = trashedNotes
      .filter((note) => !note.folderId || !trashedFolderIds.has(note.folderId))
      .map((note) => ({
        id: note.id,
        name: note.title || 'Untitled note',
        detail: note.taskStatus ? `Task · ${taskStatusLabel(note.taskStatus)}` : 'Note',
        type: 'item' as const,
      }))
    return [...folderEntries, ...noteEntries]
  }, [trashedNoteFolders, trashedNotes])
  const selectedFolderIds = useMemo(
    () =>
      state.selectedFolderId ? descendantFolderIds(noteFolders, state.selectedFolderId) : null,
    [noteFolders, state.selectedFolderId]
  )
  const filteredNotes = useMemo(() => {
    let candidates = search.trim() ? fuse.search(search.trim()).map((result) => result.item) : notes
    candidates = candidates.filter(
      (note) =>
        taskMatchesView(note, state.taskView, today) &&
        (!state.hideCompleted || state.taskView === 'completed' || note.taskStatus !== 'done')
    )
    const inFolder = selectedFolderIds
      ? candidates.filter((note) => note.folderId && selectedFolderIds.has(note.folderId))
      : candidates
    return state.taskView === 'notes' ? inFolder : sortTasks(inFolder)
  }, [fuse, notes, search, selectedFolderIds, state.hideCompleted, state.taskView, today])
  const taskCounts = useMemo(() => {
    const counts = new Map<TaskView, number>()
    for (const view of TASK_VIEWS) {
      counts.set(
        view.value,
        notes.filter((note) => taskMatchesView(note, view.value, today)).length
      )
    }
    return counts
  }, [notes, today])
  const completedCount = taskCounts.get('completed') ?? 0
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of notes) {
      if (note.folderId) counts.set(note.folderId, (counts.get(note.folderId) ?? 0) + 1)
    }
    return counts
  }, [notes])

  const editorMount: OnMount = useCallback((editor) => setMountedEditor(editor), [])
  useScrollSync(mountedEditor, previewRef, state.mode === 'split', state.mode === 'split')

  useTabDirty(selected ? pendingSaveIds.includes(selected.id) : false)

  useEffect(() => {
    if (filteredNotes.length === 0) {
      if (state.selectedId !== null) updateState({ selectedId: null })
      return
    }
    if (!state.selectedId || !filteredNotes.some((note) => note.id === state.selectedId)) {
      updateState({ selectedId: filteredNotes[0]?.id ?? null })
    }
  }, [filteredNotes, state.selectedId, updateState])

  useEffect(() => {
    const previousId = previousSelectedIdRef.current
    if (previousId && previousId !== state.selectedId) {
      void flushPending(previousId).catch(() => {
        // The notes store rolls back and reports its own persistence failure.
      })
    }
    previousSelectedIdRef.current = state.selectedId
  }, [flushPending, state.selectedId])

  useEffect(
    () => () => {
      void flushPending().catch(() => {
        // The notes store rolls back and reports its own persistence failure.
      })
    },
    [flushPending]
  )

  useEffect(() => {
    if (isInstanceActive || !selectedId) return
    void flushPending(selectedId).catch(() => {
      // The notes store rolls back and reports its own persistence failure.
    })
  }, [flushPending, isInstanceActive, selectedId])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void renderMarkdownContent(selected?.content ?? '').then((rendered) => {
        if (!cancelled) setHtml(rendered)
      })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [selected?.content])

  const handleNew = useCallback(async () => {
    try {
      const note = await addNote(
        'Untitled note',
        '',
        'yellow',
        state.selectedFolderId ?? 'notes-inbox'
      )
      updateState({ selectedId: note.id })
      setLastAction('Note created', 'success')
    } catch {
      setLastAction('Failed to create note', 'error')
    }
  }, [addNote, setLastAction, state.selectedFolderId, updateState])

  const handleNewTask = useCallback(async () => {
    try {
      const note = await addNote(
        'Untitled task',
        '',
        'yellow',
        state.selectedFolderId ?? 'notes-inbox',
        { status: 'todo', priority: 'medium' }
      )
      updateState({ selectedId: note.id, taskView: 'all' })
      setLastAction('Task created', 'success')
    } catch {
      setLastAction('Failed to create task', 'error')
    }
  }, [addNote, setLastAction, state.selectedFolderId, updateState])

  const handleToggleComplete = useCallback(
    async (note: Note) => {
      if (!note.taskStatus) return
      try {
        await updateTask(note.id, { status: note.taskStatus === 'done' ? 'todo' : 'done' })
        setLastAction(note.taskStatus === 'done' ? 'Task reopened' : 'Task completed', 'success')
      } catch {
        setLastAction('Failed to update task', 'error')
      }
    },
    [setLastAction, updateTask]
  )

  const handleRemoveTaskMetadata = useCallback(async () => {
    if (!removeTaskCandidate) return
    try {
      await updateTask(removeTaskCandidate.id, { status: null })
      setRemoveTaskCandidate(null)
      setLastAction('Task converted to note', 'success')
    } catch {
      setLastAction('Failed to convert task to note', 'error')
    }
  }, [removeTaskCandidate, setLastAction, updateTask])

  const handleTrashCompleted = useCallback(async () => {
    try {
      await trashCompletedNotes()
      setTrashCompletedOpen(false)
      setLastAction('Completed tasks moved to Trash', 'info')
    } catch {
      setLastAction('Failed to move completed tasks to Trash', 'error')
    }
  }, [setLastAction, trashCompletedNotes])

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

  const handleTrashFolder = useCallback(async () => {
    if (!folderTrashCandidate) return
    try {
      await flushPending()
      await trashFolder(folderTrashCandidate.id)
      await refreshNotes()
      updateState({ selectedFolderId: null })
      setFolderTrashCandidate(null)
      setLastAction('Folder moved to Trash', 'info')
    } catch {
      setLastAction('Failed to move folder to Trash', 'error')
    }
  }, [flushPending, folderTrashCandidate, refreshNotes, setLastAction, trashFolder, updateState])

  const handleRestoreTrashEntry = useCallback(
    async (entry: TrashEntry) => {
      if (entry.type === 'folder') {
        await restoreFolder(entry.id)
        await refreshNotes()
      } else {
        await restoreNote(entry.id)
      }
      setLastAction(`${entry.name} restored`, 'success')
    },
    [refreshNotes, restoreFolder, restoreNote, setLastAction]
  )

  const handleDeleteTrashEntry = useCallback(
    async (entry: TrashEntry) => {
      if (entry.type === 'folder') {
        await permanentlyDeleteFolder(entry.id)
        await refreshNotes()
      } else {
        await permanentlyDeleteNote(entry.id)
      }
      setLastAction(`${entry.name} permanently deleted`, 'info')
    },
    [permanentlyDeleteFolder, permanentlyDeleteNote, refreshNotes, setLastAction]
  )

  const handleEmptyTrash = useCallback(async () => {
    await emptyFolderTrash('notes')
    await refreshNotes()
    setLastAction('Notes Trash emptied', 'info')
  }, [emptyFolderTrash, refreshNotes, setLastAction])

  const handleCopyCode = useCallback(
    (code: string) => {
      void copy(code, {
        success: 'Code block copied to clipboard',
        failure: 'Failed to copy code block',
      })
    },
    [copy]
  )

  const handleListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, noteId: string) => {
      const index = filteredNotes.findIndex((note) => note.id === noteId)
      if (index < 0) return
      const nextIndex =
        event.key === 'ArrowDown'
          ? Math.min(index + 1, filteredNotes.length - 1)
          : event.key === 'ArrowUp'
            ? Math.max(index - 1, 0)
            : null
      if (nextIndex === null) return
      event.preventDefault()
      const next = filteredNotes[nextIndex]
      if (!next) return
      updateState({ selectedId: next.id })
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-notes-workspace-id="${next.id}"]`)
        ?.focus()
    },
    [filteredNotes, updateState]
  )

  useEffect(() => {
    if (!isInstanceActive) return
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return
      if (event.key.toLowerCase() === 'n' && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        void handleNew()
      } else if (event.key.toLowerCase() === 'm' && event.shiftKey && !event.altKey) {
        event.preventDefault()
        const index = MODE_OPTIONS.findIndex((option) => option.value === state.mode)
        const next = MODE_OPTIONS[(index + 1) % MODE_OPTIONS.length]
        if (next) updateState({ mode: next.value })
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [handleNew, isInstanceActive, state.mode, updateState])

  useToolAction((action) => {
    if (action.type !== 'save-file') return
    void flushPending()
      .then(() => setLastAction('Notes saved', 'success'))
      .catch(() => setLastAction('Failed to save notes', 'error'))
  })

  const handleToggleTask = useCallback(
    (noteId: string, index: number) => {
      const current = useNotesStore.getState().notes.find((note) => note.id === noteId)
      if (!current) return
      editNote(noteId, { content: toggleTaskAtIndex(current.content, index) })
    },
    [editNote]
  )

  const saveState = selected
    ? saveErrorIds.includes(selected.id)
      ? 'Save failed'
      : pendingSaveIds.includes(selected.id)
        ? 'Saving…'
        : 'Saved'
    : null

  const preview = (
    <MarkdownPreview
      ref={previewRef}
      html={html}
      source={selected?.content ?? ''}
      showToc={false}
      toc={[]}
      readOnlyTaskLists={state.mode === 'preview'}
      onCopyCodeBlock={handleCopyCode}
      {...(selected && state.mode === 'split'
        ? {
            onToggleTask: (index: number) => handleToggleTask(selected.id, index),
          }
        : {})}
    />
  )

  return (
    <>
      <MasterDetailLayout
        title="Notes"
        subtitle={`${notes.length} note${notes.length === 1 ? '' : 's'}`}
        sidebarOpen={state.libraryOpen}
        onToggleSidebar={() => updateState({ libraryOpen: !state.libraryOpen })}
        sidebarActions={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTrashOpen(true)}
              aria-label={`Open Notes Trash, ${trashEntries.length} items`}
            >
              <TrashIcon size={14} aria-hidden="true" />
              Trash{trashEntries.length > 0 ? ` (${trashEntries.length})` : ''}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleNewTask()}
              aria-label="New task"
            >
              <CheckCircleIcon size={14} aria-hidden="true" />
              Task
            </Button>
            <Button
              type="button"
              variant="icon"
              size="sm"
              onClick={() => void handleNew()}
              aria-label="New note"
              title={`New note (${formatShortcut('mod+n')})`}
            >
              <PlusIcon size={15} aria-hidden="true" />
            </Button>
          </div>
        }
        sidebar={
          <>
            <div className="border-b border-[var(--color-border)] p-2">
              <SearchInput
                value={search}
                onValueChange={setSearch}
                placeholder="Search notes"
                aria-label="Search notes"
                clearLabel="Clear notes search"
              />
            </div>
            <nav
              aria-label="Task views"
              className="border-b border-[var(--color-border)] px-2 py-2"
            >
              <div className="grid grid-cols-2 gap-1">
                {TASK_VIEWS.map((view) => (
                  <button
                    key={view.value}
                    type="button"
                    aria-pressed={state.taskView === view.value}
                    onClick={() => updateState({ taskView: view.value })}
                    className={`flex items-center justify-between rounded-[var(--radius-sm)] px-2 py-1 text-left text-2xs focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
                      state.taskView === view.value
                        ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    <span>{view.label}</span>
                    <span aria-label={`${taskCounts.get(view.value) ?? 0} items`}>
                      {taskCounts.get(view.value) ?? 0}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-pressed={state.hideCompleted}
                  onClick={() => updateState({ hideCompleted: !state.hideCompleted })}
                  className="text-2xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  {state.hideCompleted ? 'Show completed' : 'Hide completed'}
                </button>
                {completedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setTrashCompletedOpen(true)}
                    className="text-2xs text-[var(--color-error)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    Trash completed
                  </button>
                )}
              </div>
            </nav>
            <ResourceFolderTree
              folders={noteFolders}
              selectedFolderId={state.selectedFolderId}
              onSelect={(selectedFolderId) => updateState({ selectedFolderId })}
              onCreate={(parentId) => createFolder({ name: 'New folder', kind: 'notes', parentId })}
              onUpdate={updateFolder}
              onMove={moveFolder}
              onTrash={setFolderTrashCandidate}
              itemCounts={folderCounts}
              label="Note folders"
            />
            <div
              ref={listRef}
              className="min-h-0 flex-1 overflow-y-auto"
              role="listbox"
              aria-label="Notes"
            >
              {filteredNotes.map((note) => {
                const active = note.id === selected?.id
                return (
                  <div key={note.id} className="relative border-b border-[var(--color-border)]">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-notes-workspace-id={note.id}
                      onClick={() => updateState({ selectedId: note.id })}
                      onKeyDown={(event) => handleListKeyDown(event, note.id)}
                      className={`block w-full px-3 py-2.5 text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
                        note.taskStatus ? 'pr-10' : ''
                      } ${
                        active
                          ? 'bg-[var(--color-accent-dim)]'
                          : 'hover:bg-[var(--color-surface-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`min-w-0 flex-1 truncate text-xs font-semibold text-[var(--color-text)] ${
                            note.taskStatus === 'done' ? 'line-through opacity-70' : ''
                          }`}
                        >
                          {note.title || 'Untitled note'}
                        </span>
                        {note.pinned && (
                          <PushPinIcon
                            size={12}
                            weight="fill"
                            aria-label="Pinned"
                            className="shrink-0 text-[var(--color-accent)]"
                          />
                        )}
                      </div>
                      {note.taskStatus ? (
                        <p className="mt-1 truncate text-2xs text-[var(--color-text-muted)]">
                          {taskStatusLabel(note.taskStatus)}
                          {note.taskPriority ? ` · ${note.taskPriority} priority` : ''}
                          {note.taskDueDate ? ` · ${dueDateLabel(note.taskDueDate, today)}` : ''}
                        </p>
                      ) : (
                        <p className="mt-1 truncate text-2xs text-[var(--color-text-muted)]">
                          {notePreview(note.content) || 'Empty note'}
                        </p>
                      )}
                      <p className="mt-1 text-2xs text-[var(--color-text-muted)]">
                        {timeAgo(note.updatedAt)}
                      </p>
                    </button>
                    {note.taskStatus && (
                      <button
                        type="button"
                        onClick={() => void handleToggleComplete(note)}
                        aria-label={
                          note.taskStatus === 'done'
                            ? `Reopen ${note.title || 'Untitled task'}`
                            : `Complete ${note.title || 'Untitled task'}`
                        }
                        aria-pressed={note.taskStatus === 'done'}
                        className={`absolute right-2 top-2.5 rounded-[var(--radius-sm)] p-1 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
                          note.taskStatus === 'done'
                            ? 'text-[var(--color-success)]'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-success)]'
                        }`}
                      >
                        <CheckCircleIcon
                          size={17}
                          weight={note.taskStatus === 'done' ? 'fill' : 'regular'}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>
                )
              })}
              {filteredNotes.length === 0 && (
                <EmptyState
                  icon={NoteIcon}
                  size="sm"
                  title={
                    search
                      ? 'No matching notes'
                      : state.taskView === 'notes'
                        ? 'Capture your first note'
                        : 'No matching tasks'
                  }
                  description={
                    search
                      ? 'Try a different search term.'
                      : state.taskView === 'notes'
                        ? 'Create a note to begin.'
                        : 'No tasks match this view.'
                  }
                  action={
                    search || state.taskView !== 'notes' ? undefined : (
                      <Button variant="primary" size="sm" onClick={() => void handleNew()}>
                        New note
                      </Button>
                    )
                  }
                />
              )}
            </div>
          </>
        }
      >
        {selected ? (
          <section aria-label="Note editor" className="flex min-h-0 flex-1 flex-col">
            <header className="flex min-h-14 flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <div className="min-w-40 flex-1">
                <InlineInput
                  value={selected.title}
                  onChange={(event) => editNote(selected.id, { title: event.target.value })}
                  placeholder="Note title"
                  aria-label="Note title"
                  variant="title"
                  className="w-full"
                />
                <p
                  aria-live="polite"
                  className={`text-2xs ${
                    saveState === 'Save failed'
                      ? 'text-[var(--color-error)]'
                      : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {saveState}
                </p>
              </div>
              <SegmentedControl
                aria-label="Note editor mode"
                options={MODE_OPTIONS}
                value={state.mode}
                onChange={(mode) => updateState({ mode })}
              />
              <Select
                value={selected.folderId ?? 'notes-inbox'}
                onChange={(event) => void updateNote(selected.id, { folderId: event.target.value })}
                aria-label="Note folder"
                title="Move note to folder"
                className="max-w-44"
              >
                {noteFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folderPath(noteFolders, folder.id).join(' / ')}
                  </option>
                ))}
              </Select>
              {isTask(selected) ? (
                <div className="flex flex-wrap items-center gap-1" aria-label="Task metadata">
                  <Select
                    value={selected.taskStatus}
                    onChange={(event) =>
                      void updateTask(selected.id, {
                        status: event.target.value as TaskStatus,
                      })
                    }
                    aria-label="Task status"
                    className="max-w-32"
                  >
                    {TASK_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={selected.taskPriority ?? ''}
                    onChange={(event) =>
                      void updateTask(selected.id, {
                        priority: (event.target.value || null) as TaskPriority | null,
                      })
                    }
                    aria-label="Task priority"
                    className="max-w-36"
                  >
                    <option value="">No priority</option>
                    {TASK_PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="date"
                    value={selected.taskDueDate ?? ''}
                    onChange={(event) =>
                      void updateTask(selected.id, { dueDate: event.target.value || null })
                    }
                    aria-label="Task due date"
                    className="w-36"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoveTaskCandidate(selected)}
                  >
                    Convert to note
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void updateTask(selected.id, { status: 'todo' })}
                >
                  <CheckCircleIcon size={14} aria-hidden="true" />
                  Make task
                </Button>
              )}
              <Button
                variant="icon"
                size="sm"
                onClick={() => void updateNote(selected.id, { pinned: !selected.pinned })}
                aria-label={selected.pinned ? 'Unpin note' : 'Pin note'}
                aria-pressed={selected.pinned}
                className={selected.pinned ? 'text-[var(--color-accent)]' : undefined}
              >
                <PushPinIcon
                  size={15}
                  weight={selected.pinned ? 'fill' : 'regular'}
                  aria-hidden="true"
                />
              </Button>
              <Button
                variant="icon"
                size="sm"
                onClick={() =>
                  void copy(selected.content, {
                    success: 'Note copied to clipboard',
                    failure: 'Failed to copy note',
                  })
                }
                aria-label="Copy note"
              >
                <CopyIcon size={15} aria-hidden="true" />
              </Button>
              <Button
                variant="icon"
                size="sm"
                onClick={() => setDeleteCandidate(selected)}
                aria-label="Move note to Trash"
                className="hover:text-[var(--color-error)]"
              >
                <TrashIcon size={15} aria-hidden="true" />
              </Button>
            </header>

            <SplitPane
              storageKey="notes-workspace"
              stackBelow={900}
              firstVisible={state.mode !== 'preview'}
              secondVisible={state.mode !== 'edit'}
              aria-label="Resize note editor and preview"
            >
              <div className="min-h-0 flex-1 overflow-hidden">
                <Editor
                  theme={monacoTheme}
                  language="markdown"
                  value={selected.content}
                  onMount={editorMount}
                  onChange={(value) => editNote(selected.id, { content: value ?? '' })}
                  options={{
                    ...monacoOptions,
                    minimap: { enabled: false },
                    padding: { top: 14, bottom: 14 },
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
              {preview}
            </SplitPane>
          </section>
        ) : (
          <EmptyState
            icon={NoteIcon}
            title="Write your first note"
            description="Create a Markdown note to open the editor and preview workspace."
            className="h-full"
            action={
              <Button variant="primary" onClick={() => void handleNew()}>
                <PlusIcon size={14} aria-hidden="true" className="mr-1.5" />
                New note
              </Button>
            }
          />
        )}
      </MasterDetailLayout>

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
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{deleteCandidate.title || 'Untitled note'}” can be restored until Trash is emptied.
          </p>
        </Dialog>
      )}
      {folderTrashCandidate && (
        <Dialog
          title="Move folder to Trash?"
          onClose={() => setFolderTrashCandidate(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setFolderTrashCandidate(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleTrashFolder()}>
                Move folder to Trash
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{folderTrashCandidate.name}” and everything nested inside it will move to Trash
            together.
          </p>
        </Dialog>
      )}
      {removeTaskCandidate && (
        <Dialog
          title="Convert task to note?"
          onClose={() => setRemoveTaskCandidate(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRemoveTaskCandidate(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleRemoveTaskMetadata()}>
                Remove task metadata
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            Status, priority, and due date will be removed from “
            {removeTaskCandidate.title || 'Untitled task'}”. Its title, body, folder, and tags will
            stay unchanged.
          </p>
        </Dialog>
      )}
      {trashCompletedOpen && (
        <Dialog
          title="Move completed tasks to Trash?"
          onClose={() => setTrashCompletedOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTrashCompletedOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleTrashCompleted()}>
                Move {completedCount} to Trash
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            {completedCount} completed task{completedCount === 1 ? '' : 's'} will move to durable
            Trash and can be restored later.
          </p>
        </Dialog>
      )}
      {trashOpen && (
        <TrashDialog
          title="Notes Trash"
          entries={trashEntries}
          onClose={() => setTrashOpen(false)}
          onRestore={handleRestoreTrashEntry}
          onDeletePermanently={handleDeleteTrashEntry}
          onEmpty={handleEmptyTrash}
        />
      )}
    </>
  )
}
