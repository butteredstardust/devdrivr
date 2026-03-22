import { useCallback, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'

type JsonToolsState = {
  input: string
  activeTab: string
}

const TABS = [
  { id: 'lint', label: 'Lint & Format' },
  { id: 'tree', label: 'Tree View' },
  { id: 'table', label: 'Table View' },
]

export default function JsonTools() {
  useMonacoTheme()
  const [state, updateState] = useToolState<JsonToolsState>('json-tools', {
    input: '',
    activeTab: 'lint',
  })

  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    ['format', 'detectLanguage', 'getSupportedLanguages']
  )
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)

  // Parse input for tree/table views
  const parsed = useMemo(() => {
    if (!state.input.trim()) return { ok: false as const, data: null, error: null }
    try {
      return { ok: true as const, data: JSON.parse(state.input) as unknown, error: null }
    } catch (e) {
      return { ok: false as const, data: null, error: (e as Error).message }
    }
  }, [state.input])

  const handleFormat = useCallback(async () => {
    if (!formatter) return
    try {
      const result = await formatter.format(state.input, { language: 'json' })
      updateState({ input: result })
      setError(null)
      setLastAction('Formatted JSON', 'success')
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      setLastAction('Invalid JSON', 'error')
    }
  }, [formatter, state.input, updateState, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <TabBar
        tabs={TABS}
        activeTab={state.activeTab}
        onTabChange={(id) => updateState({ activeTab: id })}
      />
      <div className="flex-1 overflow-hidden">
        {state.activeTab === 'lint' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
              <button
                onClick={handleFormat}
                className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
              >
                Format
              </button>
              <CopyButton text={state.input} />
              {parsed.ok && (
                <span className="text-xs text-[var(--color-success)]">✓ Valid JSON</span>
              )}
              {parsed.error && (
                <span className="text-xs text-[var(--color-error)]">✗ {parsed.error}</span>
              )}
            </div>
            {error && (
              <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
                {error}
              </div>
            )}
            <div className="flex-1">
              <Editor
                language="json"
                value={state.input}
                onChange={(v) => updateState({ input: v ?? '' })}
                options={EDITOR_OPTIONS}
              />
            </div>
          </div>
        )}

        {state.activeTab === 'tree' && (
          <div className="h-full overflow-auto p-4">
            {parsed.ok ? (
              <JsonTree data={parsed.data} path="$" />
            ) : (
              <div className="text-sm text-[var(--color-text-muted)]">
                {parsed.error ? `Parse error: ${parsed.error}` : 'Enter JSON in the Lint & Format tab'}
              </div>
            )}
          </div>
        )}

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

// --- Tree View Component ---

function JsonTree({ data, path }: { data: unknown; path: string }) {
  const [expanded, setExpanded] = useState(true)
  const setLastAction = useUiStore((s) => s.setLastAction)

  const copyPath = useCallback(() => {
    navigator.clipboard.writeText(path)
    setLastAction(`Copied: ${path}`, 'success')
  }, [path, setLastAction])

  if (data === null) return <span className="text-[var(--color-text-muted)]">null</span>
  if (typeof data === 'boolean') return <span className="text-[var(--color-warning)]">{String(data)}</span>
  if (typeof data === 'number') return <span className="text-[var(--color-accent)]">{data}</span>
  if (typeof data === 'string') return <span className="text-[var(--color-success)]">"{data}"</span>

  if (Array.isArray(data)) {
    return (
      <div className="ml-4">
        <button onClick={() => setExpanded(!expanded)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          {expanded ? '▼' : '▶'} <span className="cursor-pointer text-xs hover:underline" onClick={copyPath}>[{data.length}]</span>
        </button>
        {expanded && data.map((item, i) => (
          <div key={i} className="ml-4">
            <span className="text-[var(--color-text-muted)]">{i}: </span>
            <JsonTree data={item} path={`${path}[${i}]`} />
          </div>
        ))}
      </div>
    )
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    return (
      <div className="ml-4">
        <button onClick={() => setExpanded(!expanded)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          {expanded ? '▼' : '▶'} <span className="cursor-pointer text-xs hover:underline" onClick={copyPath}>{`{${entries.length}}`}</span>
        </button>
        {expanded && entries.map(([key, value]) => (
          <div key={key} className="ml-4">
            <span className="text-[var(--color-accent)]">"{key}"</span>
            <span className="text-[var(--color-text-muted)]">: </span>
            <JsonTree data={value} path={`${path}.${key}`} />
          </div>
        ))}
      </div>
    )
  }

  return <span>{String(data)}</span>
}

// --- Table View Component ---

function JsonTable({ data }: { data: Record<string, unknown>[] }) {
  const setLastAction = useUiStore((s) => s.setLastAction)

  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const row of data) {
      for (const key of Object.keys(row)) keys.add(key)
    }
    return Array.from(keys)
  }, [data])

  const copyCell = useCallback((value: unknown) => {
    navigator.clipboard.writeText(typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''))
    setLastAction('Copied cell', 'success')
  }, [setLastAction])

  if (data.length === 0) return <div className="text-sm text-[var(--color-text-muted)]">Empty array</div>

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} className="border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left font-mono font-bold text-[var(--color-accent)]">
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
