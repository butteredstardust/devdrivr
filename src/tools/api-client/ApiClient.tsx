import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { Alert } from '@/components/shared/Alert'
import { Button } from '@/components/shared/Button'
import { SelectionContextToolbar } from '@/components/shared/SelectionContextToolbar'
import { SplitPane } from '@/components/shared/SplitPane'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { useApiBackup, importApiBackupContent, importApiBackupData } from '@/hooks/useApiBackup'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useMonaco } from '@/hooks/useMonaco'
import { useMonacoSelectionToolbar } from '@/hooks/useMonacoSelectionToolbar'
import { useTabDirty } from '@/hooks/useTabDirty'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolState } from '@/hooks/useToolState'
import { sendToTool } from '@/lib/tool-handoff'
import { useApiStore } from '@/stores/api.store'
import { useUiStore } from '@/stores/ui.store'
import { CollectionsSidebar } from '@/tools/api-client/components/CollectionsSidebar'
import { ConfirmDialog } from '@/tools/api-client/components/ConfirmDialog'
import { EnvironmentModal } from '@/tools/api-client/components/EnvironmentModal'
import { ImportSpecModal } from '@/tools/api-client/components/ImportSpecModal'
import { RequestPanel } from '@/tools/api-client/components/RequestPanel'
import { RequestToolbars } from '@/tools/api-client/components/RequestToolbars'
import { ResponsePanel } from '@/tools/api-client/components/ResponsePanel'
import { SaveRequestModal } from '@/tools/api-client/components/SaveRequestModal'
import { useCollectionRun } from '@/tools/api-client/hooks/useCollectionRun'
import { useRequestEditor } from '@/tools/api-client/hooks/useRequestEditor'
import { useRequestTransport } from '@/tools/api-client/hooks/useRequestTransport'
import {
  createDefaultDraft,
  DEFAULT_TIMEOUT_MS,
  isDraftDirty,
  isTextResponse,
  MAX_HISTORY_RESPONSE_CHARS,
  validateApiClientState,
  type ApiClientState,
  type EditorInstance,
  type PendingNavigation,
} from '@/tools/api-client/request-model'
import type { ApiImportResult, ApiRequest, HistoryEntry } from '@/types/models'
import { BracketsCurlyIcon, CopyIcon } from '@phosphor-icons/react'

/**
 * Request beside response when both are up, request alone when the response pane is hidden.
 *
 * A local wrapper rather than a conditional at the call site: the two panels are ~300 lines of
 * JSX, and lifting them into consts purely to choose a container is a lot of churn for one
 * branch. `false` is the shape `{cond && <section/>}` actually produces.
 */
