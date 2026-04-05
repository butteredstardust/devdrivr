import { useState, useMemo, useCallback, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { TabBar } from '@/components/shared/TabBar'
import { Alert } from '@/components/shared/Alert'
import CsvTable from './CsvTable'
import CsvConvert from './CsvConvert'
import CsvAnalyze from './CsvAnalyze'
import type { Delimiter } from './utils'
import { parseCsv, detectDelimiter } from './utils'

type CsvToolsState = {
  input: string
  activeTab: 'view' | 'convert' | 'analyze'
  delimiter: Delimiter
  hasHeader: boolean
  jsonOutputFormat: 'array-of-objects' | 'object-of-arrays'
}

const TABS = [
  { id: 'view', label: 'View & Edit' },
  { id: 'convert', label: 'Convert' },
  { id: 'analyze', label: 'Analyze' },
]

export default function CsvTools() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const [state, updateState] = useToolState<CsvToolsState>('csv-tools', {
    input: '',
    activeTab: 'view',
    delimiter: 'auto',
    hasHeader: true,
    jsonOutputFormat: 'array-of-objects',
  })

  const { record } = useToolHistory({ toolId: 'csv-tools' })
  const [parseError, setParseError] = useState<string | null>(null)

  // Parse CSV on input change
  const parsed = useMemo(() => {
    if (!state.input.trim()) return null

    try {
      const delimiter =
        state.delimiter === 'auto' ? detectDelimiter(state.input) : state.delimiter

      const result = parseCsv(state.input, delimiter, state.hasHeader)

      if (result.errors.length > 0 && result.errors[0]) {
        setParseError(result.errors[0].message)
      } else {
        setParseError(null)
      }

      return {
        data: result.data as Record<string, unknown>[],
        meta: result.meta,
      }
    } catch (error) {
      setParseError((error as Error).message)
      return null
    }
  }, [state.input, state.delimiter, state.hasHeader])

  // Calculate stats for display
  const stats = useMemo(() => {
    if (!parsed || parsed.data.length === 0) return null

    const cols = Object.keys(parsed.data[0] ?? {}).length
    const rows = parsed.data.length
    const bytes = new Blob([state.input]).size
    const size = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`

    return { cols, rows, size }
  }, [parsed, state.input])

  // Record history when CSV is parsed successfully
  useEffect(() => {
    if (parsed && state.input.trim()) {
      record({
        input: `CSV (${stats?.cols} cols, ${stats?.rows} rows)`,
        output: state.input.slice(0, 500),
        subTab: state.activeTab,
        success: true,
      })
    }
  }, [parsed, state.input, state.activeTab, stats, record])

  const handleInputChange = useCallback(
    (value: string | undefined) => {
      updateState({ input: value ?? '' })
    },
    [updateState]
  )

  return (
    <div className="flex h-full flex-col">
      {/* Global toolbar */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <select
          value={state.delimiter}
          onChange={(e) => updateState({ delimiter: e.target.value as Delimiter })}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
        >
          <option value="auto">Auto-detect</option>
          <option value=",">Comma</option>
          <option value="&#9;">Tab</option>
          <option value="|">Pipe</option>
          <option value=";">Semicolon</option>
        </select>

        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={state.hasHeader}
            onChange={(e) => updateState({ hasHeader: e.target.checked })}
          />
          <span className="text-xs">Header row</span>
        </label>

        {stats && (
          <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
            {stats.cols} cols · {stats.rows} rows · {stats.size}
          </span>
        )}
      </div>

      <TabBar
        tabs={TABS}
        activeTab={state.activeTab}
        onTabChange={(id) => updateState({ activeTab: id as CsvToolsState['activeTab'] })}
      />

      {/* Error display */}
      {parseError && (
        <Alert
          variant="error"
          className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          Parse error: {parseError}
        </Alert>
      )}

      {/* Empty state */}
      {!state.input.trim() && (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
          Paste CSV or open a file
        </div>
      )}

      {/* Tab content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Input editor — always visible as left pane when there's content, or full width for empty state */}
        {state.input.trim() ? (
          <>
            <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
              <Editor
                theme={monacoTheme}
                language="plaintext"
                value={state.input}
                onChange={handleInputChange}
                options={monacoOptions}
              />
            </div>
            <div className="flex w-1/2 flex-col overflow-hidden">
              {state.activeTab === 'view' && parsed && <CsvTable data={parsed.data} />}
              {state.activeTab === 'convert' && parsed && (
                <CsvConvert
                  csvText={state.input}
                  delimiter={state.delimiter}
                  hasHeader={state.hasHeader}
                  outputFormat={state.jsonOutputFormat}
                  onOutputFormatChange={(format) => updateState({ jsonOutputFormat: format })}
                />
              )}
              {state.activeTab === 'analyze' && parsed && <CsvAnalyze data={parsed.data} />}
            </div>
          </>
        ) : (
          <div className="flex-1">
            <Editor
              theme={monacoTheme}
              language="plaintext"
              value={state.input}
              onChange={handleInputChange}
              options={{ ...monacoOptions, renderWhitespace: 'all' as const }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
