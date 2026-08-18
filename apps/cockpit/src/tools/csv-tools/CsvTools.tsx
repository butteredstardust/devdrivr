import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  ArrowUUpLeftIcon,
  CheckCircleIcon,
  CrosshairSimpleIcon,
  FileCsvIcon,
  FloppyDiskIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useToolAction } from '@/hooks/useToolAction'
import { useMonaco } from '@/hooks/useMonaco'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Select } from '@/components/shared/Select'
import { Toggle } from '@/components/shared/Toggle'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { useUiStore } from '@/stores/ui.store'
import { saveFileDialog } from '@/lib/file-io'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import CsvTable from './CsvTable'
import CsvConvert from './CsvConvert'
import CsvAnalyze, { type SchemaLanguage } from './CsvAnalyze'
import {
  DELIMITER_OPTIONS,
  FORMAT_EXTENSIONS,
  generateSql,
  generateTypeScript,
  outputFileName,
  parseCsv,
  summarizeColumns,
  toOutput,
  type CsvIssue,
  type CsvParse,
  type CsvRow,
  type Delimiter,
  type OutputFormat,
} from './csv-helpers'
import { formatTextBytes } from '@/lib/format'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

type CsvView = 'table' | 'convert' | 'analyze'

type CsvToolsState = {
  input: string
  fileName: string | null
  view: CsvView
  delimiter: Delimiter
  hasHeader: boolean
  /** Off keeps `007` and `+4420…` intact; on gives real numbers to the stats. */
  typed: boolean
  format: OutputFormat
  schemaLanguage: SchemaLanguage
}

const VIEW_OPTIONS = [
  { value: 'table' as const, label: 'Table' },
  { value: 'convert' as const, label: 'Convert' },
  { value: 'analyze' as const, label: 'Analyze' },
]

const EMPTY_PARSE = { columns: [] as string[], rows: [] as CsvRow[], issues: [] as CsvIssue[] }

const DELIMITER_LABELS: Record<string, string> = {
  ',': 'comma',
  '\t': 'tab',
  ';': 'semicolon',
  '|': 'pipe',
}

type OutputOptions = {
  view: CsvView
  format: OutputFormat
  schemaLanguage: SchemaLanguage
  fileName: string | null
}

/** `people.csv` → `people`: the table both the schema and the inserts name. */
function tableNameFrom(fileName: string | null): string {
  return (fileName ?? 'csv_data').replace(/\.[^./\\]+$/, '')
}

/**
 * The text the visible pane represents — what Copy and ⌘S act on.
 *
 * The table deliberately hands back the source itself: re-serialising the
 * parsed rows would drop the extra fields of a ragged row and rewrite `007`
 * as `7`, so saving a file you had only *looked* at could lose data.
 */
function outputFor(source: string, parse: CsvParse, options: OutputOptions): string {
  if (parse.status !== 'parsed' || options.view === 'table') return source
  const tableName = tableNameFrom(options.fileName)
  if (options.view === 'convert')
    return toOutput(parse.columns, parse.rows, options.format, tableName)
  const summaries = summarizeColumns(parse.columns, parse.rows)
  if (summaries.length === 0) return ''
  return options.schemaLanguage === 'sql'
    ? generateSql(summaries, tableName)
    : generateTypeScript(summaries)
}

