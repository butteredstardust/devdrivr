import { useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { useToolAction } from '@/hooks/useToolAction'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

type Header = { key: string; value: string; enabled: boolean }

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
}

const RESPONSE_TABS = [
  { id: 'body', label: 'Body' },
  { id: 'headers', label: 'Headers' },
]

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
  const [responseTab, setResponseTab] = useState('body')

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

      const opts: RequestInit = {
        method: state.method,
        headers,
      }
      if (state.method !== 'GET' && state.method !== 'HEAD' && state.body.trim()) {
        opts.body = state.body
      }

      const res = await tauriFetch(state.url, opts)
      const time = Math.round(performance.now() - start)
      const body = await res.text()

      const resHeaders: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        resHeaders[key] = value
      })

      setResponse({ status: res.status, statusText: res.statusText, headers: resHeaders, body, time })
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

  const addHeader = useCallback(() => {
    updateState({ headers: [...state.headers, { key: '', value: '', enabled: true }] })
  }, [state.headers, updateState])

  const updateHeader = useCallback((index: number, patch: Partial<Header>) => {
    const headers = state.headers.map((h, i) => (i === index ? { ...h, ...patch } : h))
    updateState({ headers })
  }, [state.headers, updateState])

  const removeHeader = useCallback((index: number) => {
    updateState({ headers: state.headers.filter((_, i) => i !== index) })
  }, [state.headers, updateState])

  // Try to prettify JSON response
  const prettyBody = (() => {
    if (!response?.body) return ''
    try {
      return JSON.stringify(JSON.parse(response.body), null, 2)
    } catch {
      return response.body
    }
  })()

  return (
    <div className="flex h-full flex-col">
      {/* URL bar */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <select
          value={state.method}
          onChange={(e) => updateState({ method: e.target.value })}
          className="rounded border border-[var(--color-accent)] bg-[var(--color-surface)] px-2 py-1.5 font-pixel text-xs text-[var(--color-accent)] outline-none"
        >
          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          value={state.url}
          onChange={(e) => updateState({ url: e.target.value })}
          placeholder="https://api.example.com/endpoint"
          className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="rounded border border-[var(--color-accent)] px-4 py-1.5 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-50"
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Request panel */}
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          {/* Headers */}
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-pixel text-xs text-[var(--color-text-muted)]">Headers</span>
              <button onClick={addHeader} className="text-xs text-[var(--color-accent)] hover:underline">+ Add</button>
            </div>
            <div className="max-h-32 overflow-auto">
              {state.headers.map((h, i) => (
                <div key={i} className="mb-1 flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={h.enabled}
                    onChange={(e) => updateHeader(i, { enabled: e.target.checked })}
                    className="accent-[var(--color-accent)]"
                  />
                  <input
                    value={h.key}
                    onChange={(e) => updateHeader(i, { key: e.target.value })}
                    placeholder="Key"
                    className="w-28 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs text-[var(--color-text)] outline-none"
                  />
                  <input
                    value={h.value}
                    onChange={(e) => updateHeader(i, { value: e.target.value })}
                    placeholder="Value"
                    className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs text-[var(--color-text)] outline-none"
                  />
                  <button onClick={() => removeHeader(i)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]">×</button>
                </div>
              ))}
            </div>
          </div>
          {/* Body */}
          <div className="flex-1">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              Body
            </div>
            <Editor
              language="json"
              value={state.body}
              onChange={(v) => updateState({ body: v ?? '' })}
              options={EDITOR_OPTIONS}
            />
          </div>
        </div>

        {/* Response panel */}
        <div className="flex w-1/2 flex-col">
          {error && (
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
              {error}
            </div>
          )}
          {response && (
            <>
              <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-1">
                <span className={`font-mono text-sm font-bold ${response.status < 400 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                  {response.status} {response.statusText}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">{response.time}ms</span>
                <div className="ml-auto">
                  <CopyButton text={prettyBody} />
                </div>
              </div>
              <TabBar tabs={RESPONSE_TABS} activeTab={responseTab} onTabChange={setResponseTab} />
              <div className="flex-1 overflow-auto">
                {responseTab === 'body' ? (
                  <Editor
                    language="json"
                    value={prettyBody}
                    options={{ ...EDITOR_OPTIONS, readOnly: true }}
                  />
                ) : (
                  <div className="p-3">
                    {Object.entries(response.headers).map(([key, value]) => (
                      <div key={key} className="mb-1 text-xs">
                        <span className="text-[var(--color-accent)]">{key}</span>
                        <span className="text-[var(--color-text-muted)]">: </span>
                        <span className="text-[var(--color-text)]">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {!response && !error && (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
              Send a request to see the response
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
