import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  ArrowUUpLeftIcon,
  CheckCircleIcon,
  CrosshairSimpleIcon,
  FileCodeIcon,
  FloppyDiskIcon,
  SortAscendingIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useMonaco } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useToolAction } from '@/hooks/useToolAction'
import { CopyButton } from '@/components/shared/CopyButton'
import { Kbd } from '@/components/shared/Kbd'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Button } from '@/components/shared/Button'
import { Alert } from '@/components/shared/Alert'
import { EmptyState } from '@/components/shared/EmptyState'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Select } from '@/components/shared/Input'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { useUiStore } from '@/stores/ui.store'
import { saveFileDialog } from '@/lib/file-io'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import {
  documentsToJson,
  hasUnpreservableSyntax,
  jsonToYaml,
  parseYamlStream,
  sortKeysDeep,
  stringifyYamlStream,
  yamlStats,
  type YamlParse,
} from '@/tools/yaml-tools/yaml-helpers'
import { useCopyToClipboard, type CopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatShortcut } from '@/lib/shortcut-label'
import { InspectorTree } from '@/components/shared/InspectorTree'

type YamlView = 'source' | 'tree' | 'json'

type YamlToolsState = {
  input: string
  fileName: string | null
  /**
   * Tree and JSON used to be tabs that replaced the editor, so inspecting a
   * document meant leaving it, and the conversion tab kept its own second
   * buffer that drifted out of sync with the one being edited. They are panes
   * beside the source now, and the view choice persists.
   */
  view: YamlView
  tabWidth: number
}

/** Above this many keys the tree starts collapsed — expanding is one click. */
const LARGE_DOCUMENT_KEYS = 500

