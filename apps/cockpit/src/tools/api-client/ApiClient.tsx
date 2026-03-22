import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { useToolAction } from '@/hooks/useToolAction'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

type Header = { key: string; value: string; enabled: boolean }
type Param = { key: string; value: string }

type ApiClientState = {
  method: string
  url: string
  headers: Header[]
  body: string
  bodyMode: string
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApiClient() {
  useMonacoTheme()
  const [state, updateState] = useToolState<ApiClientState>('api-client', {
    method: 'GET',
    url: '',
    headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
    body: '',
    bodyMode: 'json',
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestTab, setRequestTab] = useState('params')
  const [responseTab, setResponseTab] = useState('body')

  // ---------------------------------------------------------------------------
  // Query params — derived from URL, synced back on edit
  // ---------------------------------------------------------------------------

  const [params, setParams] = useState<Param[]>(() => parseQueryParams(state.url))
  const urlRef = useRef(state.url)

  // Sync URL → params when the URL bar is typed in
  useEffect(() => {
    if (state.url !== urlRef.current) {
      urlRef.current = state.url
      setParams(parseQueryParams(state.url))
    }
  }, [state.url])

  const commitParams = useCallback(
    (newParams: Param[]) => {
      setParams(newParams)
      const newUrl = buildUrlWithParams(state.url, newParams.filter((p) => p.key.trim()))
      urlRef.current = newUrl
      updateState({ url: newUrl })
    },
    [state.url, updateState]
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
    if (!state.url.trim()) {
      setLastAction('Enter a URL', 'error')
      return
    }

    setLoading(true)
    setError(null)
    const start = performance.now()

    try {
      const headers: Record<string, string> = {}
      for (const h of state.headers) {
        if (h.enabled && h.key.trim()) {
          headers[h.key] = h.value
        }
      }

      const opts: RequestInit = { method: state.method, headers }
      if (BODY_METHODS.has(state.method) && state.bodyMode !== 'none' && state.body.trim()) {
        opts.body = state.body
      }

      const res = await tauriFetch(state.url, opts)
      const time = Math.round(performance.now() - start)
      const body = await res.text()
      const size = new Blob([body]).size

      const resHeaders: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        resHeaders[key] = value
      })

      setResponse({ status: res.status, statusText: res.statusText, headers: resHeaders, body, time, size })
      setLastAction(`${res.status} ${res.statusText} (${time}ms)`, res.ok ? 'success' : 'error')
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      setLastAction('Request failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [state, setLastAction])

  useToolAction((action) => {
    if (action.type === 'execute') handleSend()
  })

  useKeyboardShortcut({ key: 'Enter', mod: true }, handleSend)

  // ---------------------------------------------------------------------------
  // Header management
  // ---------------------------------------------------------------------------

  const addHeader = useCallback(() => {
    updateState({ headers: [...state.headers, { key: '', value: '', enabled: true }] })
  }, [state.headers, updateState])

  const updateHeader = useCallback(
    (index: number, patch: Partial<Header>) => {
      const headers = state.headers.map((h, i) => (i === index ? { ...h, ...patch } : h))
      updateState({ headers })
    },
    [state.headers, updateState]
  )

  const removeHeader = useCallback(
    (index: number) => {
      updateState({ headers: state.headers.filter((_, i) => i !== index) })
    },
    [state.headers, updateState]
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

  const showBody = BODY_METHODS.has(state.method) && state.bodyMode !== 'none'
  const bodyEditorLang = state.bodyMode === 'json' ? 'json' : 'plaintext'
  const activeHeaderCount = state.headers.filter((h) => h.enabled && h.key.trim()).length

  return (
    <div className="flex h-full flex-col">
      {/* URL bar */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <select
          value={state.method}
          onChange={(e) => updateState({ method: e.target.value })}
          className="rounded border border-[var(--color-accent)] bg-[var(--color-surface)] px-2 py-1.5 font-pixel text-xs text-[var(--color-accent)] outline-none"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          value={state.url}
          onChange={(e) => updateState({ url: e.target.value })}
          placeholder="https://api.example.com/endpoint"
          className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend()
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="rounded border border-[var(--color-accent)] px-4 py-1.5 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
        <span className="text-[10px] text-[var(--color-text-muted)]">⌘↵</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Request panel ─────────────────────────────────── */}
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <TabBar tabs={REQUEST_TABS} activeTab={requestTab} onTabChange={setRequestTab} />

          {/* Params tab */}
          {requestTab === 'params' && (
            <div className="flex-1 overflow-auto p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-pixel text-xs text-[var(--color-text-muted)]">
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
                      <input
                        value={p.key}
                        onChange={(e) => updateParam(i, { key: e.target.value })}
                        placeholder="Key"
                        className="w-1/3 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      />
                      <input
                        value={p.value}
                        onChange={(e) => updateParam(i, { value: e.target.value })}
                        placeholder="Value"
                        className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
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
                <span className="font-pixel text-xs text-[var(--color-text-muted)]">
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
                {state.headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={h.enabled}
                      onChange={(e) => updateHeader(i, { enabled: e.target.checked })}
                      className="accent-[var(--color-accent)]"
                    />
                    <input
                      value={h.key}
                      onChange={(e) => updateHeader(i, { key: e.target.value })}
                      placeholder="Header name"
                      className="w-1/3 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                    />
                    <input
                      value={h.value}
                      onChange={(e) => updateHeader(i, { value: e.target.value })}
                      placeholder="Value"
                      className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
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

          {/* Body tab */}
          {requestTab === 'body' && (
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1">
                {BODY_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => updateState({ bodyMode: mode.id })}
                    className={`text-xs ${
                      state.bodyMode === mode.id
                        ? 'font-bold text-[var(--color-accent)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
                {!BODY_METHODS.has(state.method) && (
                  <span className="ml-2 text-[10px] text-[var(--color-text-muted)]">
                    Body not available for {state.method}
                  </span>
                )}
              </div>
              {showBody ? (
                <div className="flex-1">
                  <Editor
                    language={bodyEditorLang}
                    value={state.body}
                    onChange={(v) => updateState({ body: v ?? '' })}
                    options={EDITOR_OPTIONS}
                  />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-text-muted)]">
                  {state.bodyMode === 'none'
                    ? 'Body is disabled'
                    : `${state.method} requests do not include a body`}
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
              <TabBar
                tabs={RESPONSE_TABS}
                activeTab={responseTab}
                onTabChange={setResponseTab}
              />
              <div className="flex-1 overflow-auto">
                {responseTab === 'body' ? (
                  <Editor
                    language={responseLanguage}
                    value={prettyBody}
                    options={{ ...EDITOR_OPTIONS, readOnly: true }}
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
  )
}