function RequestResponseLayout({ children }: { children: [ReactNode, ReactNode | false] }) {
  const [request, response] = children
  if (!response) return <div className="flex min-h-0 flex-1">{request}</div>
  return (
    <SplitPane storageKey="api-client" stackBelow={1000} aria-label="Resize request and response">
      {request}
      {response}
    </SplitPane>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApiClient() {
  const responsePaneId = useId()
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const init = useApiStore((s) => s.init)
  const environments = useApiStore((s) => s.environments)
  const activeEnvironmentId = useApiStore((s) => s.activeEnvironmentId)
  const setActiveEnvironmentId = useApiStore((s) => s.setActiveEnvironmentId)
  const collections = useApiStore((s) => s.collections)
  const requests = useApiStore((s) => s.requests)
  const createRequest = useApiStore((s) => s.createRequest)
  const createCollection = useApiStore((s) => s.createCollection)
  const updateRequest = useApiStore((s) => s.updateRequest)
  const [apiInitialized, setApiInitialized] = useState(false)
  useEffect(() => {
    let cancelled = false
    void init().then(() => {
      if (!cancelled) setApiInitialized(true)
    })
    return () => {
      cancelled = true
    }
  }, [init])

  const [state, updateState] = useToolState<ApiClientState>(
    'api-client',
    {
      activeRequestId: null,
      wikiTargetId: null,
      backlinkNoteId: null,
      libraryOpen: true,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      draft: createDefaultDraft(),
    },
    { validate: validateApiClientState }
  )

  const editor = useRequestEditor({ state, updateState })
  const { method, url, name, updateDraft, clearTransientFormState } = editor
  const setLastAction = useUiStore((s) => s.setLastAction)
  const { exportBackup } = useApiBackup(setLastAction)
  const copy = useCopyToClipboard()
  const [responseEditor, setResponseEditor] = useState<EditorInstance | null>(null)
  const [saving, setSaving] = useState(false)
  const [requestTab, setRequestTab] = useState('params')
  const [responseTab, setResponseTab] = useState('body')
  const [showEnvModal, setShowEnvModal] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showExportConfirm, setShowExportConfirm] = useState(false)
  const [saveMode, setSaveMode] = useState<'save' | 'save-as'>('save-as')
  const [responseCollapsed, setResponseCollapsed] = useState(true)
  const [responsePaneUserToggled, setResponsePaneUserToggled] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null)

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
  const envVars = useMemo(() => activeEnv?.variables ?? {}, [activeEnv])
  const responseVisible = !responseCollapsed
  const transport = useRequestTransport({
    draft: { ...state.draft, headers: editor.headers, auth: editor.auth },
    state,
    envVars,
    formFields: editor.formFields,
  })
  const {
    response,
    setResponse,
    loading,
    error,
    setError,
    unresolvedVariables,
    setUnresolvedVariables,
    imagePreviewUrl,
    handleSend,
    handleCancelRequest,
    handleCopyAsCurl,
    responseLanguage,
    prettyBody,
    handleSaveResponse,
  } = transport
  const { collectionRun, runCollection, cancelCollection } = useCollectionRun(
    envVars,
    state.timeoutMs
  )

  const savedRequest = useMemo(
    () => requests.find((r) => r.id === state.activeRequestId),
    [requests, state.activeRequestId]
  )
  const dirty = useMemo(() => isDraftDirty(state.draft, savedRequest), [state.draft, savedRequest])
  useTabDirty(dirty)
  // Read inside stable callbacks so the discard guard never needs `dirty` as a dep.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  const activeCollectionName = useMemo(() => {
    if (!savedRequest?.collectionId) return null
    return collections.find((c) => c.id === savedRequest.collectionId)?.name ?? null
  }, [collections, savedRequest])

  const responseSelectionToolbar = useMonacoSelectionToolbar(
    responseEditor,
    responseTab === 'body' && response != null,
    response?.body ?? ''
  )

  useEffect(() => {
    if (!responsePaneUserToggled && (loading || response || error)) setResponseCollapsed(false)
  }, [loading, response, error, responsePaneUserToggled])

  const toggleResponsePane = useCallback(() => {
    setResponsePaneUserToggled(true)
    setResponseCollapsed((collapsed) => !collapsed)
  }, [])

  const handleResponseEditorMount: OnMount = useCallback((editor) => {
    setResponseEditor(editor)
  }, [])

  const copyResponseSelection = useCallback(
    async (text: string) => {
      await copy(text, {
        success: 'Response selection copied to clipboard',
        failure: 'Failed to copy response selection',
      })
    },
    [copy]
  )

  const sendResponseSelectionToJsonTools = useCallback(
    (text: string) => {
      // JSON Tools expects `view`. An `activeTab` field has no effect and persists as unused state.
      sendToTool(
        'json-tools',
        { input: text, view: 'source', query: '' },
        { documentKeys: ['input'] }
      )
      setLastAction('Sent response selection to JSON Tools', 'success')
    },
    [setLastAction]
  )

  const responseSelectionActions = useMemo(
    () => [
      {
        id: 'copy',
        label: 'Copy selection',
        icon: <CopyIcon size={14} />,
        onSelect: copyResponseSelection,
      },
      {
        id: 'json-tools',
        label: 'Send to JSON Tools',
        icon: <BracketsCurlyIcon size={14} />,
        onSelect: sendResponseSelectionToJsonTools,
      },
    ],
    [copyResponseSelection, sendResponseSelectionToJsonTools]
  )

  // ---------------------------------------------------------------------------
  // Draft navigation — every path that replaces the draft goes through the guard
  // ---------------------------------------------------------------------------

  const guardUnsaved = useCallback((description: string, perform: () => void) => {
    if (dirtyRef.current) {
      setPendingNavigation({ description, perform })
      return
    }
    perform()
  }, [])

  const resetToNewRequest = useCallback(() => {
    clearTransientFormState()
    updateState({
      activeRequestId: null,
      wikiTargetId: null,
      backlinkNoteId: null,
      draft: createDefaultDraft(),
    })
    setResponse(null)
    setError(null)
  }, [clearTransientFormState, setError, setResponse, updateState])

  const handleNewRequest = useCallback(() => {
    guardUnsaved('starting a new request', resetToNewRequest)
  }, [guardUnsaved, resetToNewRequest])

  const handleSelectLoadedRequest = useCallback(
    (req: ApiRequest, backlinkNoteId: string | null = null) => {
      guardUnsaved(`opening “${req.name}”`, () => {
        clearTransientFormState()
        updateState({
          activeRequestId: req.id,
          backlinkNoteId,
          draft: {
            name: req.name,
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body,
            bodyMode: req.bodyMode,
            auth: req.auth,
          },
        })
        setResponse(null)
        setError(null)
      })
    },
    [clearTransientFormState, guardUnsaved, setError, setResponse, updateState]
  )

  useEffect(() => {
    if (!state.wikiTargetId) return
    const request = requests.find((candidate) => candidate.id === state.wikiTargetId)
    if (!request) return
    handleSelectLoadedRequest(request, state.backlinkNoteId)
    updateState({ wikiTargetId: null })
  }, [handleSelectLoadedRequest, requests, state.backlinkNoteId, state.wikiTargetId, updateState])

  const handleLoadFromHistory = useCallback(
    (entry: HistoryEntry) => {
      const [histMethod, ...urlParts] = entry.input.split(' ')
      const histUrl = urlParts.join(' ')
      guardUnsaved('restoring a request from history', () => {
        clearTransientFormState()
        updateState({
          activeRequestId: null,
          backlinkNoteId: null,
          draft: createDefaultDraft(histMethod ?? 'GET', { url: histUrl }),
        })
        if (entry.responseBody != null) {
          const mimeType = entry.responseMimeType ?? 'text/plain'
          setResponse({
            status: entry.responseStatus ?? 200,
            statusText: entry.responseStatusText ?? 'History snapshot',
            headers: { 'content-type': mimeType },
            body: entry.responseBody,
            blob: new Blob([entry.responseBody], { type: mimeType }),
            mimeType,
            isBinary: false,
            displayTruncated: entry.responseBody.length >= MAX_HISTORY_RESPONSE_CHARS,
            time: 0,
            size: new TextEncoder().encode(entry.responseBody).byteLength,
          })
          setResponseCollapsed(false)
        } else {
          setResponse(null)
          if (entry.responseMimeType && !isTextResponse(entry.responseMimeType)) {
            setError('Binary response bodies are not persisted in history; run the request again.')
            return
          }
        }
        setError(null)
      })
    },
    [clearTransientFormState, guardUnsaved, setError, setResponse, updateState]
  )

  // A saved request deleted elsewhere (or with its collection) must not leave a
  // phantom "saved" state behind — reset without prompting, there is nothing to
  // navigate back to.
  useEffect(() => {
    if (
      apiInitialized &&
      state.activeRequestId &&
      !requests.some((request) => request.id === state.activeRequestId)
    ) {
      resetToNewRequest()
    }
  }, [apiInitialized, resetToNewRequest, requests, state.activeRequestId])

  // ---------------------------------------------------------------------------
  // Save Request logic
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    // An already-saved request writes straight through — no dialog for every edit.
    if (state.activeRequestId && savedRequest) {
      setSaving(true)
      try {
        await updateRequest({
          ...savedRequest,
          ...state.draft,
          id: state.activeRequestId,
          collectionId: savedRequest.collectionId,
        })
        setLastAction('Request saved', 'success')
      } catch (e) {
        setLastAction(`Save failed — ${(e as Error).message}`, 'error')
      } finally {
        setSaving(false)
      }
      return
    }
    setSaveMode('save-as')
    setShowSaveModal(true)
  }, [savedRequest, setLastAction, state.activeRequestId, state.draft, updateRequest])

  const handleSaveAs = useCallback(() => {
    setSaveMode('save-as')
    setShowSaveModal(true)
  }, [])

  const handleSaveModalSubmit = useCallback(
    async (reqName: string, collectionIdOrNewName: string | null, isNew: boolean) => {
      setShowSaveModal(false)
      setSaving(true)

      try {
        let resolvedCollectionId: string | null = collectionIdOrNewName
        if (isNew && collectionIdOrNewName) {
          const newCol = await createCollection(collectionIdOrNewName)
          resolvedCollectionId = newCol.id
        }

        if (saveMode === 'save' && state.activeRequestId) {
          const existing = requests.find((r) => r.id === state.activeRequestId)
          await updateRequest({
            ...state.draft,
            id: state.activeRequestId,
            name: reqName,
            collectionId: resolvedCollectionId,
            createdAt: existing?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
          })
          updateState({ draft: { ...state.draft, name: reqName } })
          setLastAction('Request updated', 'success')
        } else {
          const newReq = await createRequest({
            ...state.draft,
            name: reqName,
            collectionId: resolvedCollectionId,
          })
          updateState({ activeRequestId: newReq.id, draft: { ...state.draft, name: reqName } })
          setLastAction('Request saved', 'success')
        }
      } catch (e) {
        setLastAction(`Save failed — ${(e as Error).message}`, 'error')
      } finally {
        setSaving(false)
      }
    },
    [
      saveMode,
      state.activeRequestId,
      state.draft,
      requests,
      createCollection,
      createRequest,
      updateRequest,
      updateState,
      setLastAction,
    ]
  )

  const saveModalInitialCollectionId = useMemo(() => {
    if (!state.activeRequestId) return null
    return requests.find((r) => r.id === state.activeRequestId)?.collectionId ?? null
  }, [state.activeRequestId, requests])

  // ---------------------------------------------------------------------------
  // Import / Export
  // ---------------------------------------------------------------------------

  const handleImportData = useCallback(
    async (data: ApiImportResult) => {
      await importApiBackupData(data, setLastAction)
    },
    [setLastAction]
  )

  const handleImportContent = useCallback(
    async (content: string, filename: string) => {
      await importApiBackupContent(content, filename, setLastAction)
    },
    [setLastAction]
  )

  useToolAction((action) => {
    if (action.type === 'execute') {
      void handleSend()
    }
    if (action.type === 'save-file') {
      void handleSaveResponse()
    }
    if (action.type === 'open-file') {
      void handleImportContent(action.content, action.filename)
    }
  })

  const handleExport = useCallback(async () => {
    await exportBackup()
    setShowExportConfirm(false)
  }, [exportBackup])

  const statusLine = dirty
    ? 'Unsaved changes'
    : state.activeRequestId
      ? `Saved in ${activeCollectionName ?? 'Unassigned'}`
      : 'New request — not saved yet'

  // The layout closes the library itself when there is no room for it beside the request — at the
  // 800px minimum window with the notes drawer open, keeping both left this toolbar 230px wide and
  // pushed Send off the edge. Tracking it here keeps the toggle from offering to "hide" a pane
  // that is already gone.
  const [libraryCramped, setLibraryCramped] = useState(false)
  const [showCrampedLibrary, setShowCrampedLibrary] = useState(false)
  const libraryVisible = state.libraryOpen && (!libraryCramped || showCrampedLibrary)

  const handleLibraryCrampedChange = useCallback((next: boolean) => {
    setLibraryCramped(next)
    if (!next) setShowCrampedLibrary(false)
  }, [])

  const toggleLibrary = useCallback(() => {
    if (libraryCramped) {
      if (!libraryVisible) updateState({ libraryOpen: true })
      setShowCrampedLibrary(!libraryVisible)
      return
    }
    updateState({ libraryOpen: !state.libraryOpen })
  }, [libraryCramped, libraryVisible, state.libraryOpen, updateState])

  return (
    <>
      <CollectionsSidebar
        activeRequestId={state.activeRequestId}
        open={state.libraryOpen}
        onCrampedChange={handleLibraryCrampedChange}
        showWhenCramped={showCrampedLibrary}
        onCloseCramped={toggleLibrary}
        onSelect={handleSelectLoadedRequest}
        onLoadFromHistory={handleLoadFromHistory}
        onRunCollection={(collection) => void runCollection(collection)}
        onCancelCollection={cancelCollection}
        collectionRun={collectionRun}
        onImport={() => setShowImportModal(true)}
        onExport={() => setShowExportConfirm(true)}
      >
        <ToolLayout
          fullBleed
          toolbar={
            <RequestToolbars
              state={state}
              updateState={updateState}
              updateDraft={updateDraft}
              environments={environments}
              activeEnvironmentId={activeEnvironmentId}
              setActiveEnvironmentId={setActiveEnvironmentId}
              name={name}
              method={method}
              url={url}
              statusLine={statusLine}
              dirty={dirty}
              saving={saving}
              loading={loading}
              libraryVisible={libraryVisible}
              responseVisible={responseVisible}
              responsePaneId={responsePaneId}
              toggleLibrary={toggleLibrary}
              toggleResponsePane={toggleResponsePane}
              handleNewRequest={handleNewRequest}
              handleSave={handleSave}
              handleSaveAs={handleSaveAs}
              handleMethodChange={editor.handleMethodChange}
              handleSend={handleSend}
              handleCancelRequest={handleCancelRequest}
              handleCopyAsCurl={handleCopyAsCurl}
              openImportModal={() => setShowImportModal(true)}
              openEnvironmentModal={() => setShowEnvModal(true)}
            />
          }
        >
          {unresolvedVariables.length > 0 && (
            <Alert
              variant="warning"
              className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Unresolved request variable{unresolvedVariables.length === 1 ? '' : 's'}:{' '}
                  {unresolvedVariables.map((name) => `{{${name}}}`).join(', ')}
                </span>
                <Button variant="secondary" size="xs" onClick={() => void handleSend(true)}>
                  Send anyway
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setUnresolvedVariables([])}>
                  Dismiss
                </Button>
              </div>
            </Alert>
          )}
          <RequestResponseLayout>
            <RequestPanel
              editor={editor}
              requestTab={requestTab}
              setRequestTab={setRequestTab}
              monacoTheme={monacoTheme}
              monacoOptions={monacoOptions}
            />
            {responseVisible && (
              <ResponsePanel
                id={responsePaneId}
                response={response}
                error={error}
                loading={loading}
                responseTab={responseTab}
                setResponseTab={setResponseTab}
                imagePreviewUrl={imagePreviewUrl}
                prettyBody={prettyBody}
                responseLanguage={responseLanguage}
                monacoTheme={monacoTheme}
                monacoOptions={monacoOptions}
                handleResponseEditorMount={handleResponseEditorMount}
                handleSaveResponse={handleSaveResponse}
              />
            )}
          </RequestResponseLayout>
        </ToolLayout>
      </CollectionsSidebar>

      {showEnvModal && <EnvironmentModal onClose={() => setShowEnvModal(false)} />}
      {showSaveModal && (
        <SaveRequestModal
          mode={saveMode}
          initialName={name}
          initialCollectionId={saveModalInitialCollectionId}
          collections={collections}
          onSave={(reqName, collectionIdOrNewName, isNew) => {
            void handleSaveModalSubmit(reqName, collectionIdOrNewName, isNew)
          }}
          onClose={() => setShowSaveModal(false)}
        />
      )}
      {showImportModal && (
        <ImportSpecModal onImport={handleImportData} onClose={() => setShowImportModal(false)} />
      )}
      {showExportConfirm && (
        <ConfirmDialog
          title="Export API library?"
          confirmLabel="Export full backup"
          tone="default"
          onClose={() => setShowExportConfirm(false)}
          onConfirm={() => void handleExport()}
        >
          This backup includes request authentication values, headers, bodies, and every API
          environment variable. Store the exported file as sensitive data.
        </ConfirmDialog>
      )}
      {pendingNavigation && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          confirmLabel="Discard changes"
          onClose={() => setPendingNavigation(null)}
          onConfirm={() => {
            const { perform } = pendingNavigation
            setPendingNavigation(null)
            perform()
          }}
        >
          <p>
            “{name}” has unsaved changes. Continue {pendingNavigation.description} and lose them?
          </p>
          <p className="mt-2 text-[var(--color-text-muted)]">
            Cancel and use Save or Save As to keep this request.
          </p>
        </ConfirmDialog>
      )}
      <SelectionContextToolbar
        selection={responseSelectionToolbar.selection}
        actions={responseSelectionActions}
        onDismiss={responseSelectionToolbar.clearSelection}
      />
    </>
  )
}
