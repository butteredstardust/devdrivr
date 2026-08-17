import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  ArrowsDownUpIcon,
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  BracketsCurlyIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CrosshairSimpleIcon,
  FloppyDiskIcon,
  MagnifyingGlassIcon,
  SortAscendingIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useToolAction } from '@/hooks/useToolAction'
import { CopyButton } from '@/components/shared/CopyButton'
import { Button } from '@/components/shared/Button'
import { Alert } from '@/components/shared/Alert'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input, Select } from '@/components/shared/Input'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { useUiStore } from '@/stores/ui.store'
import { saveFileDialog } from '@/lib/file-io'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import { formatBytes } from '@/lib/format'
import { useCopyToClipboard, type CopyToClipboard } from '@/hooks/useCopyToClipboard'

type JsonView = 'source' | 'tree' | 'table'

type JsonToolsState = {
  input: string
  fileName: string | null
  /**
   * Tree and Table used to be tabs that replaced the editor, so inspecting a
   * document meant leaving it: every fix was "switch tab, edit, switch back".
   * They are panes beside the source now, and the view choice persists.
   */
  view: JsonView
  query: string
  queryOpen: boolean
  indent: number
}

/** Above this many keys the tree starts collapsed — expanding is one click. */
const LARGE_DOCUMENT_KEYS = 500

const VIEW_OPTIONS = [
  { value: 'source' as const, label: 'Source' },
  { value: 'tree' as const, label: 'Tree' },
  { value: 'table' as const, label: 'Table' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortKeysDeep(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(sortKeysDeep)
  if (data !== null && typeof data === 'object') {
    const sorted: Record<string, unknown> = {}
    const keys = Object.keys(data as Record<string, unknown>).sort()
    for (const key of keys) {
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
  return { keys: keyCount, depth: maxDepth, size: formatBytes(bytes) }
}

class JsonScanError {
  constructor(readonly index: number) {}
}

const NUMBER_PATTERN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y

/**
 * Finds the offset of the first character that breaks the document.
 *
 * V8 puts `position N` in the message; JavaScriptCore — the engine behind
 * WKWebView, i.e. the one this app actually ships on — says only
 * `JSON Parse error: Unexpected EOF`. Relying on the message means the whole
 * "jump to the error" feature is dead in the release build, so scan the source
 * ourselves. Only ever runs on documents `JSON.parse` already rejected.
 */
function scanJsonErrorIndex(source: string): number | null {
  let i = 0

  // A declaration, not a `const` arrow: only the former lets control-flow
  // analysis treat `fail()` as terminating.
  function fail(): never {
    throw new JsonScanError(Math.min(i, Math.max(source.length - 1, 0)))
  }

  function skipWhitespace() {
    while (i < source.length) {
      const c = source[i]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++
      else break
    }
  }

  function scanString() {
    i++ // opening quote
    while (i < source.length) {
      const c = source[i]
      if (c === undefined) break
      if (c === '"') {
        i++
        return
      }
      if (c === '\\') {
        const escape = source[i + 1]
        if (escape === undefined) fail()
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(i + 2, i + 6))) fail()
          i += 6
          continue
        }
        if (!'"\\/bfnrt'.includes(escape)) fail()
        i += 2
        continue
      }
      if (c < ' ') fail() // raw control characters must be escaped
      i++
    }
    fail() // unterminated
  }

  function scanValue() {
    skipWhitespace()
    if (i >= source.length) fail()
    const c = source[i]
    if (c === '{') return scanObject()
    if (c === '[') return scanArray()
    if (c === '"') return scanString()
    if (source.startsWith('true', i)) return void (i += 4)
    if (source.startsWith('false', i)) return void (i += 5)
    if (source.startsWith('null', i)) return void (i += 4)
    NUMBER_PATTERN.lastIndex = i
    const number = NUMBER_PATTERN.exec(source)
    if (!number) fail()
    i += number[0].length
  }

  function scanObject() {
    i++ // {
    skipWhitespace()
    if (source[i] === '}') {
      i++
      return
    }
    for (;;) {
      skipWhitespace()
      if (source[i] !== '"') fail()
      scanString()
      skipWhitespace()
      if (source[i] !== ':') fail()
      i++
      scanValue()
      skipWhitespace()
      if (source[i] === ',') {
        i++
        continue
      }
      if (source[i] === '}') {
        i++
        return
      }
      fail()
    }
  }

  function scanArray() {
    i++ // [
    skipWhitespace()
    if (source[i] === ']') {
      i++
      return
    }
    for (;;) {
      scanValue()
      skipWhitespace()
      if (source[i] === ',') {
        i++
        continue
      }
      if (source[i] === ']') {
        i++
        return
      }
      fail()
    }
  }

  try {
    scanValue()
    skipWhitespace()
    if (i < source.length) fail() // trailing junk
    return null
  } catch (e) {
    // A RangeError from a pathologically nested document lands here too: no
    // location is better than a wrong one.
    return e instanceof JsonScanError ? e.index : null
  }
}

/**
 * `JSON.parse` reports a character offset at best, which is useless against a
 * 2000-line document. Translate whatever the engine gives us — or a scan of the
 * source when it gives us nothing — into the line/column the editor can jump to.
 */
export function locateJsonError(
  message: string,
  source: string
): { line: number; column: number } | null {
  const lineColumn = /line (\d+) column (\d+)/i.exec(message)
  if (lineColumn?.[1] && lineColumn[2]) {
    return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) }
  }
  const position = /position (\d+)/.exec(message)
  const index = position?.[1] ? Number(position[1]) : scanJsonErrorIndex(source)
  if (index === null) return null
  const clamped = Math.min(index, source.length)
  const before = source.slice(0, clamped)
  return { line: before.split('\n').length, column: clamped - before.lastIndexOf('\n') }
}