const VIEW_OPTIONS = [
  { value: 'source' as const, label: 'Source' },
  { value: 'tree' as const, label: 'Tree' },
  { value: 'json' as const, label: 'JSON' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A value short enough for an aria-label, with strings marked as strings. */
function toLabel(value: unknown): string {
  const text = typeof value === 'string' ? `"${value}"` : String(value)
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

function toText(value: unknown): string {
  return typeof value === 'object' && value !== null
    ? JSON.stringify(value, null, 2)
    : String(value)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function YamlTools() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const [state, updateState] = useToolState<YamlToolsState>('yaml-tools', {
    input: '',
    fileName: null,
    view: 'source',
    tabWidth: 2,
  })
  const { record } = useToolHistory({ toolId: 'yaml-tools' })

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
  // Reshaping drops comments; an undo that does not depend on Monaco's history
  // is the difference between "annoying" and "lost work".
  const [undoBuffer, setUndoBuffer] = useState<{ input: string; label: string } | null>(null)
  // Lives here rather than in the pane so switching to Source or Tree does not
  // silently throw away an unapplied edit.
  const [jsonDraft, setJsonDraft] = useState<string | null>(null)

  const { input, view } = state
  const inputRef = useRef(input)
  inputRef.current = input
  const hasInput = input.trim().length > 0

  // Parsing (and the stats walk over the result) runs off a debounced copy of
  // the buffer: on a large manifest doing it per keystroke costs a frame, and a
  // live region that re-announces the whole verdict on every character is
  // unusable with a screen reader.
  const [parseSource, setParseSource] = useState(input)
  useEffect(() => {
    const timer = setTimeout(() => setParseSource(input), 250)
    return () => clearTimeout(timer)
  }, [input])

  const parsed = useMemo<YamlParse>(() => parseYamlStream(parseSource), [parseSource])
  const isValid = parsed.status === 'valid'
  const documents = parsed.status === 'valid' ? parsed.documents : []

  const stats = useMemo(
    () => (parsed.status === 'valid' ? yamlStats(parsed.documents) : null),
    [parsed]
  )

  const status =
    parsed.status === 'empty'
      ? 'Nothing to inspect yet'
      : parsed.status === 'invalid'
        ? parsed.location
          ? `Invalid YAML — ${parsed.message} — line ${parsed.location.line}, column ${parsed.location.column}`
          : `Invalid YAML — ${parsed.message}`
        : stats
          ? `Valid YAML · ${documents.length > 1 ? `${documents.length} documents · ` : ''}${stats.keys} key${stats.keys === 1 ? '' : 's'} · depth ${stats.depth} · ${stats.size}`
          : 'Valid YAML'

  // --- Actions ---------------------------------------------------------

  const recordRun = useCallback(
    (output: string) => {
      const source = inputRef.current
      record({
        input: `YAML: ${source.slice(0, 300)}${source.length > 300 ? '...' : ''}`,
        output: output.slice(0, 1000),
        subTab: view,
        success: true,
      })
    },
    [record, view]
  )

  /** Writes a reshaped document back, keeping the previous text recoverable. */
  const applyResult = useCallback(
    (next: string, label: string, previous: string) => {
      setUndoBuffer({ input: previous, label })
      updateState({ input: next })
      setError(null)
      recordRun(next)
    },
    [updateState, recordRun]
  )

  const handleFormat = useCallback(async () => {
    if (!formatter || formattingRef.current || !inputRef.current.trim()) return
    formattingRef.current = true
    setIsFormatting(true)
    const snapshot = inputRef.current
    try {
      const result = await formatter.format(snapshot, {
        language: 'yaml',
        tabWidth: state.tabWidth ?? 2,
      })
      // Writing the result over a buffer the user kept typing into would
      // silently eat those keystrokes.
      if (inputRef.current !== snapshot) {
        setLastAction('Document changed while formatting — try again', 'info')
        return
      }
      applyResult(result, 'Formatted YAML', snapshot)
      setLastAction('Formatted YAML', 'success')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      setLastAction('Format failed', 'error')
    } finally {
      formattingRef.current = false
      setIsFormatting(false)
    }
  }, [formatter, applyResult, setLastAction, state.tabWidth])

  const reshape = useCallback(
    (transform: (documents: unknown[]) => string, label: string) => {
      // Parsed fresh rather than read off the debounced memo, so a click landing
      // within the debounce window reshapes what is actually in the buffer.
      const snapshot = inputRef.current
      const current = parseYamlStream(snapshot)
      if (current.status !== 'valid') {
        setLastAction(`${label} — the document does not parse`, 'error')
        return
      }
      try {
        const next = transform(current.documents)
        applyResult(next, label, snapshot)
        if (hasUnpreservableSyntax(snapshot)) {
          setLastAction(`${label} — comments and anchors were not preserved`, 'info')
        } else {
          setLastAction(label, 'success')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setLastAction(`${label} failed`, 'error')
      }
    },
    [applyResult, setLastAction]
  )

  const handleSortKeys = useCallback(
    () => reshape((docs) => stringifyYamlStream(docs.map(sortKeysDeep)), 'Sorted keys'),
    [reshape]
  )

  // The old "minify" only stripped blank lines. Flow style is what a compact
  // YAML document actually looks like.
  const handleCompact = useCallback(
    () => reshape((docs) => stringifyYamlStream(docs, { flowLevel: 0 }), 'Compacted YAML'),
    [reshape]
  )

  /**
   * The old Convert tab went JSON → YAML in a buffer of its own. Editing the
   * JSON pane and applying it keeps that direction without a second document to
   * keep in sync.
   */
  const handleApplyJson = useCallback(
    (json: string) => {
      const snapshot = inputRef.current
      try {
        // A stream is shown as a JSON array; dumping that array as one document
        // would turn N documents into a single sequence — a different document.
        const data: unknown = JSON.parse(json)
        const current = parseYamlStream(snapshot)
        const wasStream = current.status === 'valid' && current.documents.length > 1
        const next = wasStream && Array.isArray(data) ? stringifyYamlStream(data) : jsonToYaml(json)
        applyResult(next, 'Applied JSON', snapshot)
        setLastAction('Applied JSON to YAML', 'success')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setLastAction('Apply failed', 'error')
      }
    },
    [applyResult, setLastAction]
  )

  const handleUndo = useCallback(() => {
    if (!undoBuffer) return
    updateState({ input: undoBuffer.input })
    setUndoBuffer(null)
    setLastAction('Reverted', 'info')
  }, [undoBuffer, updateState, setLastAction])

  const handleSave = useCallback(() => {
    void saveFileDialog(inputRef.current, state.fileName ?? 'document.yaml').then(
      (path) => setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
      (err: unknown) =>
        setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    )
  }, [state.fileName, setLastAction])

  // The parse error knows where it is; without this the user reads the line
  // number and then scrolls to find it by hand.
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
      setUndoBuffer(null)
      setJsonDraft(null)
      setLastAction(`Opened ${action.filename}`, 'success')
    }
    if (action.type === 'save-file') {
      if (!inputRef.current.trim()) {
        setLastAction('Nothing to save yet', 'info')
        return
      }
      handleSave()
    }
    if (action.type === 'copy-output') {
      void copy(inputRef.current, { success: 'Copied YAML' })
    }
  })

  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      void handleFormat()
    }, [handleFormat])
  )

  return (
    <ToolLayout
      fullBleed
      toolbar={
        // No seam: nothing stacks under the toolbar inside this wrapper, so a border here would
        // be the single-row divider the toolbar primitive dropped, moved onto the wrapper.
        <div>
          <DocumentToolbar aria-label="YAML document actions">
            <DocumentIdentity
              title={state.fileName ?? 'Untitled'}
              icon={
                <FileCodeIcon
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
              <SegmentedControl
                aria-label="View"
                value={view}
                onChange={(next) => updateState({ view: next })}
                options={VIEW_OPTIONS}
              />
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                Indent
                <Select
                  aria-label="YAML indent width"
                  value={state.tabWidth ?? 2}
                  onChange={(event) => updateState({ tabWidth: Number(event.target.value) })}
                >
                  <option value={2}>2 spaces</option>
                  <option value={4}>4 spaces</option>
                  <option value={8}>8 spaces</option>
                </Select>
              </label>
            </ToolbarGroup>

            <ToolbarGroup label="Document actions" separated>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleFormat()}
                disabled={!hasInput || isFormatting}
                loading={isFormatting}
                title={`Format the document (${formatShortcut('mod+enter')})`}
              >
                Format
                <Kbd keys="mod+enter" variant="inline" className="ml-1" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSortKeys}
                disabled={!hasInput}
                className="gap-1"
              >
                <SortAscendingIcon size={14} aria-hidden="true" />
                Sort keys
              </Button>
              <Button variant="secondary" size="sm" onClick={handleCompact} disabled={!hasInput}>
                Compact
              </Button>
              {undoBuffer && (
                <Button variant="ghost" size="sm" onClick={handleUndo} className="gap-1">
                  <ArrowUUpLeftIcon size={14} aria-hidden="true" />
                  Undo {undoBuffer.label.toLowerCase()}
                </Button>
              )}
              <CopyButton text={input} label="Copy YAML" />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSave}
                disabled={!hasInput}
                title={`Save to a file (${formatShortcut('mod+s')})`}
                aria-label="Save YAML to file"
                className="gap-1"
              >
                <FloppyDiskIcon size={14} aria-hidden="true" />
                Save
              </Button>
            </ToolbarGroup>
          </DocumentToolbar>
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
          aria-label="YAML source"
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <Editor
            theme={monacoTheme}
            language="yaml"
            value={input}
            onChange={(v) => {
              updateState({ input: v ?? '' })
              // Reverting to a snapshot taken before the last few minutes of
              // typing would throw that typing away, so the offer expires on
              // the first manual edit.
              setUndoBuffer(null)
              // The banner reports a failed action on the *old* text; leaving it
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
                icon={FileCodeIcon}
                title="Paste or open a YAML document"
                description={`Format with ${formatShortcut('mod+enter')}, inspect it as a tree, and read it as JSON — multi-document streams included.`}
                action={
                  TOOL_SAMPLES['yaml-tools'] ? (
                    <span className="pointer-events-auto">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => updateState({ input: TOOL_SAMPLES['yaml-tools'] ?? '' })}
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
            monacoTheme={monacoTheme}
            monacoOptions={monacoOptions}
            jsonDraft={jsonDraft}
            onJsonDraftChange={setJsonDraft}
            onApplyJson={handleApplyJson}
          />
        )}
      </div>
    </ToolLayout>
  )
}

