import { useCallback, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { Button } from '@/components/shared/Button'
import { Alert } from '@/components/shared/Alert'
import { Input } from '@/components/shared/Input'
import { useUiStore } from '@/stores/ui.store'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'

type JsonToolsState = {
  input: string
  activeTab: string
  query: string
}

const TABS = [
  { id: 'lint', label: 'Lint & Format' },
  { id: 'tree', label: 'Tree View' },
  { id: 'table', label: 'Table View' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortKeysDeep(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(sortKeysDeep)
  if (data !== null && typeof data === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(data as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((data as Record<string, unknown>)[key])
    }
    return sorted
  }
  return data
}

function jsonStats(data: unknown): { keys: number; depth: number; size: string } {
  let keyCount = 0
  let maxDepth = 0

  function walk(val: unknown, depth: number) {
    if (depth > maxDepth) maxDepth = depth
    if (Array.isArray(val)) {
      for (const item of val) walk(item, depth + 1)
    } else if (val !== null && typeof val === 'object') {
      const entries = Object.entries(val as Record<string, unknown>)
      keyCount += entries.length
      for (const [, v] of entries) walk(v, depth + 1)
    }
  }

  walk(data, 0)
  const bytes = new Blob([JSON.stringify(data)]).size
  const size = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
  return { keys: keyCount, depth: maxDepth, size }
}

function queryJsonPath(data: unknown, path: string): unknown {
  if (!path.trim()) return undefined
  const parts = path
    .replace(/^\$\.?/, '') // strip leading $. or $
    .replace(/\[(\d+)\]/g, '.$1') // arr[0] → arr.0
    .split('.')
    .filter(Boolean)
  if (parts.length === 0) return data

  let current: unknown = data
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JsonTools() {
  const monacoTheme = useMonacoTheme()
  const [state, updateState] = useToolState<JsonToolsState>('json-tools', {
    input: '',
    activeTab: 'lint',
    query: '',
  })

  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    ['format', 'detectLanguage', 'getSupportedLanguages']
  )
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)
  const [isFormatting, setIsFormatting] = useState(false)
  const formattingRef = useRef(false)

  // Tree view expand/collapse state
  const [treeKey, setTreeKey] = useState(0)
  const [treeExpanded, setTreeExpanded] = useState(true)

  // Parse input
  const parsed = useMemo(() => {
    if (!state.input.trim()) return { ok: false as const, data: null, error: null }
    try {
      return { ok: true as const, data: JSON.parse(state.input) as unknown, error: null }
    } catch (e) {
      return { ok: false as const, data: null, error: (e as Error).message }
    }
  }, [state.input])

  // Stats (only computed when valid)
  const stats = useMemo(() => {
    if (!parsed.ok) return null
    return jsonStats(parsed.data)
  }, [parsed])

  // Query result
  const queryResult = useMemo(() => {
    if (!parsed.ok || !state.query.trim()) return { hasResult: false as const }
    try {
      const result = queryJsonPath(parsed.data, state.query)
      if (result === undefined) return { hasResult: true as const, value: 'undefined', display: 'No match' }
      const display = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
      return { hasResult: true as const, value: display, display }
    } catch {
      return { hasResult: true as const, value: '', display: 'Invalid path' }
    }
  }, [parsed, state.query])

  // --- Actions ---

  const handleFormat = useCallback(async () => {
    if (!formatter || formattingRef.current) return
    formattingRef.current = true
    setIsFormatting(true)
    try {
      const result = await formatter.format(state.input, { language: 'json' })
      updateState({ input: result })
      setError(null)
      setLastAction('Formatted JSON', 'success')
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      setLastAction('Invalid JSON', 'error')
    } finally {
      formattingRef.current = false
      setIsFormatting(false)
    }
  }, [formatter, state.input, updateState, setLastAction])

  const handleMinify = useCallback(() => {
    if (!parsed.ok) return
    updateState({ input: JSON.stringify(parsed.data) })
    setError(null)
    setLastAction('Minified JSON', 'success')
  }, [parsed, updateState, setLastAction])

  const handleSortKeys = useCallback(() => {
    if (!parsed.ok) return
    const sorted = sortKeysDeep(parsed.data)
    updateState({ input: JSON.stringify(sorted, null, 2) })
    setError(null)
    setLastAction('Keys sorted', 'success')
  }, [parsed, updateState, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <TabBar
        tabs={TABS}
        activeTab={state.activeTab}
        onTabChange={(id) => updateState({ activeTab: id })}
      />
      <div className="flex-1 overflow-hidden">
        {/* ── Lint & Format ─────────────────────────────────── */}
        {state.activeTab === 'lint' && (
          <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleFormat}
                disabled={isFormatting}
              >
                {isFormatting ? 'Formatting…' : 'Format'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleMinify}
                disabled={!parsed.ok}
              >
                Minify
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSortKeys}
                disabled={!parsed.ok}
              >
                Sort Keys
              </Button>
              <CopyButton text={state.input} />
              <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />
              {parsed.ok && (
                <span className="text-xs text-[var(--color-success)]">✓ Valid</span>
              )}
              {parsed.error && (
                <span className="truncate text-xs text-[var(--color-error)]">
                  ✗ {parsed.error}
                </span>
              )}
              {stats && (
                <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
                  {stats.keys} keys · depth {stats.depth} · {stats.size}
                </span>
              )}
            </div>

            {/* Query bar */}
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-1.5">
              <span className="text-[10px] text-[var(--color-text-muted)]">Path</span>
              <Input
                value={state.query}
                onChange={(e) => updateState({ query: e.target.value })}
                placeholder="$.users[0].name"
                className="flex-1 font-mono"
              />
              {queryResult.hasResult && queryResult.value && (
                <CopyButton text={queryResult.value} />
              )}
            </div>
            {queryResult.hasResult && (
              <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
                <pre className="max-h-24 overflow-auto font-mono text-xs text-[var(--color-text)]">
                  {queryResult.display}
                </pre>
              </div>
            )}

            {/* Format error */}
            {error && (
              <Alert variant="error" className="border-b border-[var(--color-border)] rounded-none px-4 py-2">
                {error}
              </Alert>
            )}

            {/* Editor */}
            <div className="flex-1">
              <Editor
                theme={monacoTheme}
                language="json"
                value={state.input}
                onChange={(v) => updateState({ input: v ?? '' })}
                options={EDITOR_OPTIONS}
              />
            </div>
          </div>
        )}

        {/* ── Tree View ─────────────────────────────────────── */}
        {state.activeTab === 'tree' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTreeExpanded(true)
                  setTreeKey((k) => k + 1)
                }}
              >
                Expand All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTreeExpanded(false)
                  setTreeKey((k) => k + 1)
                }}
              >
                Collapse All
              </Button>
              {stats && (
                <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
                  {stats.keys} keys · depth {stats.depth}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4">
              {parsed.ok ? (
                <JsonTree
                  key={treeKey}
                  data={parsed.data}
                  path="$"
                  defaultExpanded={treeExpanded}
                />
              ) : (
                <div className="text-sm text-[var(--color-text-muted)]">
                  {parsed.error
                    ? `Parse error: ${parsed.error}`
                    : 'Enter JSON in the Lint & Format tab'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Table View ────────────────────────────────────── */}
        {state.activeTab === 'table' && (
          <div className="h-full overflow-auto p-4">
            {parsed.ok && Array.isArray(parsed.data) ? (
              <JsonTable data={parsed.data as Record<string, unknown>[]} />
            ) : (
              <div className="text-sm text-[var(--color-text-muted)]">
                {parsed.error
                  ? `Parse error: ${parsed.error}`
                  : parsed.ok
                    ? 'Table view requires a JSON array of objects'
                    : 'Enter JSON in the Lint & Format tab'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tree View
// ---------------------------------------------------------------------------

function JsonTree({
  data,
  path,
  defaultExpanded = true,
}: {
  data: unknown
  path: string
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const setLastAction = useUiStore((s) => s.setLastAction)

  const copyPath = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      navigator.clipboard.writeText(path)
      setLastAction(`Copied: ${path}`, 'success')
    },
    [path, setLastAction]
  )

  const copyValue = useCallback(
    (val: unknown) => {
      const text = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val ?? '')
      navigator.clipboard.writeText(text)
      setLastAction('Copied value', 'success')
    },
    [setLastAction]
  )

  if (data === null)
    return (
      <span
        className="cursor-pointer text-[var(--color-text-muted)] hover:underline"
        onClick={() => copyValue(null)}
        title="Click to copy"
      >
        null
      </span>
    )
  if (typeof data === 'boolean')
    return (
      <span
        className="cursor-pointer text-[var(--color-warning)] hover:underline"
        onClick={() => copyValue(data)}
        title="Click to copy"
      >
        {String(data)}
      </span>
    )
  if (typeof data === 'number')
    return (
      <span
        className="cursor-pointer text-[var(--color-accent)] hover:underline"
        onClick={() => copyValue(data)}
        title="Click to copy"
      >
        {data}
      </span>
    )
  if (typeof data === 'string')
    return (
      <span
        className="cursor-pointer text-[var(--color-success)] hover:underline"
        onClick={() => copyValue(data)}
        title="Click to copy"
      >
        &quot;{data}&quot;
      </span>
    )

  if (Array.isArray(data)) {
    return (
      <div className="ml-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          {expanded ? '▼' : '▶'}{' '}
          <span className="cursor-pointer text-xs hover:underline" onClick={copyPath}>
            [{data.length}]
          </span>
        </button>
        {expanded &&
          data.map((item, i) => (
            <div key={i} className="ml-4">
              <span className="text-[var(--color-text-muted)]">{i}: </span>
              <JsonTree data={item} path={`${path}[${i}]`} defaultExpanded={defaultExpanded} />
            </div>
          ))}
      </div>
    )
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    return (
      <div className="ml-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          {expanded ? '▼' : '▶'}{' '}
          <span className="cursor-pointer text-xs hover:underline" onClick={copyPath}>
            {`{${entries.length}}`}
          </span>
        </button>
        {expanded &&
          entries.map(([key, value]) => (
            <div key={key} className="ml-4">
              <span className="text-[var(--color-accent)]">&quot;{key}&quot;</span>
              <span className="text-[var(--color-text-muted)]">: </span>
              <JsonTree
                data={value}
                path={`${path}.${key}`}
                defaultExpanded={defaultExpanded}
              />
            </div>
          ))}
      </div>
    )
  }

  return <span>{String(data)}</span>
}

// ---------------------------------------------------------------------------
// Table View
// ---------------------------------------------------------------------------

function JsonTable({ data }: { data: Record<string, unknown>[] }) {
  const setLastAction = useUiStore((s) => s.setLastAction)

  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const row of data) {
      for (const key of Object.keys(row)) keys.add(key)
    }
    return Array.from(keys)
  }, [data])

  const copyCell = useCallback(
    (value: unknown) => {
      navigator.clipboard.writeText(
        typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
      )
      setLastAction('Copied cell', 'success')
    },
    [setLastAction]
  )

  if (data.length === 0)
    return <div className="text-sm text-[var(--color-text-muted)]">Empty array</div>

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left font-mono font-bold text-[var(--color-accent)]"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-[var(--color-surface-hover)]">
              {columns.map((col) => {
                const value = row[col]
                return (
                  <td
                    key={col}
                    onClick={() => copyCell(value)}
                    className="cursor-pointer border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                    title="Click to copy"
                  >
                    {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