export type JsonPathResult = { found: true; value: unknown } | { found: false }

/**
 * Returns a `found` flag rather than `undefined`: a path that resolves to a
 * literal `null` is a hit, and the old signature reported it as a miss.
 */
export function queryJsonPath(data: unknown, path: string): JsonPathResult {
  if (!path.trim()) return { found: false }
  const parts = path
    .replace(/^\$\.?/, '') // strip leading $. or $
    .replace(/\[(\d+)\]/g, '.$1') // arr[0] → arr.0
    .split('.')
    .filter(Boolean)
  if (parts.length === 0) return { found: true, value: data }

  let current: unknown = data
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return { found: false }
    if (!(part in (current as Record<string, unknown>))) return { found: false }
    current = (current as Record<string, unknown>)[part]
  }
  return { found: true, value: current }
}

export function isTabularJsonArray(data: unknown): data is Record<string, unknown>[] {
  return (
    Array.isArray(data) &&
    data.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
  )
}

function toText(value: unknown): string {
  return typeof value === 'object' && value !== null
    ? JSON.stringify(value, null, 2)
    : String(value ?? (value === null ? 'null' : ''))
}

type ParseResult =
  | { status: 'empty' }
  | { status: 'valid'; data: unknown }
  | { status: 'invalid'; message: string; location: { line: number; column: number } | null }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JsonTools() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const [state, updateState] = useToolState<JsonToolsState>('json-tools', {
    input: '',
    fileName: null,
    view: 'source',
    query: '',
    queryOpen: false,
    indent: 2,
  })
  const { record } = useToolHistory({ toolId: 'json-tools' })

  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    ['format', 'detectLanguage', 'getSupportedLanguages']
  )
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const [error, setError] = useState<string | null>(null)
  const [isFormatting, setIsFormatting] = useState(false)
  const formattingRef = useRef(false)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const queryId = useId()

  const { input, view, query, indent } = state
  const inputRef = useRef(input)
  inputRef.current = input
  const hasInput = input.trim().length > 0

  const parsed = useMemo<ParseResult>(() => {
    if (!input.trim()) return { status: 'empty' }
    try {
      return { status: 'valid', data: JSON.parse(input) as unknown }
    } catch (e) {
      const message = (e as Error).message
      return { status: 'invalid', message, location: locateJsonError(message, input) }
    }
  }, [input])

  const isValid = parsed.status === 'valid'
  const data = parsed.status === 'valid' ? parsed.data : null

  const stats = useMemo(() => (parsed.status === 'valid' ? jsonStats(parsed.data) : null), [parsed])

  const queryResult = useMemo(() => {
    if (parsed.status !== 'valid' || !query.trim()) return null
    return queryJsonPath(parsed.data, query)
  }, [parsed, query])

  // --- Actions ---------------------------------------------------------

  const recordRun = useCallback(
    (output: string) => {
      const source = inputRef.current
      record({
        input: `JSON: ${source.slice(0, 300)}${source.length > 300 ? '...' : ''}`,
        output: output.slice(0, 1000),
        subTab: view,
        success: true,
      })
    },
    [record, view]
  )

  const handleFormat = useCallback(async () => {
    if (!formatter || formattingRef.current || !inputRef.current.trim()) return
    formattingRef.current = true
    setIsFormatting(true)
    const snapshot = inputRef.current
    try {
      const result = await formatter.format(snapshot, {
        language: 'json',
        tabWidth: indent,
      })
      // Prettier can take a while on a large document; writing the result back
      // over a buffer the user kept typing into would silently eat those edits.
      if (inputRef.current !== snapshot) {
        setLastAction('Document changed while formatting — format again', 'info')
        return
      }
      updateState({ input: result })
      setError(null)
      setLastAction('Formatted JSON', 'success')
      recordRun(result)
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      setLastAction('Invalid JSON', 'error')
    } finally {
      formattingRef.current = false
      setIsFormatting(false)
    }
  }, [formatter, indent, updateState, setLastAction, recordRun])

  const handleMinify = useCallback(() => {
    if (!isValid) return
    const output = JSON.stringify(data)
    updateState({ input: output })
    setError(null)
    setLastAction('Minified JSON', 'success')
    recordRun(output)
  }, [isValid, data, updateState, setLastAction, recordRun])

  const handleSortKeys = useCallback(() => {
    if (!isValid) return
    const output = JSON.stringify(sortKeysDeep(data), null, indent)
    updateState({ input: output })
    setError(null)
    setLastAction('Keys sorted', 'success')
    recordRun(output)
  }, [isValid, data, indent, updateState, setLastAction, recordRun])

  const handleSave = useCallback(() => {
    void saveFileDialog(inputRef.current, state.fileName ?? 'data.json').then(
      (path) => setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
      (err: unknown) =>
        setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    )
  }, [state.fileName, setLastAction])

  // The parse error knows where it is; without this the user has to count
  // characters to find `position 428`.
  const handleGoToError = useCallback(() => {
    if (parsed.status !== 'invalid' || !parsed.location) return
    const editor = editorRef.current
    if (!editor) return
    const position = { lineNumber: parsed.location.line, column: parsed.location.column }
    editor.revealPositionInCenter(position)
    editor.setPosition(position)
    editor.focus()
  }, [parsed])

  useToolAction((action) => {
    if (action.type === 'open-file') {
      updateState({ input: action.content, fileName: action.filename })
      setError(null)
      setLastAction(`Opened ${action.filename}`, 'success')
    }
    if (action.type === 'save-file') {
      if (!inputRef.current.trim()) {
        setLastAction('Nothing to save yet', 'info')
        return
      }
      handleSave()
    }
  })

  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      void handleFormat()
    }, [handleFormat])
  )

  const status =
    parsed.status === 'empty'
      ? 'Nothing to inspect yet'
      : parsed.status === 'invalid'
        ? parsed.location
          ? `Invalid JSON — line ${parsed.location.line}, column ${parsed.location.column}`
          : 'Invalid JSON'
        : stats
          ? `Valid JSON · ${stats.keys} key${stats.keys === 1 ? '' : 's'} · depth ${stats.depth} · ${stats.size}`
          : 'Valid JSON'

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <div className="border-b border-[var(--color-border)]">
          <DocumentToolbar border={false} aria-label="JSON document actions">
            <DocumentIdentity
              title={state.fileName ?? 'Untitled'}
              icon={
                <BracketsCurlyIcon
                  size={15}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-text-muted)]"
                />
              }
              status={isFormatting ? 'Formatting…' : status}
              statusIcon={
                isValid ? (
                  <CheckCircleIcon
                    size={12}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--color-success)]"
                  />
                ) : parsed.status === 'invalid' ? (
                  <WarningCircleIcon
                    size={12}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--color-error)]"
                  />
                ) : undefined
              }
            />
            {parsed.status === 'invalid' && parsed.location && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleGoToError}
                title="Move the cursor to the parse error"
                className="shrink-0 gap-1"
              >
                <CrosshairSimpleIcon size={12} aria-hidden="true" />
                Go to error
              </Button>
            )}

            <ToolbarGroup label="View options" separated>
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <span className="max-[900px]:hidden">Indent</span>
                <Select
                  aria-label="Indent width"
                  value={indent}
                  onChange={(e) => updateState({ indent: Number(e.target.value) })}
                >
                  <option value={2}>2 spaces</option>
                  <option value={4}>4 spaces</option>
                </Select>
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateState({ queryOpen: !state.queryOpen })}
                aria-expanded={state.queryOpen}
                {...(state.queryOpen ? { 'aria-controls': queryId } : {})}
                className="gap-1"
              >
                <MagnifyingGlassIcon size={13} aria-hidden="true" />
                Path
              </Button>
              <SegmentedControl
                aria-label="View"
                value={view}
                onChange={(next) => updateState({ view: next })}
                options={VIEW_OPTIONS}
              />
            </ToolbarGroup>

            <ToolbarGroup label="Document actions" separated>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleFormat()}
                disabled={!hasInput || isFormatting}
                loading={isFormatting}
                title="Format the document (⌘↵)"
              >
                Format
                <span className="ml-1 text-2xs opacity-70" aria-hidden="true">
                  ⌘↵
                </span>
              </Button>
              <Button variant="secondary" size="sm" onClick={handleMinify} disabled={!isValid}>
                Minify
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSortKeys}
                disabled={!isValid}
                className="gap-1"
              >
                <SortAscendingIcon size={13} aria-hidden="true" />
                Sort keys
              </Button>
              <CopyButton text={input} label="Copy JSON" />
              <Button
                variant="icon"
                size="sm"
                onClick={handleSave}
                disabled={!hasInput}
                title="Save to a file (⌘S)"
                aria-label="Save JSON to file"
              >
                <FloppyDiskIcon size={15} aria-hidden="true" />
              </Button>
            </ToolbarGroup>
          </DocumentToolbar>

          {state.queryOpen && (
            <div
              id={queryId}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2"
            >
              <label className="flex min-w-0 flex-1 items-center gap-2 text-2xs text-[var(--color-text-muted)]">
                Path
                <Input
                  aria-label="JSON path"
                  value={query}
                  onChange={(e) => updateState({ query: e.target.value })}
                  placeholder="$.items[0].sku"
                  className="min-w-0 flex-1 font-mono"
                />
              </label>
              {queryResult?.found && <CopyButton text={toText(queryResult.value)} />}
              {/* `output` is a live region by default, so a path that starts
                  matching announces itself without a second status element. */}
              <output className="w-full font-mono text-xs text-[var(--color-text)]">
                {!isValid ? (
                  <span className="text-[var(--color-text-muted)]">
                    Fix the JSON to run a path query.
                  </span>
                ) : !query.trim() ? (
                  <span className="text-[var(--color-text-muted)]">
                    Dot and bracket paths, e.g. <code>$.items[0].sku</code>.
                  </span>
                ) : queryResult?.found ? (
                  <pre className="max-h-24 overflow-auto whitespace-pre-wrap">
                    {toText(queryResult.value)}
                  </pre>
                ) : (
                  <span className="text-[var(--color-text-muted)]">No match for this path</span>
                )}
              </output>
            </div>
          )}
        </div>
      }
    >
      {error && (
        <Alert
          variant="error"
          className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          {error}
        </Alert>
      )}
      <div className="flex min-h-0 flex-1 max-[900px]:flex-col">
        <section
          aria-label="JSON source"
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <Editor
            theme={monacoTheme}
            language="json"
            value={input}
            onChange={(v) => {
              updateState({ input: v ?? '' })
              // The banner reports a failed format of the *old* text; leaving it
              // up contradicts the status line as soon as the user fixes things.
              setError(null)
            }}
            options={monacoOptions}
            onMount={(editor) => {
              editorRef.current = editor
            }}
          />
          {!hasInput && (
            // Click-through: the hint must never sit between the user and the caret.
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <EmptyState
                icon={BracketsCurlyIcon}
                title="Paste or open a JSON document"
                description="Format with ⌘↵, inspect it as a tree or table, and query values by path."
                action={
                  TOOL_SAMPLES['json-tools'] ? (
                    <span className="pointer-events-auto">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => updateState({ input: TOOL_SAMPLES['json-tools'] ?? '' })}
                      >
                        Load sample
                      </Button>
                    </span>
                  ) : undefined
                }
              />
            </div>
          )}
        </section>

        {view !== 'source' && (
          <InspectorPane
            view={view}
            parsed={parsed}
            keyCount={stats?.keys ?? 0}
            data={data}
            onCopy={copy}
          />
        )}
      </div>
    </ToolLayout>
  )
}

