import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  ArrowsDownUpIcon,
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  ArrowUUpLeftIcon,
  BracketsCurlyIcon,
  BroomIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CrosshairSimpleIcon,
  MagnifyingGlassIcon,
  SortAscendingIcon,
  TreeStructureIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useTextDocumentFileActions } from '@/hooks/useTextDocumentFileActions'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useMonaco } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useToolAction } from '@/hooks/useToolAction'
import { CopyButton } from '@/components/shared/CopyButton'
import { Kbd } from '@/components/shared/Kbd'
import { Button } from '@/components/shared/Button'
import { Alert } from '@/components/shared/Alert'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { SplitPane } from '@/components/shared/SplitPane'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input, Select } from '@/components/shared/Input'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { useUiStore } from '@/stores/ui.store'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import { documentStats, sortKeysDeepBounded } from '@/lib/traversal'
import { useCopyToClipboard, type CopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatShortcut } from '@/lib/shortcut-label'
import { InspectorTree } from '@/components/shared/InspectorTree'
import { Toggle } from '@/components/shared/Toggle'
import { sendToTool } from '@/lib/tool-handoff'
export { queryJsonPath, type JsonPathResult } from '@/lib/json-path'
import { queryJsonPath } from '@/lib/json-path'

type JsonView = 'source' | 'tree' | 'table'

type JsonToolsState = {
  input: string
  fileName: string | null
  filePath: string | null
  /**
   * Tree and Table used to be tabs that replaced the editor, so inspecting a
   * document meant leaving it: every fix was "switch tab, edit, switch back".
   * They are panes beside the source now, and the view choice persists.
   */
  view: JsonView
  query: string
  queryOpen: boolean
  indent: number
  allowComments: boolean
}

/**
 * An unterminated JSONC construct. Carries the original source offset so the editor can jump
 * to it exactly like a `JSON.parse` failure.
 */
export class JsoncSyntaxError extends Error {
  constructor(
    message: string,
    readonly index: number
  ) {
    super(message)
    this.name = 'JsoncSyntaxError'
  }
}

/**
 * Replaces JSONC comments/trailing commas with whitespace so source offsets stay stable.
 *
 * Throws on an unterminated block comment rather than blanking the rest of the file: treating
 * `{"ok":true} /* never closes` as valid would let Format or Minify silently discard it.
 */
export function normalizeJsonc(source: string): string {
  const chars = [...source]
  let inString = false
  let escaping = false
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    const next = chars[index + 1]
    if (inString) {
      if (escaping) escaping = false
      else if (char === '\\') escaping = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '/' && next === '/') {
      chars[index] = ' '
      chars[index + 1] = ' '
      index += 2
      while (index < chars.length && chars[index] !== '\n') {
        chars[index] = ' '
        index += 1
      }
      index -= 1
      continue
    }
    if (char === '/' && next === '*') {
      const openedAt = index
      chars[index] = ' '
      chars[index + 1] = ' '
      index += 2
      while (index < chars.length && !(chars[index] === '*' && chars[index + 1] === '/')) {
        if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' '
        index += 1
      }
      if (index >= chars.length) {
        throw new JsoncSyntaxError('Unterminated block comment', openedAt)
      }
      chars[index] = ' '
      chars[index + 1] = ' '
      index += 1
    }
  }
  return chars.join('').replace(/,(\s*[}\]])/g, ' $1')
}

/** Above this many keys the tree starts collapsed — expanding is one click. */
const LARGE_DOCUMENT_KEYS = 500

/**
 * Table view has no collapsing to fall back on: every key becomes a DOM node the
 * moment the view opens, and the nested renderer recurses once per level. Above
 * this many keys it asks first rather than freezing the pane on a document the
 * user only meant to glance at.
 */
const LARGE_TABLE_KEYS = LARGE_DOCUMENT_KEYS

/**
 * Nested tables stop nesting here and print the remaining subtree as compact
 * JSON. Two reasons: past ~20 levels each cell is a few pixels wide and unreadable
 * anyway, and a hand-built document can nest deeply enough to overflow the render
 * stack, which takes the whole app down rather than just the pane.
 */
