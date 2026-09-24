import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import {
  DownloadSimpleIcon,
  PlusIcon,
  ScissorsIcon,
  TrashIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Alert } from '@/components/shared/Alert'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { MasterDetailLayout } from '@/components/shared/MasterDetailLayout'
import { ResourceFolderTree } from '@/components/shared/ResourceFolderTree'
import { TrashDialog } from '@/components/shared/TrashDialog'
import { useMonaco } from '@/hooks/useMonaco'
import { useIsInstanceActive } from '@/app/tool-instance'
import { buildExportFilename, exportFile } from '@/lib/file-io'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useFoldersStore } from '@/stores/folders.store'
import { useUiStore } from '@/stores/ui.store'
import type { Snippet } from '@/types/models'
import { useSnippetsBackup } from '@/hooks/useSnippetsBackup'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { sendToTool } from '@/lib/tool-handoff'
import { useToolState } from '@/hooks/useToolState'
import { foldersForKind } from '@/lib/resource-folders'
import { buildWebPreviewDocument, previewKindFor } from '@/tools/snippets/snippet-preview'
import { SnippetWebPreview } from '@/tools/snippets/SnippetWebPreview'
import {
  FAVORITE_TAG,
  isFavorite,
  LANG_EXTENSIONS,
  LANGUAGES,
  validateSnippetsToolState,
  visibleTags,
  type SnippetsToolState,
} from '@/tools/snippets/snippet-model'
import { useSnippetFilters } from '@/tools/snippets/hooks/useSnippetFilters'
import { useSnippetFormatting } from '@/tools/snippets/hooks/useSnippetFormatting'
import { useSnippetFragments } from '@/tools/snippets/hooks/useSnippetFragments'
import { useSnippetsTrash } from '@/tools/snippets/hooks/useSnippetsTrash'
import { useSnippetTags } from '@/tools/snippets/hooks/useSnippetTags'
import { SnippetDetailsPanel } from '@/tools/snippets/components/SnippetDetailsPanel'
import { SnippetFilterBar } from '@/tools/snippets/components/SnippetFilterBar'
import { SnippetFragmentBar } from '@/tools/snippets/components/SnippetFragmentBar'
import { SnippetList } from '@/tools/snippets/components/SnippetList'
import { SnippetToolbar } from '@/tools/snippets/components/SnippetToolbar'

