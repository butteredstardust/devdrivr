import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { OnMount } from '@monaco-editor/react'
import Fuse from 'fuse.js'
import { CopyIcon, NoteIcon, PlusIcon, PushPinIcon, TrashIcon } from '@phosphor-icons/react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { InlineInput } from '@/components/shared/InlineInput'
import { Select } from '@/components/shared/Input'
import { MasterDetailLayout } from '@/components/shared/MasterDetailLayout'
import { ResourceFolderTree } from '@/components/shared/ResourceFolderTree'
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
import type { Note } from '@/types/models'
import { formatShortcut } from '@/lib/shortcut-label'
import { descendantFolderIds, folderPath, foldersForKind } from '@/lib/resource-folders'

type NotesWorkspaceState = {
  selectedId: string | null
  mode: EditorMode
  libraryOpen: boolean
  selectedFolderId: string | null
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

export default function NotesWorkspace() {
  const isInstanceActive = useIsInstanceActive()
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const notes = useNotesStore((state) => state.notes)
  const pendingSaveIds = useNotesStore((state) => state.pendingSaveIds)
  const saveErrorIds = useNotesStore((state) => state.saveErrorIds)
  const addNote = useNotesStore((state) => state.add)
  const editNote = useNotesStore((state) => state.edit)
  const updateNote = useNotesStore((state) => state.update)
  const flushPending = useNotesStore((state) => state.flushPending)
  const removeNote = useNotesStore((state) => state.remove)
  const folders = useFoldersStore((state) => state.folders)
  const createFolder = useFoldersStore((state) => state.create)
  const updateFolder = useFoldersStore((state) => state.update)
  const moveFolder = useFoldersStore((state) => state.move)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const copy = useCopyToClipboard()
  const [state, updateState] = useToolState<NotesWorkspaceState>('notes', {
    selectedId: null,
    mode: 'split',
    libraryOpen: true,
    selectedFolderId: null,
  })
  const [search, setSearch] = useState('')
  const [html, setHtml] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<Note | null>(null)
  const [mountedEditor, setMountedEditor] = useState<EditorInstance | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const previousSelectedIdRef = useRef<string | null>(null)

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
  const selectedFolderIds = useMemo(
    () =>
      state.selectedFolderId ? descendantFolderIds(noteFolders, state.selectedFolderId) : null,
    [noteFolders, state.selectedFolderId]
  )
  const filteredNotes = useMemo(() => {
    const candidates = search.trim()
      ? fuse.search(search.trim()).map((result) => result.item)
      : notes
    return selectedFolderIds
      ? candidates.filter((note) => note.folderId && selectedFolderIds.has(note.folderId))
      : candidates
  }, [fuse, notes, search, selectedFolderIds])
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
    if (notes.length === 0) {
      if (state.selectedId !== null) updateState({ selectedId: null })
      return
    }
    if (!state.selectedId || !notes.some((note) => note.id === state.selectedId)) {
      updateState({ selectedId: filteredNotes[0]?.id ?? notes[0]?.id ?? null })
    }
  }, [filteredNotes, notes, state.selectedId, updateState])

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
            <ResourceFolderTree
              folders={noteFolders}
              selectedFolderId={state.selectedFolderId}
              onSelect={(selectedFolderId) => updateState({ selectedFolderId })}
              onCreate={(parentId) => createFolder({ name: 'New folder', kind: 'notes', parentId })}
              onUpdate={updateFolder}
              onMove={moveFolder}
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
                  <button
                    key={note.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-notes-workspace-id={note.id}
                    onClick={() => updateState({ selectedId: note.id })}
                    onKeyDown={(event) => handleListKeyDown(event, note.id)}
                    className={`block w-full border-b border-[var(--color-border)] px-3 py-2.5 text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
                      active
                        ? 'bg-[var(--color-accent-dim)]'
                        : 'hover:bg-[var(--color-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--color-text)]">
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
                    <p className="mt-1 truncate text-2xs text-[var(--color-text-muted)]">
                      {notePreview(note.content) || 'Empty note'}
                    </p>
                    <p className="mt-1 text-2xs text-[var(--color-text-muted)]">
                      {timeAgo(note.updatedAt)}
                    </p>
                  </button>
                )
              })}
              {filteredNotes.length === 0 && (
                <EmptyState
                  icon={NoteIcon}
                  size="sm"
                  title={search ? 'No matching notes' : 'Capture your first note'}
                  description={search ? 'Try a different search term.' : 'Create a note to begin.'}
                  action={
                    search ? undefined : (
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
                aria-label="Delete note"
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
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{deleteCandidate.title || 'Untitled note'}” will be permanently removed.
          </p>
        </Dialog>
      )}
    </>
  )
}