const MAX_NESTED_TABLE_DEPTH = 20

const VIEW_OPTIONS = [
  { value: 'source' as const, label: 'Source' },
  { value: 'tree' as const, label: 'Tree' },
  { value: 'table' as const, label: 'Table' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Statistics and Sort Keys both run over freshly parsed, arbitrary user input, so they share
// the bounded walkers rather than recursing without limits.
function jsonStats(data: unknown) {
  return documentStats([data])
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
/** Source offset → 1-based line/column, for errors that already know their offset. */
function offsetToLineColumn(source: string, index: number): { line: number; column: number } {
  const clamped = Math.min(Math.max(index, 0), source.length)
  const before = source.slice(0, clamped)
  return { line: before.split('\n').length, column: clamped - before.lastIndexOf('\n') }
}

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

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isTabularJsonArray(data: unknown): data is Record<string, unknown>[] {
  return Array.isArray(data) && data.every(isJsonRecord)
}

/** Column order is first-seen across every row, so sparse records still line up. */
function unionKeys(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) keys.add(key)
  }
  return Array.from(keys)
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
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const [state, updateState] = useToolState<JsonToolsState>('json-tools', {
    input: '',
    fileName: null,
    filePath: null,
    view: 'source',
    query: '',
    queryOpen: false,
    indent: 2,
    allowComments: false,
  })
  const { record } = useToolHistory({ toolId: 'json-tools' })

  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    ['format', 'detectLanguage', 'getSupportedLanguages']
  )
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const [error, setError] = useState<string | null>(null)
  const [undoBuffer, setUndoBuffer] = useState<{ input: string; label: string } | null>(null)
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
      return {
        status: 'valid',
        data: JSON.parse(state.allowComments ? normalizeJsonc(input) : input) as unknown,
      }
    } catch (e) {
      const message = (e as Error).message
      if (e instanceof JsoncSyntaxError) {
        return { status: 'invalid', message, location: offsetToLineColumn(input, e.index) }
      }
      return { status: 'invalid', message, location: locateJsonError(message, input) }
    }
  }, [input, state.allowComments])

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
    setUndoBuffer({ input, label: 'Minify' })
    const output = JSON.stringify(data)
    updateState({ input: output })
    setError(null)
    setLastAction('Minified JSON', 'success')
    recordRun(output)
  }, [isValid, data, input, updateState, setLastAction, recordRun])

  const handleSortKeys = useCallback(() => {
    if (!isValid) return
    setUndoBuffer({ input, label: 'Sort keys' })
    const output = JSON.stringify(sortKeysDeepBounded(data), null, indent)
    updateState({ input: output })
    setError(null)
    setLastAction('Keys sorted', 'success')
    recordRun(output)
  }, [isValid, data, indent, input, updateState, setLastAction, recordRun])

  const handleUndo = useCallback(() => {
    if (!undoBuffer) return
    updateState({ input: undoBuffer.input })
    setUndoBuffer(null)
    setError(null)
    setLastAction(`Undid ${undoBuffer.label.toLowerCase()}`, 'info')
  }, [setLastAction, undoBuffer, updateState])

  const { handleOpen, handleSave, handleSaveAs } = useTextDocumentFileActions({
    getContent: () => inputRef.current,
    filePath: state.filePath ?? null,
    fileName: state.fileName ?? null,
    defaultFileName: 'data.json',
    onSaved: updateState,
  })

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
      updateState({
        input: action.content,
        fileName: action.filename,
        filePath: action.path ?? null,
        allowComments: action.filename.toLowerCase().endsWith('.jsonc'),
      })
      setError(null)
      setLastAction(`Opened ${action.filename}`, 'success')
    }
    if (action.type === 'save-file') void handleSave()
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
          ? // A truncated walk means the counts are lower bounds — say so rather than
            // presenting a partial traversal as the document's real shape.
            `Valid JSON · ${stats.truncated ? 'over ' : ''}${stats.keys} key${stats.keys === 1 ? '' : 's'} · depth ${stats.depth}${stats.truncated ? '+' : ''} · ${stats.size}`
          : 'Valid JSON'

  // Lifted out of the JSX below because the source pane appears in two shapes — alone when the
  // inspector is hidden, and as a SplitPane child when it isn't — and duplicating fifty lines of
  // editor wiring to express that is how the two copies drift apart.
  const sourcePane = (
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
            description={`Format with ${formatShortcut('mod+enter')}, inspect it as a tree or table, and query values by path.`}
            action={
              TOOL_SAMPLES['json-tools'] ? (
                <span className="pointer-events-auto">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      updateState({
                        input: TOOL_SAMPLES['json-tools'] ?? '',
                        fileName: null,
                        filePath: null,
                      })
                    }
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
  )

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <div className="border-b border-[var(--color-border)]">
          <DocumentToolbar aria-label="JSON document actions">
            <DocumentIdentity
              title={state.fileName ?? 'Untitled'}
              titleTooltip={state.filePath ?? state.fileName ?? 'Untitled'}
              icon={
                <BracketsCurlyIcon
                  size={16}
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
            <DocumentFileActions
              open={{
                label: 'Open JSON file',
                title: `Open a JSON file (${formatShortcut('mod+o')})`,
                onClick: () => void handleOpen(),
              }}
              save={{
                label: 'Save JSON file',
                title: `Save the JSON (${formatShortcut('mod+s')})`,
                onClick: () => void handleSave(),
                disabled: !hasInput,
              }}
              saveAs={{
                label: 'Save JSON file as',
                onClick: () => void handleSaveAs(),
                disabled: !hasInput,
              }}
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

            {/* Actions lead, view options trail. Narrow viewports shed groups into the
                trailing overflow menu from the right, so ordering by importance decides what
                survives at 1024px — the primary actions are the last to leave the row. */}
            <ToolbarGroup label="Document actions" separated>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleFormat()}
                disabled={!hasInput || isFormatting}
                loading={isFormatting}
                title={`Format the document (${formatShortcut('mod+enter')})`}
              >
                <BroomIcon size={14} aria-hidden="true" />
                Format
                <Kbd keys="mod+enter" variant="inline" className="ml-1" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleMinify}
                disabled={!isValid}
                className="gap-1"
              >
                <ArrowsInLineVerticalIcon size={14} aria-hidden="true" />
                Minify
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSortKeys}
                disabled={!isValid}
                className="gap-1"
              >
                <SortAscendingIcon size={14} aria-hidden="true" />
                Sort keys
              </Button>
              {undoBuffer && (
                <Button variant="ghost" size="sm" onClick={handleUndo} className="gap-1">
                  <ArrowUUpLeftIcon size={14} aria-hidden="true" />
                  Undo {undoBuffer.label}
                </Button>
              )}
              <CopyButton text={input} label="Copy JSON" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => sendToTool('yaml-tools', { input, view: 'source' })}
                disabled={!hasInput}
                title="Open this JSON in YAML Tools"
              >
                <TreeStructureIcon size={14} aria-hidden="true" />
                YAML
              </Button>
            </ToolbarGroup>

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
              <Toggle
                label="JSONC comments"
                checked={state.allowComments}
                onChange={(allowComments) => updateState({ allowComments })}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateState({ queryOpen: !state.queryOpen })}
                aria-expanded={state.queryOpen}
                {...(state.queryOpen ? { 'aria-controls': queryId } : {})}
                className="gap-1"
              >
                <MagnifyingGlassIcon size={14} aria-hidden="true" />
                Path
              </Button>
              <SegmentedControl
                aria-label="View"
                value={view}
                onChange={(next) => updateState({ view: next })}
                options={VIEW_OPTIONS}
              />
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
                  monospace
                  className="min-w-0 flex-1"
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
      {view === 'source' ? (
        <div className="flex min-h-0 flex-1">{sourcePane}</div>
      ) : (
        <SplitPane
          storageKey="json-tools"
          stackBelow={900}
          aria-label="Resize source and inspector"
        >
          {sourcePane}
          <InspectorPane
            view={view}
            parsed={parsed}
            keyCount={stats?.keys ?? 0}
            data={data}
            onCopy={copy}
            {...(queryResult?.found ? { highlightedPath: query } : {})}
          />
        </SplitPane>
      )}
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
  highlightedPath,
}: {
  view: Exclude<JsonView, 'source'>
  parsed: ParseResult
  keyCount: number
  data: unknown
  onCopy: CopyToClipboard
  highlightedPath?: string
}) {
  // A 5000-key document rendered fully expanded janks the pane on open, so the
  // default follows the document size until the user overrides it.
  const [expandAll, setExpandAll] = useState<boolean | null>(null)
  const [treeKey, setTreeKey] = useState(0)
  const autoExpanded = keyCount <= LARGE_DOCUMENT_KEYS
  const expanded = expandAll ?? autoExpanded

  // Deliberately not reset when the document changes: the key count moves on every
  // keystroke, so re-asking on each edit would put the prompt back in the way of
  // someone who has already said they want to see this document.
  const [tableConfirmed, setTableConfirmed] = useState(false)
  const tableTooLarge = keyCount > LARGE_TABLE_KEYS && !tableConfirmed

  const setExpansion = (next: boolean) => {
    setExpandAll(next)
    setTreeKey((k) => k + 1)
  }

  const tabular = isTabularJsonArray(data)

  return (
    <section
      aria-label={view === 'tree' ? 'Tree view' : 'Table view'}
      /* SplitPane owns the divider and the stacked border, so the pane itself carries neither. */
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <PaneHeader
        title={view === 'tree' ? 'Tree' : 'Table'}
        actions={
          <>
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
            {view === 'table' && parsed.status === 'valid' && tableSummary(data) && (
              <span className="text-2xs text-[var(--color-text-muted)]">{tableSummary(data)}</span>
            )}
          </>
        }
      />

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
            <InspectorTree
              key={treeKey}
              data={data}
              defaultExpanded={expanded}
              filterable
              {...(highlightedPath === undefined ? {} : { highlightedPath })}
            />
          ) : tableTooLarge ? (
            // The tree can open collapsed; a table cannot, so this is the equivalent
            // brake — every key would become a DOM node the moment the view opens.
            <EmptyState
              size="sm"
              icon={WarningCircleIcon}
              title="Large document"
              description={`${keyCount} keys will all render at once. Tree view opens this instantly.`}
              action={
                <Button variant="secondary" size="sm" onClick={() => setTableConfirmed(true)}>
                  Render anyway
                </Button>
              }
            />
          ) : tabular ? (
            <JsonTable data={data} onCopy={onCopy} />
          ) : (
            // Anything that is not a list of records still has a table shape:
            // objects become key/value rows and arrays become indexed rows,
            // nested the whole way down.
            <div className="p-3">
              <NestedJsonValue value={data} />
            </div>
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

export function JsonTree({
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
  return <Icon size={12} aria-hidden="true" className="text-[var(--color-text-muted)]" />
}

export function JsonTable({
  data,
  onCopy,
}: {
  data: Record<string, unknown>[]
  onCopy: CopyToClipboard
}) {
  const [sort, setSort] = useState<SortState>(null)
  // Roving cell cursor: the old table copied on click only, which left the
  // whole grid unreachable from the keyboard.
  const [cursor, setCursor] = useState({ row: 0, column: 0 })
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>())
  const focusPending = useRef(false)

  const columns = useMemo(() => unionKeys(data), [data])

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

// ---------------------------------------------------------------------------
// Nested Table View
//
// A document that is not a list of records is still tabular: an object is a
// key/value table and an array is an indexed one, with every value recursing.
// The flat grid above stays in charge of record arrays because it owns the
// sorting and the roving cell cursor, neither of which nests.
// ---------------------------------------------------------------------------

const NESTED_TABLE_CLASS = 'w-full border-collapse text-xs font-mono'
const NESTED_CELL_CLASS = 'border border-[var(--color-border)] px-2 py-1 align-top'
const NESTED_HEADER_CLASS = `${NESTED_CELL_CLASS} bg-[var(--color-surface)] text-left font-bold whitespace-nowrap text-[var(--color-accent)]`

function tableSummary(data: unknown): string | null {
  if (Array.isArray(data)) return `${data.length} row${data.length === 1 ? '' : 's'}`
  if (isJsonRecord(data)) {
    const count = Object.keys(data).length
    return `${count} field${count === 1 ? '' : 's'}`
  }
  return null
}

function JsonLeaf({ value }: { value: unknown }) {
  const copy = useCopyToClipboard()
  const text = toText(value)
  const className =
    value === null
      ? 'text-[var(--color-text-muted)]'
      : typeof value === 'boolean'
        ? 'text-[var(--color-warning)]'
        : typeof value === 'number'
          ? 'text-[var(--color-accent)]'
          : 'text-[var(--color-success)]'

  return (
    <TreeValueButton
      className={className}
      onClick={() => void copy(text, { success: 'Copied value' })}
      label={`Copy value ${text}`}
    >
      {/* An empty string would otherwise render as a cell with no target to click. */}
      {text === '' ? '""' : text}
    </TreeValueButton>
  )
}

function EmptyContainer({ children }: { children: string }) {
  return <span className="text-[var(--color-text-muted)]">{children}</span>
}

/** The tail of a subtree too deep to keep tabulating, still copyable in full. */
function DeepValue({ value }: { value: unknown }) {
  const copy = useCopyToClipboard()
  const text = JSON.stringify(value)

  return (
    <TreeValueButton
      className="text-[var(--color-text-muted)]"
      onClick={() => void copy(text, { success: 'Copied value' })}
      label={`Copy value ${text}`}
    >
      {text}
    </TreeValueButton>
  )
}

function NestedJsonValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || typeof value !== 'object') return <JsonLeaf value={value} />
  if (depth >= MAX_NESTED_TABLE_DEPTH) return <DeepValue value={value} />

  if (Array.isArray(value)) {
    if (value.length === 0) return <EmptyContainer>[]</EmptyContainer>
    return isTabularJsonArray(value) && unionKeys(value).length > 0 ? (
      <RecordArrayTable rows={value} depth={depth} />
    ) : (
      <IndexedArrayTable items={value} depth={depth} />
    )
  }

  const entries = Object.entries(value)
  if (entries.length === 0) return <EmptyContainer>{'{}'}</EmptyContainer>

  return (
    <table className={NESTED_TABLE_CLASS}>
      <tbody>
        {entries.map(([key, child]) => (
          <tr key={key}>
            <th scope="row" className={NESTED_HEADER_CLASS}>
              {key}
            </th>
            <td className={NESTED_CELL_CLASS}>
              <NestedJsonValue value={child} depth={depth + 1} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RecordArrayTable({ rows, depth }: { rows: Record<string, unknown>[]; depth: number }) {
  const columns = unionKeys(rows)
  return (
    <table className={NESTED_TABLE_CLASS}>
      <thead>
        <tr>
          <th scope="col" className={NESTED_HEADER_CLASS}>
            #
          </th>
          {columns.map((col) => (
            <th key={col} scope="col" className={NESTED_HEADER_CLASS}>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <th scope="row" className={NESTED_HEADER_CLASS}>
              {index}
            </th>
            {columns.map((col) => (
              <td key={col} className={NESTED_CELL_CLASS}>
                {/* A key absent from this record is not the same as one holding null. */}
                {col in row ? (
                  <NestedJsonValue value={row[col]} depth={depth + 1} />
                ) : (
                  <EmptyContainer>—</EmptyContainer>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function IndexedArrayTable({ items, depth }: { items: unknown[]; depth: number }) {
  return (
    <table className={NESTED_TABLE_CLASS}>
      <tbody>
        {items.map((item, index) => (
          <tr key={index}>
            <th scope="row" className={NESTED_HEADER_CLASS}>
              {index}
            </th>
            <td className={NESTED_CELL_CLASS}>
              <NestedJsonValue value={item} depth={depth + 1} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