// ---------------------------------------------------------------------------
// Inspector (tree / json)
// ---------------------------------------------------------------------------

const PANE_LABELS: Record<Exclude<YamlView, 'source'>, string> = {
  tree: 'Tree view',
  json: 'JSON view',
}

function InspectorPane({
  view,
  parsed,
  keyCount,
  monacoTheme,
  monacoOptions,
  jsonDraft,
  onJsonDraftChange,
  onApplyJson,
}: {
  view: Exclude<YamlView, 'source'>
  parsed: YamlParse
  keyCount: number
  monacoTheme: string
  monacoOptions: Record<string, unknown>
  jsonDraft: string | null
  onJsonDraftChange: (draft: string | null) => void
  onApplyJson: (json: string) => void
}) {
  return (
    <section
      aria-label={PANE_LABELS[view]}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-[var(--color-border)] max-[900px]:border-l-0 max-[900px]:border-t"
    >
      {/* JSON stays editable in every state: it is also the way in for someone
          who has JSON and wants YAML back, which used to be its own tab. */}
      {view === 'json' ? (
        <JsonPane
          parsed={parsed}
          monacoTheme={monacoTheme}
          monacoOptions={monacoOptions}
          draft={jsonDraft}
          onDraftChange={onJsonDraftChange}
          onApply={onApplyJson}
        />
      ) : parsed.status === 'empty' ? (
        <EmptyState size="sm" title="Nothing to inspect" description="Add a document first." />
      ) : parsed.status === 'invalid' ? (
        // The pane used to go blank on a parse error, which reads as "no data"
        // rather than "the document does not parse".
        <EmptyState
          size="sm"
          icon={WarningCircleIcon}
          title="Invalid YAML"
          description={
            parsed.location
              ? `${parsed.message} — line ${parsed.location.line}, column ${parsed.location.column}`
              : parsed.message
          }
        />
      ) : (
        <TreePane documents={parsed.documents} keyCount={keyCount} />
      )}
    </section>
  )
}

