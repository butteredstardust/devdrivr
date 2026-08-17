import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { useMonacoSelectionToolbar } from '@/hooks/useMonacoSelectionToolbar'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { Button } from '@/components/shared/Button'
import { Input, Select } from '@/components/shared/Input'
import { InlineInput } from '@/components/shared/InlineInput'
import { EmptyState } from '@/components/shared/EmptyState'
import { Spinner } from '@/components/shared/Spinner'
import { SelectionContextToolbar } from '@/components/shared/SelectionContextToolbar'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Alert } from '@/components/shared/Alert'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useUiStore } from '@/stores/ui.store'
import { sendToTool } from '@/lib/tool-handoff'
import { useToolAction } from '@/hooks/useToolAction'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useApiStore } from '@/stores/api.store'
import { buildExportFilename, exportFile } from '@/lib/file-io'
import { EnvironmentModal } from './components/EnvironmentModal'
import { AuthTab } from './components/AuthTab'
import { CollectionsSidebar, getMethodColor } from './components/CollectionsSidebar'
import { ConfirmDialog } from './components/ConfirmDialog'
import { SaveRequestModal } from './components/SaveRequestModal'
import { ImportSpecModal } from './components/ImportSpecModal'
import { importApiSpec } from '@/lib/api-import'
import type { ApiImportResult, ApiRequest, ApiRequestAuth, ApiHeader } from '@/types/models'
import {
  BracketsCurlyIcon,
  CodeIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FilePlusIcon,
  GearSixIcon,
  LinkIcon,
  ListBulletsIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  SidebarIcon,
  XIcon,
} from '@phosphor-icons/react'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const DEFAULT_REQUEST_NAME = 'Untitled Request'

type Param = { key: string; value: string }

type RequestDraft = {
  name: string
  method: string
  url: string
  headers: ApiHeader[]
  body: string
  bodyMode: string
  auth: ApiRequestAuth
}

type ApiClientState = {
  activeRequestId: string | null
  /** Library sidebar visibility — persisted so narrow windows stay where the user left them. */
  libraryOpen: boolean
  // We keep a working draft independent of the saved request
  draft: RequestDraft
}

type ResponseData = {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  time: number
  size: number
}

type EditorInstance = Parameters<OnMount>[0]

/** A navigation that would discard unsaved edits, held until the user confirms. */
type PendingNavigation = { description: string; perform: () => void }

const RESPONSE_TABS = [
  { id: 'body', label: 'Body' },
  { id: 'headers', label: 'Headers' },
]

