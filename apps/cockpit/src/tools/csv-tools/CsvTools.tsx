import { useRef, useMemo, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useToolAction } from '@/hooks/useToolAction'
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

  const { record } = useToolHistory({ toolId: 'csv-tools', debounceMs: 2000 })
  const lastRecordedInput = useRef('')

  // Parse CSV — derive both data and error without setState
  const parseResult = useMemo(() => {
    if (!state.input.trim()) return { data: null, error: null }

    try {
      const delimiter = state.delimiter === 'auto' ? detectDelimiter(state.input) : state.delimiter

      const result = parseCsv(state.input, delimiter, state.hasHeader)
      const error = result.errors.length > 0 && result.errors[0] ? result.errors[0].message : null

      return {
        data: { data: result.data, meta: result.meta },
        error,
      }
    } catch (error) {
      return { data: null, error: (error as Error).message }
    }
  }, [state.input, state.delimiter, state.hasHeader])

  const parsed = parseResult.data
  const parseError = parseResult.error

  // Calculate stats for display
  const stats = useMemo(() => {
    if (!parsed || parsed.data.length === 0) return null

    const cols = Object.keys(parsed.data[0] ?? {}).length
    const rows = parsed.data.length
    const bytes = new Blob([state.input]).size
    const size = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`

    return { cols, rows, size }
  }, [parsed, state.input])

  // Handle global tool actions (Cmd+Enter, file open, copy output)
  useToolAction(async (action) => {
    if (action.type === 'open-file') updateState({ input: action.content })
    if (action.type === 'copy-output' && parsed) {
      navigator.clipboard.writeText(JSON.stringify(parsed.data, null, 2))
    }
  })

  const handleInputChange = useCallback(
    (value: string | undefined) => {
      const input = value ?? ''
      updateState({ input })

      // Record history only on meaningful input changes (debounced via useToolHistory)
      if (input.trim() && input !== lastRecordedInput.current) {
        lastRecordedInput.current = input
        record({
          input: input.slice(0, 200),
          output: input.slice(0, 500),
          subTab: state.activeTab,
          success: true,
        })
      }
    },
    [updateState, record, state.activeTab]
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