function TreePane({ documents, keyCount }: { documents: unknown[]; keyCount: number }) {
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

  return (
    <>
      <PaneHeader
        title="Tree"
        actions={
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
        }
      />
      <div
        className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs"
        // Remount when the default changes, otherwise editing a document across
        // the threshold leaves the old expansion in place.
        key={`${treeKey}-${String(expanded)}`}
      >
        {documents.map((document, i) => (
          <div key={i}>
            {documents.length > 1 && (
              <SectionLabel as="div" className="mt-2">
                Document {i + 1}
              </SectionLabel>
            )}
            <InspectorTree
              data={document}
              rootPath={documents.length > 1 ? `$[${i}]` : '$'}
              defaultExpanded={expanded}
            />
          </div>
        ))}
      </div>
    </>
  )
}

function JsonPane({
  parsed,
  monacoTheme,
  monacoOptions,
  draft,
  onDraftChange,
  onApply,
}: {
  parsed: YamlParse
  monacoTheme: string
  monacoOptions: Record<string, unknown>
  /** `null` means "mirroring the YAML"; a string means the user took it over. */
  draft: string | null
  onDraftChange: (draft: string | null) => void
  onApply: (json: string) => void
}) {
  // Conversion used to need a Convert click and was thrown away on every
  // keystroke, so the pane was empty most of the time it was open.
  const json = useMemo(() => {
    if (parsed.status !== 'valid') return ''
    try {
      return documentsToJson(parsed.documents)
    } catch {
      return ''
    }
  }, [parsed])

  const value = draft ?? json

  const draftError = useMemo(() => {
    if (draft === null || !draft.trim()) return null
    try {
      JSON.parse(draft)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }, [draft])

  const canApply = draft !== null && draft.trim().length > 0 && draftError === null

  return (
    <>
      <PaneHeader
        title="JSON"
        actions={
          <>
            <CopyButton text={value} label="Copy JSON" />
            {draft !== null && (
              <>
                {/* Secondary: the toolbar's Format is the tool's primary. This row only appears
                    when a draft exists, so it doesn't need an accent to be found. */}
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    onApply(draft)
                    onDraftChange(null)
                  }}
                  disabled={!canApply}
                  title="Replace the YAML document with this JSON"
                >
                  Apply to YAML
                </Button>
                <Button variant="ghost" size="xs" onClick={() => onDraftChange(null)}>
                  Discard edits
                </Button>
                <span className="text-2xs text-[var(--color-text-muted)]">
                  {draftError ? `Invalid JSON — ${draftError}` : 'Edited — not applied'}
                </span>
              </>
            )}
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Editor
          theme={monacoTheme}
          language="json"
          value={value}
          onChange={(next) => onDraftChange(next ?? '')}
          options={monacoOptions}
        />
      </div>
    </>
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

export function YamlTree({
  data,
  path,
  defaultExpanded,
  onCopy,
}: {
  data: unknown
  path: string
  defaultExpanded: boolean
  onCopy: CopyToClipboard
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const copyValue = useCallback(
    (value: unknown) => void onCopy(toText(value), { success: 'Copied value' }),
    [onCopy]
  )
  const copyPath = useCallback(
    () => void onCopy(path, { success: `Copied path ${path}` }),
    [onCopy, path]
  )

  if (data === null || data === undefined)
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
        label={`Copy value ${toLabel(data)}`}
      >
        {String(data)}
      </TreeValueButton>
    )
  if (typeof data === 'number')
    return (
      <TreeValueButton
        className="text-[var(--color-accent)]"
        onClick={() => copyValue(data)}
        label={`Copy value ${toLabel(data)}`}
      >
        {data}
      </TreeValueButton>
    )
  if (typeof data === 'string')
    return (
      <TreeValueButton
        className="text-[var(--color-success)]"
        onClick={() => copyValue(data)}
        label={`Copy value ${toLabel(data)}`}
      >
        {/* Quoted like the JSON tree: without it a quoted "30" and the number
            30 are the same row, which is exactly the YAML trap worth seeing. */}
        &quot;{data}&quot;
      </TreeValueButton>
    )
  if (data instanceof Date)
    return (
      <TreeValueButton
        className="text-[var(--color-info)]"
        onClick={() => copyValue(data.toISOString())}
        label={`Copy value ${toLabel(data.toISOString())}`}
      >
        {data.toISOString()}
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
          className="text-[var(--color-text-muted)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
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
                <span className="text-[var(--color-accent)]">{key}</span>
                <span className="text-[var(--color-text-muted)]">: </span>
              </>
            )}
            <YamlTree
              data={value}
              path={isArray ? `${path}[${key}]` : `${path}.${key}`}
              defaultExpanded={defaultExpanded}
              onCopy={onCopy}
            />
          </div>
        ))}
    </div>
  )
}
