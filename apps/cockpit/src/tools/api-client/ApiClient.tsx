import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { Button } from '@/components/shared/Button'
import { Input, Select } from '@/components/shared/Input'
import { useUiStore } from '@/stores/ui.store'
import { useToolAction } from '@/hooks/useToolAction'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useApiStore } from '@/stores/api.store'
import { EnvironmentModal } from './components/EnvironmentModal'
import { AuthTab } from './components/AuthTab'
import { CollectionsSidebar } from './components/CollectionsSidebar'
import { SaveRequestModal } from './components/SaveRequestModal'
import type { ApiRequest, ApiRequestAuth, ApiHeader } from '@/types/models'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

function isValidAuth(val: unknown): val is ApiRequestAuth {
  if (!val || typeof val !== 'object') return false
  const obj = val as Record<string, unknown>
  if (obj['type'] === 'none') return true
  if (obj['type'] === 'bearer' && typeof obj['token'] === 'string') return true
  if (
    obj['type'] === 'basic' &&
    typeof obj['username'] === 'string' &&
    typeof obj['password'] === 'string'
  )
    return true
  return false
}

type Param = { key: string; value: string }

type ApiClientState = {
  activeRequestId: string | null
  // We keep a working draft independent of the saved request
  draft: {
    name: string
    method: string
    url: string
    headers: ApiHeader[]
    body: string
    bodyMode: string
    auth: ApiRequestAuth
  }
}

type ResponseData = {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  time: number
  size: number
}

const REQUEST_TABS = [
  { id: 'params', label: 'Params' },
  { id: 'headers', label: 'Headers' },
  { id: 'auth', label: 'Auth' },
  { id: 'body', label: 'Body' },
]

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

function parseQueryParams(url: string): Param[] {
  try {
    const u = new URL(url)
    const params: Param[] = []
    u.searchParams.forEach((value, key) => {
      params.push({ key, value })
    })
    return params
  } catch {
    return []
  }
}

