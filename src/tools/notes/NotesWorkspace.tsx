import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { MasterDetailLayout } from '@/components/shared/MasterDetailLayout'
import { useIsInstanceActive } from '@/app/tool-instance'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useMonaco } from '@/hooks/useMonaco'
import { useScrollSync } from '@/tools/markdown-editor/hooks/useScrollSync'
import { useTabDirty } from '@/hooks/useTabDirty'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolState } from '@/hooks/useToolState'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useApiStore } from '@/stores/api.store'
import { useUiStore } from '@/stores/ui.store'
import { MarkdownPreview } from '@/tools/markdown-editor/MarkdownPreview'
import {
  MODE_OPTIONS,
  renderMarkdownContent,
  type EditorInstance,
} from '@/tools/markdown-editor/markdown-model'
import { toggleTaskAtIndex } from '@/tools/markdown-editor/task-list'
import { resolveNoteAssetMarkdown } from '@/lib/note-assets'
import { useNotesBackup } from '@/hooks/useNotesBackup'
import { sendToTool } from '@/lib/tool-handoff'
import {
  backlinksForResource,
  buildWikiResources,
  findWikiTrigger,
  renderWikiLinks,
  wikiToken,
  type WikiResource,
  type WikiResourceRef,
  type WikiTrigger,
} from '@/lib/wiki-links'
import { useNoteImageAttachments } from '@/tools/notes/useNoteImageAttachments'
import { localDateKey } from '@/tools/notes/task-model'
import {
  DEFAULT_NOTES_WORKSPACE_STATE,
  type NotesWorkspaceState,
} from '@/tools/notes/notes-workspace-model'
import { useNotesLibrary } from '@/tools/notes/hooks/useNotesLibrary'
import { useNotesTrash } from '@/tools/notes/hooks/useNotesTrash'
import { useNoteAssetCleanup } from '@/tools/notes/hooks/useNoteAssetCleanup'
import { NotesSidebar, NotesSidebarActions } from '@/tools/notes/components/NotesSidebar'
import { NotesEditorWorkspace } from '@/tools/notes/components/NotesEditorWorkspace'
import { NotesDialogs } from '@/tools/notes/components/NotesDialogs'

