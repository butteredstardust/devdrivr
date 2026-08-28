import { useCallback, useId, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  ArrowsInLineVerticalIcon,
  ArrowUUpLeftIcon,
  BracketsCurlyIcon,
  BroomIcon,
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
import { sortKeysDeepBounded } from '@/lib/traversal'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatShortcut } from '@/lib/shortcut-label'
import { Toggle } from '@/components/shared/Toggle'
import { sendToTool } from '@/lib/tool-handoff'
export { queryJsonPath, type JsonPathResult } from '@/lib/json-path'
import { queryJsonPath } from '@/lib/json-path'
import {
  type JsonView,
  JsoncSyntaxError,
  normalizeJsonc,
  VIEW_OPTIONS,
  jsonStats,
  offsetToLineColumn,
  locateJsonError,
  toText,
  type ParseResult,
} from '@/tools/json-tools/json-model'
import { InspectorPane } from '@/tools/json-tools/JsonInspector'

// Re-exported for consumers that grew up with this being one file: YAML Tools renders the table,
// and the tests reach for the parse helpers.
export { isTabularJsonArray, locateJsonError, normalizeJsonc } from '@/tools/json-tools/json-model'
export { JsonTable } from '@/tools/json-tools/JsonTable'
export { JsonTree } from '@/tools/json-tools/JsonTree'

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
 * Replaces JSONC comments/trailing commas with whitespace so source offsets stay stable.
 *
 * Throws on an unterminated block comment rather than blanking the rest of the file: treating
 * `{"ok":true} /* never closes` as valid would let Format or Minify silently discard it.
 */

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