const BODY_MODES = [
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Text' },
  { id: 'none', label: 'None' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitUrlParts(url: string): { base: string; query: string; hash: string } {
  const hashIndex = url.indexOf('#')
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : ''
  const queryIndex = withoutHash.indexOf('?')

  return {
    base: queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash,
    query: queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '',
    hash,
  }
}

export function parseQueryParams(url: string): Param[] {
  const { query } = splitUrlParts(url)
  const params: Param[] = []
  new URLSearchParams(query).forEach((value, key) => {
    params.push({ key, value })
  })
  return params
}

export function buildUrlWithParams(url: string, params: Param[]): string {
  const { base, hash } = splitUrlParts(url)
  const search = new URLSearchParams()
  params
    .filter((p) => p.key.trim())
    .forEach((p) => {
      search.append(p.key, p.value)
    })

  const query = search.toString()
  return `${base}${query ? `?${query}` : ''}${hash}`
}

function detectResponseLanguage(headers: Record<string, string>): string {
  const ct = (headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('json')) return 'json'
  if (ct.includes('html')) return 'html'
  if (ct.includes('xml')) return 'xml'
  if (ct.includes('css')) return 'css'
  if (ct.includes('javascript')) return 'javascript'
  return 'plaintext'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function interpolate(text: string, vars: Record<string, string>): string {
  if (!text) return text
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    return vars[key.trim()] ?? match
  })
}

function base64EncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function createDefaultDraft(method = 'GET', patch: Partial<RequestDraft> = {}): RequestDraft {
  return {
    name: DEFAULT_REQUEST_NAME,
    method,
    url: '',
    headers: BODY_METHODS.has(method)
      ? [{ key: 'Content-Type', value: 'application/json', enabled: true }]
      : [],
    body: '',
    bodyMode: BODY_METHODS.has(method) ? 'json' : 'none',
    auth: { type: 'none' },
    ...patch,
  }
}

/**
 * Structural comparison of the seven fields that make up a request. Used for
 * both "does this draft still match what's saved" and "is this a pristine new
 * draft" — the two questions that decide whether navigating away destroys work.
 */
export function draftsMatch(a: RequestDraft, b: RequestDraft): boolean {
  return (
    a.name === b.name &&
    a.method === b.method &&
    a.url === b.url &&
    a.body === b.body &&
    a.bodyMode === b.bodyMode &&
    JSON.stringify(a.auth) === JSON.stringify(b.auth) &&
    JSON.stringify(a.headers) === JSON.stringify(b.headers)
  )
}

export function isDraftDirty(draft: RequestDraft, saved: ApiRequest | undefined): boolean {
  if (saved) {
    return !draftsMatch(draft, {
      name: saved.name,
      method: saved.method,
      url: saved.url,
      headers: saved.headers,
      body: saved.body,
      bodyMode: saved.bodyMode,
      auth: saved.auth,
    })
  }
  // Unsaved draft: only "dirty" once it differs from a pristine draft for its
  // own method, so simply switching GET → POST never triggers a discard prompt.
  return !draftsMatch(draft, createDefaultDraft(draft.method))
}

function applyMethodDefaults(draft: RequestDraft, nextMethod: string): RequestDraft {
  const nextSupportsBody = BODY_METHODS.has(nextMethod)
  const currentSupportsBody = BODY_METHODS.has(draft.method)

  if (!nextSupportsBody) {
    return { ...draft, method: nextMethod, bodyMode: 'none' }
  }

  if (currentSupportsBody) return { ...draft, method: nextMethod }

  const hasContentType = draft.headers.some((h) => h.key.toLowerCase() === 'content-type')
  return {
    ...draft,
    method: nextMethod,
    bodyMode: draft.bodyMode === 'none' ? 'json' : draft.bodyMode,
    headers: hasContentType
      ? draft.headers
      : [{ key: 'Content-Type', value: 'application/json', enabled: true }, ...draft.headers],
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApiClient() {
  const responsePaneId = useId()
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const init = useApiStore((s) => s.init)
  const environments = useApiStore((s) => s.environments)
  const activeEnvironmentId = useApiStore((s) => s.activeEnvironmentId)
  const setActiveEnvironmentId = useApiStore((s) => s.setActiveEnvironmentId)
  const collections = useApiStore((s) => s.collections)
  const requests = useApiStore((s) => s.requests)
  const createRequest = useApiStore((s) => s.createRequest)
  const createCollection = useApiStore((s) => s.createCollection)
  const updateRequest = useApiStore((s) => s.updateRequest)
  const importApiData = useApiStore((s) => s.importApiData)
  const addRequestHistory = useApiStore((s) => s.addRequestHistory)
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

  const [state, updateState] = useToolState<ApiClientState>('api-client', {
    activeRequestId: null,
    libraryOpen: true,
    draft: createDefaultDraft(),
  })

  // Destructure draft for convenience
  const { method, url, headers, body, bodyMode, auth, name } = state.draft

  const updateDraft = useCallback(
    (patch: Partial<RequestDraft>) => {
      updateState({ draft: { ...state.draft, ...patch } })
    },
    [state.draft, updateState]
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [responseEditor, setResponseEditor] = useState<EditorInstance | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestTab, setRequestTab] = useState('params')
  const [responseTab, setResponseTab] = useState('body')
  const [showEnvModal, setShowEnvModal] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [saveMode, setSaveMode] = useState<'save' | 'save-as'>('save-as')
  const [responseCollapsed, setResponseCollapsed] = useState(true)
  const [responsePaneUserToggled, setResponsePaneUserToggled] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null)

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
  const envVars = useMemo(() => activeEnv?.variables ?? {}, [activeEnv])
  const responseVisible = !responseCollapsed

  const savedRequest = useMemo(
    () => requests.find((r) => r.id === state.activeRequestId),
    [requests, state.activeRequestId]
  )
  const dirty = useMemo(() => isDraftDirty(state.draft, savedRequest), [state.draft, savedRequest])
  // Read inside stable callbacks so the discard guard never needs `dirty` as a dep.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  const activeCollectionName = useMemo(() => {
    if (!savedRequest?.collectionId) return null
    return collections.find((c) => c.id === savedRequest.collectionId)?.name ?? null
  }, [collections, savedRequest])

  // ---------------------------------------------------------------------------
  // Query params
  // ---------------------------------------------------------------------------

  const [params, setParams] = useState<Param[]>(() => parseQueryParams(url))
  const urlRef = useRef(url)
  const responseSelectionToolbar = useMonacoSelectionToolbar(
    responseEditor,
    responseTab === 'body' && response != null,
    response?.body ?? ''
  )

  useEffect(() => {
    if (url !== urlRef.current) {
      urlRef.current = url
      setParams(parseQueryParams(url))
    }
  }, [url])

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
      try {
        await navigator.clipboard.writeText(text)
        setLastAction('Response selection copied to clipboard', 'success')
      } catch {
        setLastAction('Failed to copy response selection', 'error')
      }
    },
    [setLastAction]
  )

  const sendResponseSelectionToJsonTools = useCallback(
    (text: string) => {
      // `view`, not `activeTab` — JSON Tools has no such field, so the old key
      // switched nothing and was persisted as junk into its row.
      sendToTool('json-tools', { input: text, view: 'source', query: '' })
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

  const commitParams = useCallback(
    (newParams: Param[]) => {
      setParams(newParams)
      const newUrl = buildUrlWithParams(
        url,
        newParams.filter((p) => p.key.trim())
      )
      urlRef.current = newUrl
      updateDraft({ url: newUrl })
    },
    [url, updateDraft]
  )

  const addParam = useCallback(() => {
    commitParams([...params, { key: '', value: '' }])
  }, [params, commitParams])

  const updateParam = useCallback(
    (index: number, patch: Partial<Param>) => {
      const updated = params.map((p, i) => (i === index ? { ...p, ...patch } : p))
      commitParams(updated)
    },
    [params, commitParams]
  )

  const removeParam = useCallback(
    (index: number) => {
      commitParams(params.filter((_, i) => i !== index))
    },
    [params, commitParams]
  )

  // ---------------------------------------------------------------------------
  // Send request
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(async () => {
    const interpolatedUrl = interpolate(url, envVars)
    if (!interpolatedUrl.trim()) {
      setLastAction('Enter a URL (or ensure {{variable}} is populated)', 'error')
      return
    }

    setLoading(true)
    setError(null)
    setResponse(null)
    const start = performance.now()

    try {
      const fetchHeaders: Record<string, string> = {}

      // Interpolate user headers
      for (const h of headers) {
        if (h.enabled && h.key.trim()) {
          fetchHeaders[interpolate(h.key, envVars)] = interpolate(h.value, envVars)
        }
      }

      // Add auth headers
      if (auth.type === 'bearer') {
        const token = interpolate(auth.token, envVars)
        fetchHeaders['Authorization'] = `Bearer ${token}`
      } else if (auth.type === 'basic') {
        const u = interpolate(auth.username, envVars)
        const p = interpolate(auth.password, envVars)
        fetchHeaders['Authorization'] = `Basic ${base64EncodeUtf8(`${u}:${p}`)}`
      }

      const opts: RequestInit = { method, headers: fetchHeaders }

      if (BODY_METHODS.has(method) && bodyMode !== 'none' && body.trim()) {
        opts.body = interpolate(body, envVars)
      }

      const res = await tauriFetch(interpolatedUrl, opts)
      const time = Math.round(performance.now() - start)
      const resBody = await res.text()
      const size = new Blob([resBody]).size

      const resHeaders: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        resHeaders[key] = value
      })

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: resBody,
        time,
        size,
      })
      setLastAction(`${res.status} ${res.statusText} (${time}ms)`, res.ok ? 'success' : 'error')

      // Log to history
      void addRequestHistory({
        subTab: method,
        input: `${method} ${interpolatedUrl}`,
        output: `${res.status} ${res.statusText} · ${time}ms · ${formatSize(size)}`,
      })
    } catch (e) {
      const msg = (e as Error).message
      setResponse(null)
      setError(msg)
      setLastAction('Request failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [url, method, headers, body, bodyMode, auth, envVars, setLastAction, addRequestHistory])

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
    updateState({ activeRequestId: null, draft: createDefaultDraft() })
    setResponse(null)
    setError(null)
  }, [updateState])

  const handleNewRequest = useCallback(() => {
    guardUnsaved('starting a new request', resetToNewRequest)
  }, [guardUnsaved, resetToNewRequest])

  const handleSelectLoadedRequest = useCallback(
    (req: ApiRequest) => {
      guardUnsaved(`opening “${req.name}”`, () => {
        updateState({
          activeRequestId: req.id,
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
    [guardUnsaved, updateState]
  )

  const handleLoadFromHistory = useCallback(
    (histMethod: string, histUrl: string) => {
      guardUnsaved('restoring a request from history', () => {
        updateState({
          activeRequestId: null,
          draft: createDefaultDraft(histMethod, { url: histUrl }),
        })
        setResponse(null)
        setError(null)
      })
    },
    [guardUnsaved, updateState]
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
      const result = await importApiData(data)
      setLastAction(
        `Imported ${result.requests} requests into ${result.collections} collections`,
        'success'
      )
    },
    [importApiData, setLastAction]
  )

  const handleImportContent = useCallback(
    async (content: string, filename: string) => {
      try {
        const parsed = importApiSpec({ content, filename })
        if (parsed.requests.length === 0) {
          setLastAction('Import found no executable HTTP requests', 'error')
          return
        }
        await handleImportData(parsed)
      } catch (err) {
        setLastAction((err as Error).message, 'error')
      }
    },
    [handleImportData, setLastAction]
  )

  const responseLanguage = useMemo(() => {
    if (!response) return 'json'
    return detectResponseLanguage(response.headers)
  }, [response])

  const prettyBody = useMemo(() => {
    if (!response?.body) return ''
    if (responseLanguage === 'json') {
      try {
        return JSON.stringify(JSON.parse(response.body), null, 2)
      } catch {
        return response.body
      }
    }
    return response.body
  }, [response, responseLanguage])

  const handleSaveResponse = useCallback(async () => {
    if (!response) {
      setLastAction('No response to save yet', 'error')
      return
    }
    const extension = responseLanguage === 'plaintext' ? 'txt' : responseLanguage
    const filename = buildExportFilename(name || 'response', extension)
    try {
      const path = await exportFile(prettyBody, filename)
      if (path) setLastAction(`Saved ${filename}`, 'success')
    } catch (e) {
      setLastAction(`Save failed — ${(e as Error).message}`, 'error')
    }
  }, [name, prettyBody, response, responseLanguage, setLastAction])

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

  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      void handleSend()
    }, [handleSend])
  )

  const handleExport = useCallback(async () => {
    const exportCollectionById = new Map(
      collections.map((collection, index) => [
        collection.id,
        { key: `collection-${index + 1}`, name: collection.name },
      ])
    )
    const exportData = requests.map((r) => {
      const collection = r.collectionId ? exportCollectionById.get(r.collectionId) : undefined
      return {
        name: r.name,
        method: r.method,
        url: r.url,
        headers: r.headers,
        body: r.body,
        bodyMode: r.bodyMode,
        auth: r.auth,
        collectionKey: collection?.key ?? null,
        collectionName: collection?.name ?? null,
      }
    })
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
      setLastAction(`Exported ${exportData.length} requests to clipboard`, 'success')
    } catch {
      setLastAction('Export failed — clipboard unavailable', 'error')
    }
  }, [collections, requests, setLastAction])

  // ---------------------------------------------------------------------------
  // Header management
  // ---------------------------------------------------------------------------

  const addHeader = useCallback(() => {
    updateDraft({ headers: [...headers, { key: '', value: '', enabled: true }] })
  }, [headers, updateDraft])

  const updateHeader = useCallback(
    (index: number, patch: Partial<ApiHeader>) => {
      const newHeaders = headers.map((h, i) => (i === index ? { ...h, ...patch } : h))
      updateDraft({ headers: newHeaders })
    },
    [headers, updateDraft]
  )

  const removeHeader = useCallback(
    (index: number) => {
      updateDraft({ headers: headers.filter((_, i) => i !== index) })
    },
    [headers, updateDraft]
  )

  const handleMethodChange = useCallback(
    (nextMethod: string) => {
      updateState({ draft: applyMethodDefaults(state.draft, nextMethod) })
    },
    [state.draft, updateState]
  )

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const showBody = BODY_METHODS.has(method) && bodyMode !== 'none'
  const bodyEditorLang = bodyMode === 'json' ? 'json' : 'plaintext'
  const activeHeaderCount = headers.filter((h) => h.enabled && h.key.trim()).length

  const requestTabs = useMemo(
    () => [
      { id: 'params', label: params.length > 0 ? `Params (${params.length})` : 'Params' },
      {
        id: 'headers',
        label: activeHeaderCount > 0 ? `Headers (${activeHeaderCount})` : 'Headers',
      },
      { id: 'auth', label: auth.type === 'none' ? 'Auth' : 'Auth (set)' },
      { id: 'body', label: 'Body' },
    ],
    [activeHeaderCount, auth.type, params.length]
  )

  const statusLine = dirty
    ? 'Unsaved changes'
    : state.activeRequestId
      ? `Saved in ${activeCollectionName ?? 'Unassigned'}`
      : 'New request — not saved yet'

  const toggleLibrary = useCallback(() => {
    updateState({ libraryOpen: !state.libraryOpen })
  }, [state.libraryOpen, updateState])

  return (
    <div
      className={`grid h-full min-h-0 bg-[var(--color-bg)] ${
        state.libraryOpen
          ? 'grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)] max-[900px]:grid-cols-[11.5rem_minmax(0,1fr)]'
          : 'grid-cols-[minmax(0,1fr)]'
      }`}
    >
      {state.libraryOpen && (
        <CollectionsSidebar
          activeRequestId={state.activeRequestId}
          onSelect={handleSelectLoadedRequest}
          onLoadFromHistory={handleLoadFromHistory}
          onImport={() => setShowImportModal(true)}
          onExport={() => void handleExport()}
        />
      )}

      <ToolLayout
        fullBleed
        toolbar={
          <>
            {/* Request identity + save actions */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <Button
                type="button"
                variant="icon"
                size="sm"
                onClick={toggleLibrary}
                aria-expanded={state.libraryOpen}
                aria-label={state.libraryOpen ? 'Hide request library' : 'Show request library'}
                title={state.libraryOpen ? 'Hide request library' : 'Show request library'}
                className={
                  state.libraryOpen
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)]'
                }
              >
                <SidebarIcon size={15} aria-hidden="true" />
              </Button>

              <div className="min-w-0 flex-1 basis-40">
                <InlineInput
                  value={name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  placeholder={DEFAULT_REQUEST_NAME}
                  aria-label="Request name"
                  className="w-full truncate"
                />
                <p
                  className={`text-2xs ${
                    dirty ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]'
                  }`}
                  aria-live="polite"
                >
                  {statusLine}
                </p>
              </div>

              <Button
                type="button"
                variant="icon"
                size="sm"
                onClick={handleNewRequest}
                title="New request"
                aria-label="New request"
              >
                <FilePlusIcon size={15} aria-hidden="true" />
              </Button>

              <div className="flex items-center gap-1">
                <Select
                  value={activeEnvironmentId || ''}
                  onChange={(e) => setActiveEnvironmentId(e.target.value || null)}
                  aria-label="Active environment"
                  title="Active environment"
                  className="max-w-36"
                >
                  <option value="">No Environment</option>
                  {environments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={() => setShowEnvModal(true)}
                  title="Manage environments"
                  aria-label="Manage environments"
                >
                  <GearSixIcon size={15} aria-hidden="true" />
                </Button>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant={dirty ? 'primary' : 'secondary'}
                  size="sm"
                  loading={saving}
                  disabled={!dirty && !!state.activeRequestId}
                  onClick={() => void handleSave()}
                  title="Save request"
                >
                  Save
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleSaveAs}>
                  Save As
                </Button>
              </div>
            </div>

            {/* URL bar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
              <Select
                value={method}
                onChange={(e) => handleMethodChange(e.target.value)}
                aria-label="HTTP method"
                className={`font-mono font-bold ${getMethodColor(method)}`}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              <Input
                value={url}
                onChange={(e) => updateDraft({ url: e.target.value })}
                placeholder="{{baseUrl}}/endpoint"
                aria-label="Request URL"
                size="md"
                className="min-w-40 flex-1 basis-48 font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSend()
                }}
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void handleSend()}
                loading={loading}
                className="gap-1.5"
                title="Send request (⌘↵)"
              >
                <PaperPlaneTiltIcon size={13} aria-hidden="true" />
                Send
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleResponsePane}
                aria-expanded={responseVisible}
                aria-controls={responsePaneId}
              >
                {responseVisible ? 'Hide Response' : 'Show Response'}
              </Button>
            </div>
          </>
        }
      >
        <div
          className={`grid min-h-0 flex-1 ${
            responseVisible
              ? 'grid-cols-2 max-[1000px]:grid-cols-1 max-[1000px]:grid-rows-2'
              : 'grid-cols-1'
          }`}
        >
          {/* ── Request panel ─────────────────────────────────── */}
          <section
            aria-label="Request"
            className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${
              responseVisible
                ? 'border-r border-[var(--color-border)] max-[1000px]:border-b max-[1000px]:border-r-0'
                : ''
            }`}
          >
            <TabBar tabs={requestTabs} activeTab={requestTab} onTabChange={setRequestTab} />

            {/* Params tab */}
            {requestTab === 'params' && (
              <div className="min-h-0 flex-1 overflow-auto p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-mono text-xs text-[var(--color-text-muted)]">
                    Query Parameters
                  </h3>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={addParam}
                    className="gap-1"
                  >
                    <PlusIcon size={10} aria-hidden="true" />
                    Add
                  </Button>
                </div>
                {params.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {params.map((p, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Input
                          value={p.key}
                          onChange={(e) => updateParam(i, { key: e.target.value })}
                          placeholder="Key"
                          aria-label={`Query parameter ${i + 1} name`}
                          className="w-1/3 min-w-0 font-mono"
                        />
                        <Input
                          value={p.value}
                          onChange={(e) => updateParam(i, { value: e.target.value })}
                          placeholder="Value"
                          aria-label={`Query parameter ${i + 1} value`}
                          className="min-w-0 flex-1 font-mono"
                        />
                        <Button
                          type="button"
                          variant="icon"
                          size="xs"
                          onClick={() => removeParam(i)}
                          aria-label={`Remove query parameter ${p.key || i + 1}`}
                          className="hover:text-[var(--color-error)]"
                        >
                          <XIcon size={14} aria-hidden />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={LinkIcon}
                    size="sm"
                    title="No query parameters"
                    description="Add them here, or type them straight into the URL."
                  />
                )}
              </div>
            )}

            {/* Headers tab */}
            {requestTab === 'headers' && (
              <div className="min-h-0 flex-1 overflow-auto p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-mono text-xs text-[var(--color-text-muted)]">
                    Headers
                    {activeHeaderCount > 0 && (
                      <span className="ml-1 text-[var(--color-text)]">({activeHeaderCount})</span>
                    )}
                  </h3>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={addHeader}
                    className="gap-1"
                  >
                    <PlusIcon size={10} aria-hidden="true" />
                    Add
                  </Button>
                </div>
                {headers.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {headers.map((h, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={h.enabled}
                          onChange={(e) => updateHeader(i, { enabled: e.target.checked })}
                          aria-label={`Send header ${h.key || i + 1}`}
                          className="accent-[var(--color-accent)]"
                        />
                        <Input
                          value={h.key}
                          onChange={(e) => updateHeader(i, { key: e.target.value })}
                          placeholder="Header name"
                          aria-label={`Header ${i + 1} name`}
                          className="w-1/3 min-w-0 font-mono"
                        />
                        <Input
                          value={h.value}
                          onChange={(e) => updateHeader(i, { value: e.target.value })}
                          placeholder="Value (or {{env_var}})"
                          aria-label={`Header ${i + 1} value`}
                          className="min-w-0 flex-1 font-mono"
                        />
                        <Button
                          type="button"
                          variant="icon"
                          size="xs"
                          onClick={() => removeHeader(i)}
                          aria-label={`Remove header ${h.key || i + 1}`}
                          className="hover:text-[var(--color-error)]"
                        >
                          <XIcon size={14} aria-hidden />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={ListBulletsIcon}
                    size="sm"
                    title="No headers"
                    description="Add Accept, Authorization, or any custom header."
                  />
                )}
              </div>
            )}

            {/* Auth tab */}
            {requestTab === 'auth' && (
              <AuthTab auth={auth} onChange={(a) => updateDraft({ auth: a })} />
            )}

            {/* Body tab */}
            {requestTab === 'body' && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] px-3 py-1.5">
                  {BODY_MODES.map((mode) => (
                    <Button
                      key={mode.id}
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-pressed={bodyMode === mode.id}
                      onClick={() => updateDraft({ bodyMode: mode.id })}
                      className={
                        bodyMode === mode.id
                          ? 'bg-[var(--color-accent-dim)] font-bold text-[var(--color-accent)]'
                          : ''
                      }
                    >
                      {mode.label}
                    </Button>
                  ))}
                  {!BODY_METHODS.has(method) && (
                    <span className="ml-2 text-2xs text-[var(--color-text-muted)]">
                      Body not available for {method}
                    </span>
                  )}
                </div>
                {showBody ? (
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <Editor
                      theme={monacoTheme}
                      language={bodyEditorLang}
                      value={body}
                      onChange={(v) => updateDraft({ body: v ?? '' })}
                      options={monacoOptions}
                    />
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    <EmptyState
                      icon={CodeIcon}
                      size="sm"
                      title={bodyMode === 'none' ? 'Body is disabled' : `No body for ${method}`}
                      description={
                        bodyMode === 'none'
                          ? 'Pick JSON or Text above to send a request body.'
                          : `${method} requests do not include a body.`
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Response panel ────────────────────────────────── */}
          {responseVisible && (
            <section
              id={responsePaneId}
              aria-label="Response"
              className="flex min-h-0 min-w-0 flex-col overflow-hidden"
            >
              {error && (
                <Alert
                  variant="error"
                  className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
                >
                  {error}
                </Alert>
              )}
              {response && (
                <>
                  <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5">
                    <StatusBadge
                      variant={response.status < 400 ? 'success' : 'error'}
                      className="font-mono"
                    >
                      {response.status} {response.statusText}
                    </StatusBadge>
                    <span className="text-2xs text-[var(--color-text-muted)]">
                      {response.time}ms
                    </span>
                    <span className="text-2xs text-[var(--color-text-muted)]">
                      {formatSize(response.size)}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <CopyButton text={prettyBody} />
                      <Button
                        type="button"
                        variant="icon"
                        size="xs"
                        onClick={() => void handleSaveResponse()}
                        title="Save response to a file (⌘S)"
                        aria-label="Save response to a file"
                      >
                        <DownloadSimpleIcon size={13} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <TabBar
                    tabs={RESPONSE_TABS}
                    activeTab={responseTab}
                    onTabChange={setResponseTab}
                  />
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {responseTab === 'body' ? (
                      <Editor
                        theme={monacoTheme}
                        language={responseLanguage}
                        value={prettyBody}
                        onMount={handleResponseEditorMount}
                        options={{ ...monacoOptions, readOnly: true }}
                      />
                    ) : (
                      <div className="h-full overflow-auto p-3">
                        {Object.entries(response.headers).map(([key, value]) => (
                          <div key={key} className="mb-1 flex items-start gap-1 text-xs">
                            <span className="shrink-0 font-bold text-[var(--color-accent)]">
                              {key}
                            </span>
                            <span className="text-[var(--color-text-muted)]">: </span>
                            <span className="break-all text-[var(--color-text)]">{value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              {!response && !error && !loading && (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <EmptyState
                    icon={PaperPlaneTiltIcon}
                    title="Send a request to see the response"
                    description="⌘↵ sends the current request."
                  />
                </div>
              )}
              {loading && (
                <div
                  className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]"
                  role="status"
                >
                  <Spinner size="md" label="Sending request" />
                  Sending request…
                </div>
              )}
            </section>
          )}
        </div>
      </ToolLayout>

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
    </div>
  )
}