export default function SnippetsManager() {
  const fragmentEditorId = useId()
  const isInstanceActive = useIsInstanceActive()
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const snippetEditorOptions = useMemo(
    () => ({
      ...monacoOptions,
      minimap: { enabled: false },
      lineNumbers: 'on' as const,
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
    }),
    [monacoOptions]
  )
  const snippets = useSnippetsStore((state) => state.snippets)
  const [handoffState, updateHandoffState] = useToolState<SnippetsToolState>(
    'snippets',
    {
      handoff: null,
      wikiTargetId: null,
      backlinkNoteId: null,
      activeFragmentIds: {},
    },
    { validate: validateSnippetsToolState }
  )
  const activeFolder = useSnippetsStore((state) => state.activeFolder)
  const setActiveFolder = useSnippetsStore((state) => state.setActiveFolder)
  const addSnippet = useSnippetsStore((state) => state.add)
  const updateSnippet = useSnippetsStore((state) => state.update)
  const flushPendingSnippet = useSnippetsStore((state) => state.flushPending)
  const removeSnippet = useSnippetsStore((state) => state.remove)
  const restoreSnippet = useSnippetsStore((state) => state.restore)
  const folders = useFoldersStore((state) => state.folders)
  const createFolder = useFoldersStore((state) => state.create)
  const updateFolder = useFoldersStore((state) => state.update)
  const moveFolder = useFoldersStore((state) => state.move)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const { exportBackup: handleExportAll, importBackup } = useSnippetsBackup(setLastAction)
  const copy = useCopyToClipboard()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [titleFocusRequest, setTitleFocusRequest] = useState(0)
  const [recentlyDeleted, setRecentlyDeleted] = useState<Snippet | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const handleImport = useCallback(async () => {
    const importedId = await importBackup()
    if (importedId) setSelectedId(importedId)
  }, [importBackup])

  const titleInputRef = useRef<HTMLInputElement>(null)
  const cancelDeleteRef = useRef<HTMLButtonElement>(null)
  const handledTitleFocusRequestRef = useRef(0)
  const previousSelectedIdRef = useRef<string | null>(null)
  const linkedSnippetIdRef = useRef<string | null>(null)
  const deleteUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handoffInFlightRef = useRef<string | null>(null)

  useEffect(() => {
    const handoff = handoffState.handoff
    if (!handoff) return
    const handoffKey = `${handoff.title}\u0000${handoff.language}\u0000${handoff.content}`
    if (handoffInFlightRef.current === handoffKey) return
    handoffInFlightRef.current = handoffKey
    // Consume before awaiting so React Strict Mode cannot replay the effect
    // into a duplicate persisted snippet.
    updateHandoffState({ handoff: null })
    void addSnippet(handoff.title, handoff.content, handoff.language)
      .then((snippet) => {
        setSelectedId(snippet.id)
        setLastAction(`Added ${handoff.title} from another tool`, 'success')
      })
      .catch(() => {
        setLastAction('Could not add handed-off snippet', 'error')
      })
      .finally(() => {
        if (handoffInFlightRef.current === handoffKey) handoffInFlightRef.current = null
      })
  }, [addSnippet, handoffState.handoff, setLastAction, updateHandoffState])

  useEffect(() => {
    const previousId = previousSelectedIdRef.current
    if (previousId && previousId !== selectedId) void flushPendingSnippet(previousId)
    previousSelectedIdRef.current = selectedId
  }, [flushPendingSnippet, selectedId])

  useEffect(
    () => () => {
      void flushPendingSnippet()
      if (deleteUndoTimerRef.current) clearTimeout(deleteUndoTimerRef.current)
    },
    [flushPendingSnippet]
  )

  const setTitleInputRef = useCallback((element: HTMLInputElement | null) => {
    titleInputRef.current = element
  }, [])

  const snippetFolders = useMemo(() => foldersForKind(folders, 'snippets'), [folders])
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const snippet of snippets) {
      if (snippet.folderId) {
        counts.set(snippet.folderId, (counts.get(snippet.folderId) ?? 0) + 1)
      }
    }
    return counts
  }, [snippets])

  const filters = useSnippetFilters({ snippets, snippetFolders, activeFolder, setActiveFolder })
  const { filtered, allTags, clearFilters, searchInputRef } = filters
  const trash = useSnippetsTrash()

  const selected = useMemo(
    () => snippets.find((snippet) => snippet.id === selectedId) ?? null,
    [selectedId, snippets]
  )

  const {
    fragments,
    activeFragment,
    fragmentDeleteCandidate,
    setFragmentDeleteCandidate,
    selectFragment,
    updateActiveFragment,
    handleAddFragment,
    handleDuplicateFragment,
    handleMoveFragment,
    handleDeleteFragment,
  } = useSnippetFragments({
    selected,
    activeFragmentIds: handoffState.activeFragmentIds,
    updateToolState: updateHandoffState,
  })
  const {
    formatError,
    setFormatError,
    formatting,
    canFormat,
    formatDisabledReason,
    handleEditorMount,
    handleFormat,
  } = useSnippetFormatting({ selected, activeFragment, monacoOptions })
  const tags = useSnippetTags(selected, allTags)
  const { setTagInput, setSuggestionIndex } = tags

  const previewKind = useMemo(
    () => previewKindFor(activeFragment, fragments),
    [activeFragment, fragments]
  )
  const previewDocument = useMemo(
    () =>
      previewOpen && previewKind === 'web' && activeFragment
        ? buildWebPreviewDocument(fragments, activeFragment.id)
        : null,
    [activeFragment, fragments, previewKind, previewOpen]
  )

  useEffect(() => {
    if (!handoffState.wikiTargetId) return
    if (!snippets.some((snippet) => snippet.id === handoffState.wikiTargetId)) return
    linkedSnippetIdRef.current = handoffState.wikiTargetId
    setSelectedId(handoffState.wikiTargetId)
    updateHandoffState({ wikiTargetId: null })
  }, [handoffState.wikiTargetId, snippets, updateHandoffState])

  useEffect(() => {
    if (
      handoffState.backlinkNoteId &&
      !handoffState.wikiTargetId &&
      linkedSnippetIdRef.current &&
      selectedId !== linkedSnippetIdRef.current
    ) {
      linkedSnippetIdRef.current = null
      updateHandoffState({ backlinkNoteId: null })
    }
  }, [handoffState.backlinkNoteId, handoffState.wikiTargetId, selectedId, updateHandoffState])

  useEffect(() => {
    if (snippets.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (!selectedId || !snippets.some((snippet) => snippet.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? snippets[0]?.id ?? null)
    }
  }, [filtered, selectedId, snippets])

  useEffect(() => {
    setTagInput('')
    setSuggestionIndex(-1)
    setDeleteDialogOpen(false)
    setFragmentDeleteCandidate(null)
    const current = useSnippetsStore
      .getState()
      .snippets.find((snippet) => snippet.id === selectedId)
    setDescriptionOpen(Boolean(current?.description))
    setFormatError(null)
    setPreviewOpen(false)
  }, [selectedId, setFormatError, setFragmentDeleteCandidate, setSuggestionIndex, setTagInput])

  useEffect(() => {
    if (!previewKind) setPreviewOpen(false)
  }, [previewKind])

  useEffect(() => {
    if (
      !selected ||
      titleFocusRequest === 0 ||
      titleFocusRequest === handledTitleFocusRequestRef.current
    ) {
      return
    }
    handledTitleFocusRequestRef.current = titleFocusRequest
    requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    })
  }, [selected, titleFocusRequest])

  const handleNew = useCallback(async () => {
    try {
      const folder = snippetFolders.find((candidate) => candidate.id === activeFolder)
      const snippet = await addSnippet(
        'Untitled snippet',
        '',
        folder?.defaultLanguage ?? 'javascript',
        [],
        folder?.name ?? '',
        false,
        folder?.id ?? 'snippets-inbox'
      )
      setSelectedId(snippet.id)
      setTitleFocusRequest((request) => request + 1)
      setLastAction('Snippet created', 'success')
    } catch {
      setLastAction('Failed to create snippet', 'error')
    }
  }, [activeFolder, addSnippet, setLastAction, snippetFolders])

  const handleDuplicate = useCallback(async () => {
    if (!selected) return
    try {
      const duplicate = await addSnippet(
        `${selected.title || 'Untitled'} copy`,
        selected.content,
        selected.language,
        visibleTags(selected.tags),
        selected.folder,
        // Without this the copy defaults to unfavorited and vanishes under the Favorites filter.
        !!selected.favorite,
        selected.folderId,
        selected.description ?? '',
        fragments
      )
      setSelectedId(duplicate.id)
      setTitleFocusRequest((request) => request + 1)
      setLastAction('Snippet duplicated', 'success')
    } catch {
      setLastAction('Duplicate failed', 'error')
    }
  }, [addSnippet, fragments, selected, setLastAction])

  const handleDelete = useCallback(async () => {
    if (!selected) return
    const currentIndex = filtered.findIndex((snippet) => snippet.id === selected.id)
    const nextSelection = filtered[currentIndex + 1] ?? filtered[currentIndex - 1] ?? null
    try {
      await removeSnippet(selected.id)
      setRecentlyDeleted(selected)
      if (deleteUndoTimerRef.current) clearTimeout(deleteUndoTimerRef.current)
      deleteUndoTimerRef.current = setTimeout(() => setRecentlyDeleted(null), 8_000)
      setSelectedId(nextSelection?.id ?? null)
      setDeleteDialogOpen(false)
      setLastAction('Snippet moved to Trash', 'info')
    } catch {
      setLastAction('Failed to move snippet to Trash', 'error')
    }
  }, [filtered, removeSnippet, selected, setLastAction])

  const handleUndoDelete = useCallback(async () => {
    if (!recentlyDeleted) return
    try {
      await restoreSnippet(recentlyDeleted.id)
      setSelectedId(recentlyDeleted.id)
      setRecentlyDeleted(null)
      if (deleteUndoTimerRef.current) clearTimeout(deleteUndoTimerRef.current)
      setLastAction('Snippet restored', 'success')
    } catch {
      setLastAction('Restore failed', 'error')
    }
  }, [recentlyDeleted, restoreSnippet, setLastAction])

  const handleToggleFavorite = useCallback(async () => {
    if (!selected) return
    const wasFavorite = isFavorite(selected.tags, selected.favorite)
    const tags = selected.tags.filter((tag) => tag !== FAVORITE_TAG)
    try {
      await updateSnippet(selected.id, { tags, favorite: !wasFavorite })
    } catch {
      setLastAction('Failed to update favorite', 'error')
    }
  }, [selected, setLastAction, updateSnippet])

  const handleDownload = useCallback(async () => {
    if (!selected || !activeFragment) return
    const extension = LANG_EXTENSIONS[activeFragment.language] ?? 'txt'
    const baseName =
      fragments.length > 1 ? `${selected.title}-${activeFragment.name}` : selected.title
    const filename = buildExportFilename(baseName || 'snippet', extension)
    try {
      const path = await exportFile(activeFragment.content, filename)
      if (path) setLastAction(`Downloaded ${filename}`, 'success')
    } catch {
      setLastAction('Download failed', 'error')
    }
  }, [activeFragment, fragments.length, selected, setLastAction])

  const handleCopy = useCallback(async () => {
    if (!activeFragment) return
    await copy(activeFragment.content)
  }, [activeFragment, copy])

  const handleSendToPromptTemplate = useCallback(() => {
    if (!selected || !activeFragment) return
    sendToTool('prompt-templates', {
      handoffContent: activeFragment.content,
      handoffLanguage: activeFragment.language,
    })
    setLastAction('Snippet sent to Prompt Templates', 'success')
  }, [activeFragment, selected, setLastAction])

  const handlePreview = useCallback(() => {
    if (!activeFragment || !previewKind) return
    setFormatError(null)
    if (previewKind === 'json') {
      try {
        JSON.parse(activeFragment.content)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setFormatError(`JSON preview unavailable: ${message}`)
        setLastAction('Invalid JSON cannot be previewed', 'error')
        return
      }
      sendToTool(
        'json-tools',
        { input: activeFragment.content, view: 'tree' },
        { documentKeys: ['input'] }
      )
      setLastAction('Fragment opened in JSON Tools', 'success')
      return
    }
    setPreviewOpen(true)
    setLastAction('HTML/CSS preview opened', 'success')
  }, [activeFragment, previewKind, setFormatError, setLastAction])

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (!isInstanceActive) return
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void handleNew()
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        void handleFormat()
      } else if (modifier && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
      if (modifier && event.shiftKey && event.key === 'Enter') {
        event.preventDefault()
        handlePreview()
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        void handleDuplicate()
      }
      if (event.key === 'F5') {
        event.preventDefault()
        void handleNew()
      }
      if (event.key === 'F6') {
        event.preventDefault()
        void handleDuplicate()
      }
      if (event.key === 'F8' && selected) {
        event.preventDefault()
        setDeleteDialogOpen(true)
      }
      if (event.key === 'F9') {
        event.preventDefault()
        void handleExportAll()
      }
      if (event.key === 'F10') {
        event.preventDefault()
        void handleImport()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [
    handleDuplicate,
    handleExportAll,
    handleFormat,
    handleImport,
    handleNew,
    handlePreview,
    isInstanceActive,
    searchInputRef,
    selected,
  ])

  return (
    <>
      <MasterDetailLayout
        title="Snippets"
        widthStorageKey="snippets"
        subtitle={`${snippets.length} saved locally`}
        sidebarActions={
          // Secondary for the same reason as prompt-templates: the sidebar heading never carries
          // the accent. Snippets saves as you type, so when one is selected the tool has no
          // primary at all — correct for a live-editing tool. The empty state's CTA covers the
          // one moment there's nothing to edit.
          <div className="flex items-center gap-1">
            {recentlyDeleted && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleUndoDelete()}
              >
                Undo delete
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => trash.setTrashOpen(true)}
              aria-label={`Open Snippets Trash, ${trash.trashEntries.length} item${
                trash.trashEntries.length === 1 ? '' : 's'
              }`}
            >
              <TrashIcon size={12} aria-hidden="true" />
              Trash{trash.trashEntries.length > 0 ? ` (${trash.trashEntries.length})` : ''}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleNew()}
              className="gap-1.5"
            >
              <PlusIcon size={12} aria-hidden="true" />
              New
            </Button>
          </div>
        }
        sidebar={
          <>
            <SnippetFilterBar filters={filters} />
            <ResourceFolderTree
              folders={snippetFolders}
              selectedFolderId={activeFolder || null}
              onSelect={(folderId) => setActiveFolder(folderId ?? '')}
              onCreate={(parentId) =>
                createFolder({ name: 'New folder', kind: 'snippets', parentId })
              }
              onUpdate={updateFolder}
              onMove={moveFolder}
              onTrash={trash.setFolderTrashCandidate}
              itemCounts={folderCounts}
              languageOptions={LANGUAGES}
              label="Snippet folders"
            />

            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5 text-2xs text-[var(--color-text-muted)]">
              <span>
                {filtered.length === snippets.length ? 'Library' : `${filtered.length} results`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="icon"
                  size="xs"
                  onClick={() => void handleImport()}
                  title="Import snippets from JSON"
                  aria-label="Import snippets from JSON"
                >
                  <UploadSimpleIcon size={12} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="icon"
                  size="xs"
                  onClick={() => void handleExportAll()}
                  title="Export snippets as JSON"
                  aria-label="Export snippets as JSON"
                  disabled={snippets.length === 0}
                >
                  <DownloadSimpleIcon size={12} aria-hidden="true" />
                </Button>
              </div>
            </div>

            <SnippetList
              filtered={filtered}
              totalCount={snippets.length}
              selectedId={selectedId}
              matchMap={filters.matchMap}
              onSelect={setSelectedId}
              onClearFilters={clearFilters}
            />
          </>
        }
      >
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <SnippetToolbar
                selected={selected}
                activeFragment={activeFragment}
                titleInputRef={setTitleInputRef}
                backlinkNoteId={handoffState.backlinkNoteId}
                canFormat={canFormat}
                formatting={formatting}
                formatDisabledReason={formatDisabledReason}
                previewKind={previewKind}
                previewOpen={previewOpen}
                detailsOpen={detailsOpen}
                onLanguageChange={(language) => updateActiveFragment({ language })}
                onToggleFavorite={() => void handleToggleFavorite()}
                onFormat={() => void handleFormat()}
                onPreview={handlePreview}
                onCopy={() => void handleCopy()}
                onSendToPromptTemplate={handleSendToPromptTemplate}
                onDuplicate={() => void handleDuplicate()}
                onDownload={() => void handleDownload()}
                onToggleDetails={() => setDetailsOpen((current) => !current)}
                onRequestDelete={() => setDeleteDialogOpen(true)}
              />

              {formatError && (
                <Alert variant="error" className="m-3 mb-0">
                  {formatError}
                </Alert>
              )}

              {activeFragment && (
                <SnippetFragmentBar
                  selected={selected}
                  fragments={fragments}
                  activeFragment={activeFragment}
                  fragmentEditorId={fragmentEditorId}
                  descriptionOpen={descriptionOpen}
                  onToggleDescription={() => setDescriptionOpen((open) => !open)}
                  onSelectFragment={selectFragment}
                  onRenameFragment={(name) => updateActiveFragment({ name })}
                  onAddFragment={handleAddFragment}
                  onMoveFragment={handleMoveFragment}
                  onDuplicateFragment={handleDuplicateFragment}
                  onRequestDeleteFragment={setFragmentDeleteCandidate}
                />
              )}

              <div
                id={fragmentEditorId}
                role="tabpanel"
                aria-labelledby={
                  activeFragment ? `${fragmentEditorId}-tab-${activeFragment.id}` : undefined
                }
                className="relative min-h-0 flex-1 overflow-hidden"
              >
                <div className="absolute inset-0 min-h-0 min-w-0 overflow-hidden">
                  <Editor
                    key={activeFragment?.id ?? 'empty-fragment'}
                    theme={monacoTheme}
                    language={activeFragment?.language ?? 'text'}
                    value={activeFragment?.content ?? ''}
                    onMount={handleEditorMount}
                    onChange={(value) => {
                      setFormatError(null)
                      updateActiveFragment({ content: value ?? '' })
                    }}
                    options={snippetEditorOptions}
                  />
                </div>

                {detailsOpen && (
                  <SnippetDetailsPanel
                    selected={selected}
                    activeFragment={activeFragment}
                    snippetFolders={snippetFolders}
                    tags={tags}
                  />
                )}
                {previewOpen && previewDocument && (
                  <SnippetWebPreview
                    document={previewDocument}
                    onClose={() => setPreviewOpen(false)}
                  />
                )}
              </div>
            </>
          ) : (
            <EmptyState
              icon={ScissorsIcon}
              title="Build your snippet library"
              description="Create a snippet or import an existing JSON backup to get started."
              className="h-full"
              action={
                <div className="flex items-center gap-2">
                  <Button type="button" variant="primary" onClick={() => void handleNew()}>
                    <PlusIcon size={12} aria-hidden="true" className="mr-1.5" />
                    New snippet
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void handleImport()}>
                    <UploadSimpleIcon size={12} aria-hidden="true" className="mr-1.5" />
                    Import JSON
                  </Button>
                </div>
              }
            />
          )}
        </main>
      </MasterDetailLayout>

      {deleteDialogOpen && selected && (
        <Dialog
          title="Move snippet to Trash?"
          onClose={() => setDeleteDialogOpen(false)}
          initialFocusRef={cancelDeleteRef}
          footer={
            <>
              <Button
                ref={cancelDeleteRef}
                type="button"
                variant="secondary"
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={() => void handleDelete()}>
                Move to Trash
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{selected.title || 'Untitled'}” can be restored from Trash at any time.
          </p>
        </Dialog>
      )}
      {fragmentDeleteCandidate && (
        <Dialog
          title="Delete fragment?"
          onClose={() => setFragmentDeleteCandidate(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setFragmentDeleteCandidate(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteFragment}>
                Delete fragment
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{fragmentDeleteCandidate.name || 'Untitled fragment'}” will be removed from this
            snippet. The rest of the snippet is unchanged.
          </p>
        </Dialog>
      )}
      {trash.folderTrashCandidate && (
        <Dialog
          title="Move folder to Trash?"
          onClose={() => trash.setFolderTrashCandidate(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => trash.setFolderTrashCandidate(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void trash.handleTrashFolder()}>
                Move folder to Trash
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{trash.folderTrashCandidate.name}” and everything nested inside it will move to Trash
            together.
          </p>
        </Dialog>
      )}
      {trash.trashOpen && (
        <TrashDialog
          title="Snippets Trash"
          entries={trash.trashEntries}
          onClose={() => trash.setTrashOpen(false)}
          onRestore={trash.handleRestoreTrashEntry}
          onDeletePermanently={trash.handleDeleteTrashEntry}
          onEmpty={trash.handleEmptyTrash}
        />
      )}
    </>
  )
}