export default function NotesWorkspace() {
  const isInstanceActive = useIsInstanceActive()
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const noteEditorOptions = useMemo(
    () => ({
      ...monacoOptions,
      minimap: { enabled: false },
      padding: { top: 14, bottom: 14 },
      scrollBeyondLastLine: false,
    }),
    [monacoOptions]
  )
  const pendingSaveIds = useNotesStore((state) => state.pendingSaveIds)
  const saveErrorIds = useNotesStore((state) => state.saveErrorIds)
  const editNote = useNotesStore((state) => state.edit)
  const updateNote = useNotesStore((state) => state.update)
  const updateTask = useNotesStore((state) => state.updateTask)
  const flushPending = useNotesStore((state) => state.flushPending)
  const snippets = useSnippetsStore((state) => state.snippets)
  const apiRequests = useApiStore((state) => state.requests)
  const apiCollections = useApiStore((state) => state.collections)
  const apiInitialized = useApiStore((state) => state.initialized)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const copy = useCopyToClipboard()
  const [state, updateState] = useToolState<NotesWorkspaceState>(
    'notes',
    DEFAULT_NOTES_WORKSPACE_STATE
  )
  const [html, setHtml] = useState('')
  const [today, setToday] = useState(() => localDateKey())
  const [wikiTrigger, setWikiTrigger] = useState<WikiTrigger | null>(null)
  const [mountedEditor, setMountedEditor] = useState<EditorInstance | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const previousSelectedIdRef = useRef<string | null>(null)
  const editorCursorCleanupRef = useRef<(() => void) | null>(null)
  const { isDraggingImage, onPasteCapture } = useNoteImageAttachments(
    mountedEditor,
    editorContainerRef,
    {
      onSuccess: (count) =>
        setLastAction(`${count} image${count === 1 ? '' : 's'} attached`, 'success'),
      onError: (message) => setLastAction(`Failed to attach image: ${message}`, 'error'),
    },
    isInstanceActive && state.mode !== 'preview' && state.selectedId !== null,
    state.selectedId
  )

  useEffect(() => {
    const now = new Date()
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timer = window.setTimeout(
      () => setToday(localDateKey()),
      nextMidnight.getTime() - now.getTime() + 50
    )
    return () => window.clearTimeout(timer)
  }, [today])

  useEffect(() => {
    if (apiInitialized) return
    void useApiStore
      .getState()
      .init()
      .catch(() => {
        // The API Client reports its own initialization failures when opened. Notes
        // remains usable with note and snippet link targets in the meantime.
      })
  }, [apiInitialized])

  const library = useNotesLibrary({ state, updateState, today })
  const {
    notes,
    folders,
    search,
    setSearch,
    listRef,
    noteFolders,
    filteredNotes,
    taskCounts,
    completedCount,
    folderCounts,
    createFolder,
    updateFolder,
    moveFolder,
    handleNew,
    handleNewTask,
    handleToggleComplete,
    handleListKeyDown,
  } = library
  const selected = useMemo(
    () => notes.find((note) => note.id === state.selectedId) ?? null,
    [notes, state.selectedId]
  )
  const selectedId = selected?.id ?? null
  const wikiResources = useMemo(
    () => buildWikiResources(notes, snippets, apiRequests, folders, apiCollections),
    [apiCollections, apiRequests, folders, notes, snippets]
  )
  const backlinks = useMemo(
    () => (selected ? backlinksForResource(notes, { kind: 'note', id: selected.id }) : []),
    [notes, selected]
  )

  const editorMount: OnMount = useCallback((editor) => {
    editorCursorCleanupRef.current?.()
    setMountedEditor(editor)
    const disposable = editor.onDidChangeCursorPosition(() => {
      const model = editor.getModel()
      const position = editor.getPosition()
      if (!model || !position) return
      setWikiTrigger(findWikiTrigger(model.getValue(), model.getOffsetAt(position)))
    })
    editorCursorCleanupRef.current = () => disposable.dispose()
  }, [])
  useScrollSync(mountedEditor, previewRef, state.mode === 'split', state.mode === 'split')

  useEffect(
    () => () => {
      editorCursorCleanupRef.current?.()
      editorCursorCleanupRef.current = null
    },
    []
  )

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

  useEffect(() => setWikiTrigger(null), [selectedId])

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
      const linkedMarkdown = renderWikiLinks(selected?.content ?? '', wikiResources)
      void resolveNoteAssetMarkdown(linkedMarkdown)
        .then(renderMarkdownContent)
        .then((rendered) => {
          if (!cancelled) setHtml(rendered)
        })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [selected?.content, wikiResources])

  const { exportBackup: handleExportBackup, importBackup: handleImportBackup } =
    useNotesBackup(setLastAction)
  const assetCleanup = useNoteAssetCleanup()
  const trash = useNotesTrash({ updateState })

  const handleCopyCode = useCallback(
    (code: string) => {
      void copy(code, {
        success: 'Code block copied to clipboard',
        failure: 'Failed to copy code block',
      })
    },
    [copy]
  )

  const handleWikiSelect = useCallback(
    (resource: WikiResource) => {
      if (!selected || !wikiTrigger) return
      const token = wikiToken(resource)
      const content = `${selected.content.slice(0, wikiTrigger.start)}${token}${selected.content.slice(wikiTrigger.end)}`
      const nextOffset = wikiTrigger.start + token.length
      editNote(selected.id, { content })
      setWikiTrigger(null)
      window.setTimeout(() => {
        const model = mountedEditor?.getModel()
        if (!model) return
        mountedEditor?.focus()
        mountedEditor?.setPosition(model.getPositionAt(nextOffset))
      }, 0)
    },
    [editNote, mountedEditor, selected, wikiTrigger]
  )

  const handleOpenInternalLink = useCallback(
    (target: WikiResourceRef) => {
      if (target.kind === 'note') {
        updateState({ selectedId: target.id, selectedFolderId: null, taskView: 'notes' })
        return
      }
      const backlinkNoteId = selected?.id ?? null
      if (target.kind === 'snippet') {
        sendToTool('snippets', { wikiTargetId: target.id, backlinkNoteId })
      } else {
        sendToTool('api-client', {
          wikiTargetId: target.id,
          backlinkNoteId,
        })
      }
    },
    [selected?.id, updateState]
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
      onInternalLink={handleOpenInternalLink}
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
        widthStorageKey="notes"
        subtitle={`${notes.length} note${notes.length === 1 ? '' : 's'}`}
        sidebarOpen={state.libraryOpen}
        onToggleSidebar={() => updateState({ libraryOpen: !state.libraryOpen })}
        sidebarActions={
          <NotesSidebarActions
            trashEntryCount={trash.trashEntries.length}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onFindOrphans={assetCleanup.handleFindOrphans}
            onOpenTrash={() => trash.setTrashOpen(true)}
            onNewTask={handleNewTask}
            onNew={handleNew}
          />
        }
        sidebar={
          <NotesSidebar
            state={state}
            updateState={updateState}
            search={search}
            setSearch={setSearch}
            taskCounts={taskCounts}
            completedCount={completedCount}
            noteFolders={noteFolders}
            folderCounts={folderCounts}
            filteredNotes={filteredNotes}
            selected={selected}
            today={today}
            listRef={listRef}
            onCreateFolder={(parentId) =>
              createFolder({ name: 'New folder', kind: 'notes', parentId })
            }
            onUpdateFolder={updateFolder}
            onMoveFolder={moveFolder}
            onTrashFolder={trash.setFolderTrashCandidate}
            onTrashCompleted={() => trash.setTrashCompletedOpen(true)}
            onToggleComplete={handleToggleComplete}
            onListKeyDown={handleListKeyDown}
            onNew={handleNew}
          />
        }
      >
        <NotesEditorWorkspace
          selected={selected}
          state={state}
          updateState={updateState}
          saveState={saveState}
          noteFolders={noteFolders}
          monacoTheme={monacoTheme}
          noteEditorOptions={noteEditorOptions}
          editorMount={editorMount}
          editorContainerRef={editorContainerRef}
          onPasteCapture={onPasteCapture}
          wikiTrigger={wikiTrigger}
          setWikiTrigger={setWikiTrigger}
          wikiResources={wikiResources}
          onWikiSelect={handleWikiSelect}
          isDraggingImage={isDraggingImage}
          preview={preview}
          backlinks={backlinks}
          editNote={editNote}
          updateNote={updateNote}
          updateTask={updateTask}
          copy={copy}
          onRemoveTask={trash.setRemoveTaskCandidate}
          onDelete={trash.setDeleteCandidate}
          onNew={handleNew}
        />
      </MasterDetailLayout>

      <NotesDialogs
        deleteCandidate={trash.deleteCandidate}
        setDeleteCandidate={trash.setDeleteCandidate}
        folderTrashCandidate={trash.folderTrashCandidate}
        setFolderTrashCandidate={trash.setFolderTrashCandidate}
        removeTaskCandidate={trash.removeTaskCandidate}
        setRemoveTaskCandidate={trash.setRemoveTaskCandidate}
        trashCompletedOpen={trash.trashCompletedOpen}
        setTrashCompletedOpen={trash.setTrashCompletedOpen}
        completedCount={completedCount}
        orphanAssets={assetCleanup.orphanAssets}
        setOrphanAssets={assetCleanup.setOrphanAssets}
        trashOpen={trash.trashOpen}
        setTrashOpen={trash.setTrashOpen}
        trashEntries={trash.trashEntries}
        onDelete={trash.handleDelete}
        onTrashFolder={trash.handleTrashFolder}
        onRemoveTaskMetadata={trash.handleRemoveTaskMetadata}
        onTrashCompleted={trash.handleTrashCompleted}
        onDeleteOrphans={assetCleanup.handleDeleteOrphans}
        onRestoreTrashEntry={trash.handleRestoreTrashEntry}
        onDeleteTrashEntry={trash.handleDeleteTrashEntry}
        onEmptyTrash={trash.handleEmptyTrash}
      />
    </>
  )
}