// ---------------------------------------------------------------------------
// Inspector (tree / table)
// ---------------------------------------------------------------------------

function InspectorPane({
  view,
  parsed,
  keyCount,
  data,
  onCopy,
}: {
  view: Exclude<JsonView, 'source'>
  parsed: ParseResult
  keyCount: number
  data: unknown
  onCopy: CopyToClipboard
}) {
  // A 5000-key document rendered fully expanded janks the pane on open, so the
  // default follows the document size until the user overrides it.
  const [expandAll, setExpandAll] = useState<boolean | null>(null)
  const [treeKey, setTreeKey] = useState(0)
  const autoExpanded = keyCount <= LARGE_DOCUMENT_KEYS
  const expanded = expandAll ?? autoExpanded

  const setExpansion = (next: boolean) => {
    setExpandAll(next)
    setTreeKey((k) => k + 1)
  }

  const tabular = isTabularJsonArray(data)

  return (
    <section
      aria-label={view === 'tree' ? 'Tree view' : 'Table view'}
      className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-[var(--color-border)] max-[900px]:max-h-[45%] max-[900px]:border-l-0 max-[900px]:border-t"
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5">
        <span className="font-ui text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {view === 'tree' ? 'Tree' : 'Table'}
        </span>
        {view === 'tree' && parsed.status === 'valid' && (
          <>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setExpansion(true)}
              className="gap-1"
              title="Expand every node"
            >
              <ArrowsOutLineVerticalIcon size={12} aria-hidden="true" />
              Expand all
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setExpansion(false)}
              className="gap-1"
              title="Collapse every node"
            >
              <ArrowsInLineVerticalIcon size={12} aria-hidden="true" />
              Collapse all
            </Button>
            {expandAll === null && !autoExpanded && (
              <span className="text-2xs text-[var(--color-text-muted)]">
                Collapsed — {keyCount} keys
              </span>
            )}
          </>
        )}
        {view === 'table' && parsed.status === 'valid' && tabular && (
          <span className="text-2xs text-[var(--color-text-muted)]">
            {data.length} row{data.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {parsed.status === 'empty' && (
          <EmptyState
            size="sm"
            title="Nothing to inspect"
            description="Type or open JSON in the source pane."
          />
        )}
        {parsed.status === 'invalid' && (
          <EmptyState
            size="sm"
            icon={WarningCircleIcon}
            title="Invalid JSON"
            description={parsed.message}
          />
        )}
        {parsed.status === 'valid' &&
          (view === 'tree' ? (
            <div className="p-3 font-mono text-xs">
              <JsonTree key={treeKey} data={data} path="$" defaultExpanded={expanded} />
            </div>
          ) : tabular ? (
            <JsonTable data={data} onCopy={onCopy} />
          ) : (
            <EmptyState
              size="sm"
              title="Table view needs an array of objects"
              description="This document is not a list of records — the tree view shows it in full."
            />
          ))}
      </div>
    </section>
  )
}

function TreeValueButton({
  children,
  className,
  onClick,
  label,
}: {
  children: ReactNode
  className: string
  onClick: () => void
  label: string
}) {
  return (
    // eslint-disable-next-line no-restricted-syntax -- inline click-to-copy token inside the syntax-highlighted tree; it must inherit the caller's value colour and monospace metrics, which every Button variant would override.
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Copy value"
      className={`cursor-pointer rounded hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${className}`}
    >
      {children}
    </button>
  )
}

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
  const copy = useCopyToClipboard()

  const copyPath = useCallback(
    () => void copy(path, { success: `Copied path ${path}` }),
    [copy, path]
  )
  const copyValue = useCallback(
    (val: unknown) => void copy(toText(val), { success: 'Copied value' }),
    [copy]
  )

  if (data === null)
    return (
      <TreeValueButton
        className="text-[var(--color-text-muted)]"
        onClick={() => copyValue(null)}
        label="Copy value null"
      >
        null
      </TreeValueButton>
    )
  if (typeof data === 'boolean')
    return (
      <TreeValueButton
        className="text-[var(--color-warning)]"
        onClick={() => copyValue(data)}
        label={`Copy value ${String(data)}`}
      >
        {String(data)}
      </TreeValueButton>
    )
  if (typeof data === 'number')
    return (
      <TreeValueButton
        className="text-[var(--color-accent)]"
        onClick={() => copyValue(data)}
        label={`Copy value ${data}`}
      >
        {data}
      </TreeValueButton>
    )
  if (typeof data === 'string')
    return (
      <TreeValueButton
        className="text-[var(--color-success)]"
        onClick={() => copyValue(data)}
        label={`Copy value ${data}`}
      >
        &quot;{data}&quot;
      </TreeValueButton>
    )

  if (typeof data !== 'object') return <span>{String(data)}</span>

  const isArray = Array.isArray(data)
  const entries = isArray
    ? (data as unknown[]).map((value, i) => [String(i), value] as const)
    : Object.entries(data as Record<string, unknown>)
  const hasChildren = entries.length > 0

  return (
    <div className="ml-4">
      <div className="flex items-center gap-1">
        {/* eslint-disable-next-line no-restricted-syntax -- tree disclosure row: a bare
            ▼/▶/• glyph aligned to the monospace indent grid, not an action button. */}
        <button
          type="button"
          onClick={() => hasChildren && setExpanded(!expanded)}
          aria-expanded={hasChildren ? expanded : undefined}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${path}`}
          disabled={!hasChildren}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          {hasChildren ? (expanded ? '▼' : '▶') : '•'}
        </button>
        {/* eslint-disable-next-line no-restricted-syntax -- inline copy-path affordance
            rendered as part of the tree row's monospace text ([n] / {n}), not a control. */}
        <button
          type="button"
          className="text-xs text-[var(--color-text-muted)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          onClick={copyPath}
          aria-label={`Copy path ${path}`}
          title="Copy path"
        >
          {isArray ? `[${entries.length}]` : `{${entries.length}}`}
        </button>
      </div>
      {expanded &&
        entries.map(([key, value]) => (
          <div key={key} className="ml-4">
            {isArray ? (
              <span className="text-[var(--color-text-muted)]">{key}: </span>
            ) : (
              <>
                <span className="text-[var(--color-accent)]">&quot;{key}&quot;</span>
                <span className="text-[var(--color-text-muted)]">: </span>
              </>
            )}
            <JsonTree
              data={value}
              path={isArray ? `${path}[${key}]` : `${path}.${key}`}
              defaultExpanded={defaultExpanded}
            />
          </div>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table View
// ---------------------------------------------------------------------------

type SortState = { column: string; direction: 'asc' | 'desc' } | null

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === undefined || a === null) return 1
  if (b === undefined || b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return toText(a).localeCompare(toText(b), undefined, { numeric: true })
}

function SortIndicator({ direction }: { direction: 'asc' | 'desc' | null }) {
  const Icon =
    direction === 'asc' ? CaretUpIcon : direction === 'desc' ? CaretDownIcon : ArrowsDownUpIcon
  return <Icon size={10} aria-hidden="true" className="text-[var(--color-text-muted)]" />
}

function JsonTable({ data, onCopy }: { data: Record<string, unknown>[]; onCopy: CopyToClipboard }) {
  const [sort, setSort] = useState<SortState>(null)
  // Roving cell cursor: the old table copied on click only, which left the
  // whole grid unreachable from the keyboard.
  const [cursor, setCursor] = useState({ row: 0, column: 0 })
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>())
  const focusPending = useRef(false)

  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const row of data) {
      for (const key of Object.keys(row)) keys.add(key)
    }
    return Array.from(keys)
  }, [data])

  const rows = useMemo(() => {
    if (!sort) return data
    const sorted = [...data].sort((a, b) => compareValues(a[sort.column], b[sort.column]))
    return sort.direction === 'asc' ? sorted : sorted.reverse()
  }, [data, sort])

  // Sorting or a shrinking document can strand the cursor past the last row;
  // without clamping, the grid would have no cell in the tab order at all.
  const safeCursor = {
    row: Math.min(cursor.row, Math.max(rows.length - 1, 0)),
    column: Math.min(cursor.column, Math.max(columns.length - 1, 0)),
  }

  useEffect(() => {
    if (!focusPending.current) return
    focusPending.current = false
    cellRefs.current.get(`${cursor.row}:${cursor.column}`)?.focus()
  }, [cursor])

  const move = (rowDelta: number, columnDelta: number) => {
    focusPending.current = true
    setCursor(() => ({
      row: Math.min(Math.max(safeCursor.row + rowDelta, 0), rows.length - 1),
      column: Math.min(Math.max(safeCursor.column + columnDelta, 0), columns.length - 1),
    }))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableSectionElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1, 0)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1, 0)
        break
      case 'ArrowRight':
        event.preventDefault()
        move(0, 1)
        break
      case 'ArrowLeft':
        event.preventDefault()
        move(0, -1)
        break
      case 'Home':
        event.preventDefault()
        focusPending.current = true
        setCursor((c) => ({ ...c, column: 0 }))
        break
      case 'End':
        event.preventDefault()
        focusPending.current = true
        setCursor((c) => ({ ...c, column: columns.length - 1 }))
        break
      case 'Enter':
      case ' ': {
        event.preventDefault()
        const column = columns[safeCursor.column]
        const row = rows[safeCursor.row]
        if (column && row) void onCopy(toText(row[column]), { success: `Copied ${column}` })
        break
      }
      default:
        break
    }
  }

  if (data.length === 0)
    return <EmptyState size="sm" title="Empty array" description="No rows to show." />

  if (columns.length === 0)
    return (
      <EmptyState size="sm" title="No columns" description="Every object in this array is empty." />
    )

  return (
    <table className="w-full border-collapse text-xs">
      <caption className="sr-only">
        {rows.length} rows by {columns.length} columns. Use the arrow keys to move between cells and
        Enter to copy the focused cell.
      </caption>
      <thead className="sticky top-0 z-10">
        <tr>
          {columns.map((col) => {
            const active = sort?.column === col
            return (
              <th
                key={col}
                scope="col"
                aria-sort={
                  active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                className="border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-left"
              >
                <Button
                  variant="ghost"
                  size="xs"
                  className="w-full justify-start gap-1 rounded-none font-mono font-bold text-[var(--color-accent)]"
                  onClick={() =>
                    setSort((current) =>
                      current?.column === col && current.direction === 'asc'
                        ? { column: col, direction: 'desc' }
                        : { column: col, direction: 'asc' }
                    )
                  }
                  title={`Sort by ${col}`}
                >
                  {col}
                  <SortIndicator direction={active ? sort.direction : null} />
                </Button>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody onKeyDown={handleKeyDown}>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="hover:bg-[var(--color-surface-hover)]">
            {columns.map((col, columnIndex) => {
              const value = row[col]
              const isCursor = safeCursor.row === rowIndex && safeCursor.column === columnIndex
              return (
                <td
                  key={col}
                  ref={(el) => {
                    const id = `${rowIndex}:${columnIndex}`
                    if (el) cellRefs.current.set(id, el)
                    else cellRefs.current.delete(id)
                  }}
                  tabIndex={isCursor ? 0 : -1}
                  onFocus={() => setCursor({ row: rowIndex, column: columnIndex })}
                  onClick={() => void onCopy(toText(value), { success: `Copied ${col}` })}
                  title="Copy cell"
                  className="cursor-pointer border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  {typeof value === 'object' && value !== null
                    ? JSON.stringify(value)
                    : String(value ?? '')}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