function buildUrlWithParams(url: string, params: Param[]): string {
  try {
    const u = new URL(url)
    const pairs = params
      .filter((p) => p.key.trim())
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    u.search = pairs.length > 0 ? `?${pairs.join('&')}` : ''
    return u.toString()
  } catch {
    return url
  }
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApiClient() {
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
  const addRequestHistory = useApiStore((s) => s.addRequestHistory)
  useEffect(() => {
    init()
  }, [init])

  const [state, updateState] = useToolState<ApiClientState>('api-client', {
    activeRequestId: null,
    draft: {
      name: 'Untitled Request',
      method: 'GET',
      url: '',
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      body: '',
      bodyMode: 'json',
      auth: { type: 'none' },
    },
  })

  // Destructure draft for convenience
  const { method, url, headers, body, bodyMode, auth, name } = state.draft

  const updateDraft = useCallback(
    (patch: Partial<ApiClientState['draft']>) => {
      updateState({ draft: { ...state.draft, ...patch } })
    },
    [state.draft, updateState]
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestTab, setRequestTab] = useState('params')
  const [responseTab, setResponseTab] = useState('body')
  const [showEnvModal, setShowEnvModal] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveMode, setSaveMode] = useState<'save' | 'save-as'>('save-as')

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
  const envVars = activeEnv?.variables ?? {}

  // ---------------------------------------------------------------------------
  // Query params
  // ---------------------------------------------------------------------------

  const [params, setParams] = useState<Param[]>(() => parseQueryParams(url))
  const urlRef = useRef(url)

  useEffect(() => {
    if (url !== urlRef.current) {
      urlRef.current = url
      setParams(parseQueryParams(url))
    }
  }, [url])

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
        fetchHeaders['Authorization'] = `Basic ${btoa(`${u}:${p}`)}`
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
      setError(msg)
      setLastAction('Request failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [url, method, headers, body, bodyMode, auth, envVars, setLastAction, addRequestHistory])

  useToolAction((action) => {
    if (action.type === 'execute') handleSend()
  })

  useKeyboardShortcut({ key: 'Enter', mod: true }, handleSend)

  // ---------------------------------------------------------------------------
  // New Request
  // ---------------------------------------------------------------------------

  const handleNewRequest = useCallback(() => {
    updateState({
      activeRequestId: null,
      draft: {
        name: 'Untitled Request',
        method: 'GET',
        url: '',
        headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
        body: '',
        bodyMode: 'json',
        auth: { type: 'none' },
      },
    })
    setResponse(null)
    setError(null)
  }, [updateState])

  // ---------------------------------------------------------------------------
  // Save Request logic
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(() => {
    if (state.activeRequestId) {
      setSaveMode('save')
    } else {
      setSaveMode('save-as')
    }
    setShowSaveModal(true)
  }, [state.activeRequestId])

  const handleSaveAs = useCallback(() => {
    setSaveMode('save-as')
    setShowSaveModal(true)
  }, [])

  const handleSaveModalSubmit = useCallback(
    async (reqName: string, collectionIdOrNewName: string | null, isNew: boolean) => {
      setShowSaveModal(false)

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
    },
    [
      saveMode,
      state.activeRequestId,
      state.draft,
      requests,
      collections,
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

  const handleExport = useCallback(async () => {
    try {
      const exportData = requests.map((r) => ({
        name: r.name,
        method: r.method,
        url: r.url,
        headers: r.headers,
        body: r.body,
        bodyMode: r.bodyMode,
        auth: r.auth,
        collectionId: r.collectionId,
      }))
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
      setLastAction(`Exported ${exportData.length} requests to clipboard`, 'success')
    } catch {
      setLastAction('Export failed — clipboard unavailable', 'error')
    }
  }, [requests, setLastAction])

  const handleImport = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed: unknown = JSON.parse(text)
      if (!Array.isArray(parsed)) {
        setLastAction('Import failed — paste a valid JSON array', 'error')
        return
      }
      let count = 0
      for (const item of parsed as Array<Record<string, unknown>>) {
        if (typeof item['name'] !== 'string' || typeof item['url'] !== 'string') continue
        await createRequest({
          name: item['name'],
          method: typeof item['method'] === 'string' ? item['method'] : 'GET',
          url: item['url'],
          headers: Array.isArray(item['headers']) ? (item['headers'] as ApiHeader[]) : [],
          body: typeof item['body'] === 'string' ? item['body'] : '',
          bodyMode: typeof item['bodyMode'] === 'string' ? item['bodyMode'] : 'none',
          auth: isValidAuth(item['auth']) ? item['auth'] : { type: 'none' },
          collectionId: typeof item['collectionId'] === 'string' ? item['collectionId'] : null,
        })
        count++
      }
      setLastAction(
        count > 0 ? `Imported ${count} requests` : 'No valid requests found',
        count > 0 ? 'success' : 'error'
      )
    } catch {
      setLastAction('Import failed — paste a valid JSON array', 'error')
    }
  }, [createRequest, setLastAction])

  const handleSelectLoadedRequest = (req: ApiRequest) => {
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
  }

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

  // ---------------------------------------------------------------------------
  // Response formatting
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const showBody = BODY_METHODS.has(method) && bodyMode !== 'none'
  const bodyEditorLang = bodyMode === 'json' ? 'json' : 'plaintext'
  const activeHeaderCount = headers.filter((h) => h.enabled && h.key.trim()).length

  return (
    <div className="flex h-full flex-row overflow-hidden">
      <CollectionsSidebar
        activeRequestId={state.activeRequestId}
        onSelect={handleSelectLoadedRequest}
        onLoadFromHistory={(histMethod, histUrl) => {
          updateState({
            activeRequestId: null,
            draft: { ...state.draft, method: histMethod, url: histUrl, name: 'Untitled Request' },
          })
          setResponse(null)
          setError(null)
        }}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header Row for Env / Save */}
        <div className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-2 bg-[var(--color-surface)]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={handleNewRequest}
              title="New Request"
              className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-surface-hover)]"
            >
              + New
            </button>
            <span className="truncate font-bold text-sm text-[var(--color-text)]">{name}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">Env:</span>
            <Select
              value={activeEnvironmentId || ''}
              onChange={(e) => setActiveEnvironmentId(e.target.value || null)}
            >
              <option value="">No Environment</option>
              {environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
            <button
              onClick={() => setShowEnvModal(true)}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Edit
            </button>
          </div>

          <div className="flex items-center gap-2 border-l border-[var(--color-border)] pl-4">
            <Button variant="secondary" size="sm" onClick={handleSave}>
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={handleSaveAs}>
              Save As
            </Button>
          </div>

          <div className="flex items-center gap-2 border-l border-[var(--color-border)] pl-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleImport}
              title="Import requests from clipboard (JSON)"
            >
              Import
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              title="Export all requests to clipboard (JSON)"
            >
              Export
            </Button>
          </div>
        </div>

        {/* URL bar */}
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
          <select
            value={method}
            onChange={(e) => updateDraft({ method: e.target.value })}
            className="rounded border border-[var(--color-accent)] bg-[var(--color-surface)] px-2 py-1.5 font-mono text-xs text-[var(--color-accent)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <Input
            value={url}
            onChange={(e) => updateDraft({ url: e.target.value })}
            placeholder="{{baseUrl}}/endpoint"
            size="md"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend()
            }}
          />
          <Button variant="primary" size="sm" onClick={handleSend} disabled={loading}>
            {loading ? 'Sending…' : 'Send'}
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Request panel ─────────────────────────────────── */}
          <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
            <TabBar tabs={REQUEST_TABS} activeTab={requestTab} onTabChange={setRequestTab} />

            {/* Params tab */}
            {requestTab === 'params' && (
              <div className="flex-1 overflow-auto p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-[var(--color-text-muted)]">
                    Query Parameters
                    {params.length > 0 && (
                      <span className="ml-1 text-[var(--color-text)]">({params.length})</span>
                    )}
                  </span>
                  <button
                    onClick={addParam}
                    className="text-xs text-[var(--color-accent)] hover:underline"
                  >
                    + Add
                  </button>
                </div>
                {params.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {params.map((p, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Input
                          value={p.key}
                          onChange={(e) => updateParam(i, { key: e.target.value })}
                          placeholder="Key"
                          className="w-1/3"
                        />
                        <Input
                          value={p.value}
                          onChange={(e) => updateParam(i, { value: e.target.value })}
                          placeholder="Value"
                          className="flex-1"
                        />
                        <button
                          onClick={() => removeParam(i)}
                          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[var(--color-text-muted)]">
                    No query parameters. Add them here or include them in the URL.
                  </div>
                )}
              </div>
            )}

            {/* Headers tab */}
            {requestTab === 'headers' && (
              <div className="flex-1 overflow-auto p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-[var(--color-text-muted)]">
                    Headers
                    {activeHeaderCount > 0 && (
                      <span className="ml-1 text-[var(--color-text)]">({activeHeaderCount})</span>
                    )}
                  </span>
                  <button
                    onClick={addHeader}
                    className="text-xs text-[var(--color-accent)] hover:underline"
                  >
                    + Add
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {headers.map((h, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={h.enabled}
                        onChange={(e) => updateHeader(i, { enabled: e.target.checked })}
                        className="accent-[var(--color-accent)]"
                      />
                      <Input
                        value={h.key}
                        onChange={(e) => updateHeader(i, { key: e.target.value })}
                        placeholder="Header name"
                        className="w-1/3"
                      />
                      <Input
                        value={h.value}
                        onChange={(e) => updateHeader(i, { value: e.target.value })}
                        placeholder="Value (or {{env_var}})"
                        className="flex-1"
                      />
                      <button
                        onClick={() => removeHeader(i)}
                        className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Auth tab */}
            {requestTab === 'auth' && (
              <AuthTab auth={auth} onChange={(a) => updateDraft({ auth: a })} />
            )}

            {/* Body tab */}
            {requestTab === 'body' && (
              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1">
                  {BODY_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => updateDraft({ bodyMode: mode.id })}
                      className={`text-xs ${
                        bodyMode === mode.id
                          ? 'font-bold text-[var(--color-accent)]'
                          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                  {!BODY_METHODS.has(method) && (
                    <span className="ml-2 text-[10px] text-[var(--color-text-muted)]">
                      Body not available for {method}
                    </span>
                  )}
                </div>
                {showBody ? (
                  <div className="flex-1">
                    <Editor
                      theme={monacoTheme}
                      language={bodyEditorLang}
                      value={body}
                      onChange={(v) => updateDraft({ body: v ?? '' })}
                      options={monacoOptions}
                    />
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-text-muted)]">
                    {bodyMode === 'none'
                      ? 'Body is disabled'
                      : `${method} requests do not include a body`}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Response panel ────────────────────────────────── */}
          <div className="flex w-1/2 flex-col">
            {error && (
              <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
                {error}
              </div>
            )}
            {response && (
              <>
                <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-1">
                  <span
                    className={`font-mono text-sm font-bold ${
                      response.status < 400
                        ? 'text-[var(--color-success)]'
                        : 'text-[var(--color-error)]'
                    }`}
                  >
                    {response.status} {response.statusText}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">{response.time}ms</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {formatSize(response.size)}
                  </span>
                  <div className="ml-auto">
                    <CopyButton text={prettyBody} />
                  </div>
                </div>
                <TabBar tabs={RESPONSE_TABS} activeTab={responseTab} onTabChange={setResponseTab} />
                <div className="flex-1 overflow-auto">
                  {responseTab === 'body' ? (
                    <Editor
                      theme={monacoTheme}
                      language={responseLanguage}
                      value={prettyBody}
                      options={{ ...monacoOptions, readOnly: true }}
                    />
                  ) : (
                    <div className="p-3">
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
              <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
                Send a request to see the response
              </div>
            )}
            {loading && (
              <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
                Sending request…
              </div>
            )}
          </div>
        </div>
      </div>

      {showEnvModal && <EnvironmentModal onClose={() => setShowEnvModal(false)} />}
      {showSaveModal && (
        <SaveRequestModal
          mode={saveMode}
          initialName={name}
          initialCollectionId={saveModalInitialCollectionId}
          collections={collections}
          onSave={handleSaveModalSubmit}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  )
}