export default function CsvTools() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const [state, updateState] = useToolState<CsvToolsState>('csv-tools', {
    input: '',
    fileName: null,
    view: 'table',
    delimiter: 'auto',
    hasHeader: true,
    typed: false,
    format: 'json-rows',
    schemaLanguage: 'typescript',
  })
  const { record } = useToolHistory({ toolId: 'csv-tools' })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()

  const { input, view, delimiter, hasHeader, typed, format, schemaLanguage } = state
  const inputRef = useRef(input)
  inputRef.current = input
  const hasInput = input.trim().length > 0

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  // Opening a file or loading the sample replaces whatever was in the buffer;
  // Monaco's own undo stack does not survive that, so the text is kept here.
  const [undoBuffer, setUndoBuffer] = useState<{
    input: string
    fileName: string | null
    label: string
  } | null>(null)

  // Parsing a multi-megabyte export on every keystroke costs a frame, and a
  // live region re-announcing the verdict per character is unusable.
  const [parseSource, setParseSource] = useState(input)
  useEffect(() => {
    const timer = setTimeout(() => setParseSource(input), 250)
    return () => clearTimeout(timer)
  }, [input])

  const parsed = useMemo<CsvParse>(
    () => parseCsv(parseSource, { delimiter, hasHeader, typed }),
    [parseSource, delimiter, hasHeader, typed]
  )
  // Memoised rather than re-derived per render: they are dependencies of the
  // conversion and analysis memos, which would otherwise recompute constantly.
  const { columns, rows, issues } = useMemo(
    () =>
      parsed.status === 'parsed'
        ? { columns: parsed.columns, rows: parsed.rows, issues: parsed.issues }
        : EMPTY_PARSE,
    [parsed]
  )

  const summaries = useMemo(
    // Only the Analyze pane reads these, and summarising walks every cell.
    () => (view === 'analyze' ? summarizeColumns(columns, rows) : []),
    [view, columns, rows]
  )
  const schema = useMemo(() => {
    if (view !== 'analyze' || summaries.length === 0) return ''
    const tableName = tableNameFrom(state.fileName)
    return schemaLanguage === 'sql'
      ? generateSql(summaries, tableName)
      : generateTypeScript(summaries)
  }, [view, summaries, schemaLanguage, state.fileName])

  const converted = useMemo(
    () =>
      view === 'convert' && parsed.status === 'parsed'
        ? // The same table the generated schema creates — inserts naming
          // `csv_data` while the DDL said `people` do not run together.
          toOutput(columns, rows, format, tableNameFrom(state.fileName))
        : '',
    [view, parsed.status, columns, rows, format, state.fileName]
  )

  const activeOutput = useMemo(() => {
    if (parsed.status !== 'parsed' || view === 'table') return input
    return view === 'convert' ? converted : schema
  }, [parsed.status, view, converted, schema, input])

  /**
   * The same thing, but re-derived when the 250 ms debounce has not caught up:
   * ⌘S immediately after a paste would otherwise write the previous parse.
   */
  const currentOutput = useCallback(() => {
    const source = inputRef.current
    const options = { view, format, schemaLanguage, fileName: state.fileName }
    if (source === parseSource) return activeOutput
    return outputFor(source, parseCsv(source, { delimiter, hasHeader, typed }), options)
  }, [
    activeOutput,
    parseSource,
    view,
    format,
    schemaLanguage,
    state.fileName,
    delimiter,
    hasHeader,
    typed,
  ])

  const activeExtension =
    view === 'convert'
      ? FORMAT_EXTENSIONS[format]
      : view === 'analyze'
        ? schemaLanguage === 'sql'
          ? 'sql'
          : 'ts'
        : 'csv'

  const status =
    parsed.status === 'empty'
      ? 'Nothing to parse yet'
      : `${rows.length} row${rows.length === 1 ? '' : 's'} · ${columns.length} column${
          columns.length === 1 ? '' : 's'
        } · ${DELIMITER_LABELS[parsed.delimiter] ?? 'comma'}-separated${
          delimiter === 'auto' ? ' (detected)' : ''
        } · ${formatTextBytes(parseSource)}${
          issues.length > 0 ? ` · ${issues.length} issue${issues.length === 1 ? '' : 's'}` : ''
        }`

  // --- Actions ---------------------------------------------------------

  // Only the user's own edits are history: restoring last session's buffer —
  // which arrives asynchronously, so it cannot be told apart by timing — and
  // switching panes must not write an entry.
  const userEdited = useRef(false)
  const lastRecorded = useRef<string | null>(null)
  useEffect(() => {
    if (parsed.status !== 'parsed' || !userEdited.current) return
    if (parseSource === lastRecorded.current) return
    lastRecorded.current = parseSource
    const summary = `${rows.length} rows × ${columns.length} columns`
    record({
      input: `CSV: ${parseSource.slice(0, 300)}${parseSource.length > 300 ? '...' : ''}`,
      output: summary,
      // A flagged file still parsed, so the summary has to stay in `output`;
      // `flushPending` replaces it with `error` when success is false.
      success: issues.length === 0,
      ...(issues.length > 0
        ? { error: `${summary}, ${issues.length} issue${issues.length === 1 ? '' : 's'}` }
        : {}),
    })
  }, [parsed.status, parseSource, rows.length, columns.length, issues.length, record])

  /** Replaces the buffer, keeping the previous text one click away. */
  const replaceInput = useCallback(
    (next: string, label: string, fileName: string | null) => {
      userEdited.current = true
      setUndoBuffer({ input: inputRef.current, fileName: state.fileName, label })
      updateState({ input: next, fileName })
    },
    [updateState, state.fileName]
  )

  const handleUndo = useCallback(() => {
    if (!undoBuffer) return
    // The name goes back too: otherwise ⌘S after an undo offers to overwrite
    // the file whose contents are no longer in the buffer.
    updateState({ input: undoBuffer.input, fileName: undoBuffer.fileName })
    setUndoBuffer(null)
    setLastAction('Reverted', 'info')
  }, [undoBuffer, updateState, setLastAction])

  const handleSave = useCallback(() => {
    const output = currentOutput()
    if (!output.trim()) {
      setLastAction('Nothing to save yet', 'info')
      return
    }
    void saveFileDialog(output, outputFileName(state.fileName, activeExtension)).then(
      (path) => setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
      (error: unknown) =>
        setLastAction(
          `Save failed: ${error instanceof Error ? error.message : String(error)}`,
          'error'
        )
    )
  }, [currentOutput, activeExtension, state.fileName, setLastAction])

  const handleLoadSample = useCallback(() => {
    const sample = TOOL_SAMPLES['csv-tools']
    if (!sample) return
    replaceInput(sample, 'Load sample', 'sample.csv')
    setLastAction('Loaded sample CSV', 'success')
  }, [replaceInput, setLastAction])

  // The issue list reports a line number; without this the user reads it and
  // then scrolls to find it by hand.
  const handleGoToIssue = useCallback(() => {
    const first = issues[0]
    const editor = editorRef.current
    if (!first || !editor) return
    const position = { lineNumber: first.line, column: 1 }
    editor.revealPositionInCenter(position)
    editor.setPosition(position)
    editor.focus()
  }, [issues])

  useToolAction((action) => {
    if (action.type === 'open-file') {
      replaceInput(action.content, `Open ${action.filename}`, action.filename)
      setLastAction(`Opened ${action.filename}`, 'success')
    }
    if (action.type === 'save-file') handleSave()
    if (action.type === 'copy-output') {
      const output = currentOutput()
      if (!output.trim()) {
        setLastAction('Nothing to copy yet', 'info')
        return
      }
      void copy(output, { success: 'Copied output', failure: 'Copy failed' })
    }
  })

  const handleInputChange = useCallback(
    (value: string | undefined) => {
      userEdited.current = true
      updateState({ input: value ?? '' })
      // Reverting to a snapshot taken before the last minutes of typing would
      // throw that typing away, so the offer expires on the first manual edit.
      setUndoBuffer(null)
    },
    [updateState]
  )

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <div className="border-b border-[var(--color-border)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <FileCsvIcon
                size={15}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)]"
              />
              <span className="font-ui truncate text-xs font-semibold text-[var(--color-text)]">
                {state.fileName ?? 'Untitled'}
              </span>
              <span
                role="status"
                aria-live="polite"
                className="flex min-w-0 items-center gap-1 text-2xs text-[var(--color-text-muted)]"
              >
                {parsed.status === 'parsed' && issues.length === 0 && (
                  <CheckCircleIcon
                    size={12}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--color-success)]"
                  />
                )}
                {issues.length > 0 && (
                  <WarningCircleIcon
                    size={12}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--color-warning)]"
                  />
                )}
                <span className="truncate">{status}</span>
              </span>
              {issues.length > 0 && issues[0] && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleGoToIssue}
                  title={`${issues[0].message} (line ${issues[0].line})`}
                  className="shrink-0 gap-1"
                >
                  <CrosshairSimpleIcon size={12} aria-hidden="true" />
                  Go to issue
                </Button>
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              <Select
                aria-label="Delimiter"
                value={delimiter}
                onChange={(e) => updateState({ delimiter: e.target.value as Delimiter })}
                className="w-32"
              >
                {DELIMITER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Toggle
                checked={hasHeader}
                onChange={(checked) => updateState({ hasHeader: checked })}
                label="Header row"
              />
              <Toggle
                checked={typed}
                onChange={(checked) => updateState({ typed: checked })}
                label="Typed values"
              />
              <SegmentedControl
                aria-label="View"
                value={view}
                onChange={(next) => updateState({ view: next })}
                options={VIEW_OPTIONS}
              />
              {undoBuffer && (
                <Button variant="ghost" size="sm" onClick={handleUndo} className="gap-1">
                  <ArrowUUpLeftIcon size={13} aria-hidden="true" />
                  Undo {undoBuffer.label.toLowerCase()}
                </Button>
              )}
              <CopyButton text={activeOutput} label="Copy output" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSave}
                disabled={!hasInput}
                title="Save the current view to a file (⌘S)"
                aria-label="Save output to file"
              >
                <FloppyDiskIcon size={15} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 max-[900px]:flex-col">
        <section
          aria-label="CSV source"
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-[var(--color-border)] max-[900px]:border-b min-[901px]:border-r"
        >
          <Editor
            theme={monacoTheme}
            language="plaintext"
            value={input}
            onChange={handleInputChange}
            options={monacoOptions}
            onMount={(editor) => {
              editorRef.current = editor
            }}
          />
          {!hasInput && (
            // Click-through: the hint must never sit between the user and the caret.
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <EmptyState
                icon={FileCsvIcon}
                title="Paste CSV, or open a file"
                description="Delimiter is detected automatically. Everything stays on this machine."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleLoadSample}
                    className="pointer-events-auto"
                  >
                    Load sample
                  </Button>
                }
              />
            </div>
          )}
        </section>

        <section
          aria-label={
            view === 'table' ? 'Table view' : view === 'convert' ? 'Converted output' : 'Analysis'
          }
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          {parsed.status !== 'parsed' ? (
            <EmptyState
              size="sm"
              title="No rows yet"
              description="The table, conversions and analysis appear once there is CSV to read."
              className="flex-1"
            />
          ) : view === 'table' ? (
            <CsvTable columns={columns} rows={rows} />
          ) : view === 'convert' ? (
            <CsvConvert
              output={converted}
              format={format}
              onFormatChange={(next) => updateState({ format: next })}
            />
          ) : (
            <CsvAnalyze
              columns={columns}
              rows={rows}
              summaries={summaries}
              schema={schema}
              schemaLanguage={schemaLanguage}
              onSchemaLanguageChange={(next) => updateState({ schemaLanguage: next })}
            />
          )}
        </section>
      </div>
    </ToolLayout>
  )
}
