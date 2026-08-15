import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import {
  ArrowUUpLeftIcon,
  CheckCircleIcon,
  CrosshairSimpleIcon,
  DownloadSimpleIcon,
  FloppyDiskIcon,
  MagicWandIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useToolAction } from '@/hooks/useToolAction'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input, Select } from '@/components/shared/Input'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { useUiStore } from '@/stores/ui.store'
import { saveFileDialog } from '@/lib/file-io'
import {
  MAX_ISSUES,
  generateSample,
  inferSchema,
  parseJson,
  pointerLocation,
  validateJson,
  type JsonLocation,
  type ValidationIssue,
  type ValidationReport,
} from '@/tools/json-schema-validator/json-schema-helpers'
import {
  DEFAULT_TEMPLATE_KEY,
  TEMPLATES,
  findMatchingTemplate,
} from '@/tools/json-schema-validator/templates'

type Pane = 'data' | 'schema'

type JsonSchemaState = {
  data: string
  schema: string
  strict: boolean
  schemaUrl: string
  dataFileName: string | null
  schemaFileName: string | null
}

const DEFAULT_TEMPLATE = TEMPLATES[DEFAULT_TEMPLATE_KEY]

/**
 * Parsing on every keystroke of a large document costs a frame, and a live
 * region that re-announces the verdict per character is unusable aloud.
 */
const VALIDATE_DEBOUNCE_MS = 250

/** A schema fetch that never answers should not leave the button spinning. */
const FETCH_TIMEOUT_MS = 15_000

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JsonSchemaValidator() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const [state, updateState] = useToolState<JsonSchemaState>('json-schema-validator', {
    data: '',
    schema: DEFAULT_TEMPLATE ? JSON.stringify(DEFAULT_TEMPLATE.schema, null, 2) : '',
    strict: false,
    schemaUrl: '',
    dataFileName: null,
    schemaFileName: null,
  })
  const { record } = useToolHistory({ toolId: 'json-schema-validator' })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const { data, schema, strict } = state
  // Handlers need the *current* buffers without re-subscribing every keystroke.
  // Written after commit rather than during render: a render that React throws
  // away must not leave these pointing at text the user never saw.
  const dataRef = useRef(data)
  const schemaRef = useRef(schema)
  useEffect(() => {
    dataRef.current = data
    schemaRef.current = schema
  }, [data, schema])

  const [loadingUrl, setLoadingUrl] = useState(false)
  // Every generator here overwrites a whole buffer. Without a way back, one
  // click on "Infer schema" silently destroys a hand-written schema.
  const [undoBuffer, setUndoBuffer] = useState<{
    data: string
    schema: string
    label: string
  } | null>(null)
  const [problemsOpen, setProblemsOpen] = useState(true)
  const [templateKey, setTemplateKey] = useState(DEFAULT_TEMPLATE_KEY)

  const editors = useRef<Record<Pane, Parameters<OnMount>[0] | null>>({ data: null, schema: null })
  // ⌘S has to save *something*; the pane the user last typed in is the only
  // honest guess, and it is what any other two-editor tool does.
  const lastFocused = useRef<Pane>('data')

  // --- Validation ------------------------------------------------------

  const [source, setSource] = useState({ data, schema })
  useEffect(() => {
    const timer = setTimeout(() => setSource({ data, schema }), VALIDATE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [data, schema])

  const report = useMemo<ValidationReport>(
    () => validateJson(source.data, source.schema, { strict }),
    [source, strict]
  )

  const { headline, detail } = describeReport(report)

  // The old tool pushed "Valid" into the global status bar on every debounce
  // tick, so the bar reported this tool's opinion instead of the user's last
  // action. Only a change of verdict is worth recording — and the key is the
  // headline, not the detail, because the detail carries the line and column,
  // which move with every character typed inside a broken document.
  const lastRecorded = useRef<string | null>(null)
  useEffect(() => {
    if (report.status === 'empty') return
    if (lastRecorded.current === headline) return
    lastRecorded.current = headline
    // The validated snapshot, not the live buffer: recording text that was
    // never validated would make the history entry a lie.
    const snapshot = source.data
    record({
      input: `Data: ${snapshot.slice(0, 300)}${snapshot.length > 300 ? '…' : ''}`,
      output: detail ? `${headline} — ${detail}` : headline,
      success: report.status === 'valid',
    })
  }, [report.status, headline, detail, source.data, record])

  // --- Navigation ------------------------------------------------------

  const goTo = useCallback((pane: Pane, location: JsonLocation) => {
    const editor = editors.current[pane]
    if (!editor) return
    const position = { lineNumber: location.line, column: location.column }
    editor.revealPositionInCenter(position)
    editor.setPosition(position)
    editor.focus()
  }, [])

  const errorLocation =
    (report.status === 'data-error' || report.status === 'schema-error') && report.location
      ? { pane: (report.status === 'data-error' ? 'data' : 'schema') as Pane, at: report.location }
      : null

  // A pointer like /items/3/name is where the problem *is*; reading the pointer
  // and then hunting for that line by hand is the slow half of the job.
  const goToIssue = useCallback(
    (issue: ValidationIssue) => {
      // The validated text, not the live buffer: within the debounce window
      // the two differ, and the pointer was resolved against the former.
      const location = pointerLocation(source.data, issue.pointer)
      if (!location) {
        setLastAction('Could not locate that path in the document', 'info')
        return
      }
      goTo('data', location)
    },
    [goTo, setLastAction, source.data]
  )

  // --- Buffer actions --------------------------------------------------

  /** Replaces buffers, keeping the previous contents recoverable. */
  const applyBuffers = useCallback(
    (next: Partial<JsonSchemaState>, label: string) => {
      setUndoBuffer({ data: dataRef.current, schema: schemaRef.current, label })
      updateState(next)
    },
    [updateState]
  )

  const handleUndo = useCallback(() => {
    if (!undoBuffer) return
    updateState({ data: undoBuffer.data, schema: undoBuffer.schema })
    setUndoBuffer(null)
    setLastAction('Reverted', 'info')
  }, [undoBuffer, updateState, setLastAction])

  const loadTemplate = useCallback(
    (key: string) => {
      const template = TEMPLATES[key]
      if (!template) return
      applyBuffers(
        {
          schema: JSON.stringify(template.schema, null, 2),
          data: JSON.stringify(template.sample, null, 2),
        },
        `Load ${template.label}`
      )
      setLastAction(`Loaded the ${template.label} template`, 'info')
    },
    [applyBuffers, setLastAction]
  )

  const handleInferSchema = useCallback(() => {
    // Read fresh rather than off the debounced snapshot: a click landing inside
    // the debounce window must infer from what is actually in the buffer.
    const parsed = parseJson(dataRef.current)
    if (parsed.status !== 'valid') {
      setLastAction(
        parsed.status === 'empty' ? 'Add some JSON data first' : 'The JSON data does not parse',
        'error'
      )
      return
    }
    applyBuffers({ schema: JSON.stringify(inferSchema(parsed.value), null, 2) }, 'Infer schema')
    setLastAction('Inferred a schema from the data', 'success')
  }, [applyBuffers, setLastAction])

  const handleGenerateSample = useCallback(() => {
    const parsed = parseJson(schemaRef.current)
    if (parsed.status !== 'valid') {
      setLastAction(
        parsed.status === 'empty' ? 'Add a schema first' : 'The schema does not parse',
        'error'
      )
      return
    }
    const template = findMatchingTemplate(parsed.value)
    const sample = template
      ? template.sample
      : generateSample((parsed.value ?? {}) as Record<string, unknown>)
    applyBuffers({ data: JSON.stringify(sample, null, 2) }, 'Generate sample')
    setLastAction(template ? 'Loaded the template sample' : 'Generated sample data', 'success')
  }, [applyBuffers, setLastAction])

  const handleFormat = useCallback(
    (pane: Pane) => {
      const text = pane === 'data' ? dataRef.current : schemaRef.current
      const parsed = parseJson(text)
      if (parsed.status !== 'valid') {
        setLastAction(`The ${pane} does not parse`, 'error')
        return
      }
      const formatted = JSON.stringify(parsed.value, null, 2)
      if (formatted === text) return
      applyBuffers(pane === 'data' ? { data: formatted } : { schema: formatted }, `Format ${pane}`)
      setLastAction('Formatted', 'success')
    },
    [applyBuffers, setLastAction]
  )

  const handleSave = useCallback(
    (pane: Pane) => {
      const text = pane === 'data' ? dataRef.current : schemaRef.current
      if (!text.trim()) {
        setLastAction('Nothing to save yet', 'info')
        return
      }
      const fallback = pane === 'data' ? 'data.json' : 'schema.json'
      const name = (pane === 'data' ? state.dataFileName : state.schemaFileName) ?? fallback
      void saveFileDialog(text, name).then(
        (path) =>
          setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
        (err: unknown) =>
          setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
      )
    },
    [state.dataFileName, state.schemaFileName, setLastAction]
  )

  // --- Schema from a URL -----------------------------------------------

  const fetchIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const handleLoadUrl = useCallback(async () => {
    const url = state.schemaUrl.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      setLastAction('Enter an http(s) URL', 'error')
      return
    }
    // Two loads in flight would otherwise race, and the slower one would win.
    const id = ++fetchIdRef.current
    // Superseding a request should also stop it: the old one is now waste.
    abortRef.current?.abort()
    setLoadingUrl(true)
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      // The Tauri HTTP client, not the WebView's: schema hosts do not send
      // CORS headers, so a browser `fetch` fails on almost every real URL.
      const response = await tauriFetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`the server answered ${response.status}`)
      const text = await response.text()
      const parsed = parseJson(text)
      if (parsed.status !== 'valid') throw new Error('the response is not valid JSON')
      if (id !== fetchIdRef.current) return
      applyBuffers({ schema: JSON.stringify(parsed.value, null, 2) }, 'Load schema from URL')
      setLastAction('Loaded the schema from the URL', 'success')
    } catch (e) {
      if (id !== fetchIdRef.current) return
      const raw = e instanceof Error ? e.message : String(e)
      const message =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'the request timed out'
          : // Tauri denies hosts outside the capability scope with wording no
            // user could act on; naming the restriction is the actionable part.
            /scope/i.test(raw)
            ? 'this host is not in the app’s allowed list'
            : raw
      setLastAction(`Could not load the schema — ${message}`, 'error')
    } finally {
      clearTimeout(timeout)
      if (id === fetchIdRef.current) {
        abortRef.current = null
        setLoadingUrl(false)
      }
    }
  }, [state.schemaUrl, applyBuffers, setLastAction])

  // --- Shell integration -----------------------------------------------

  useToolAction((action) => {
    if (action.type === 'open-file') {
      // Either buffer is a plausible target for a .json file. A file that
      // announces itself as a schema goes to the schema pane; anything else is
      // data, which is what people open far more often.
      const looksLikeSchema =
        /schema/i.test(action.filename) || /"\$schema"\s*:/.test(action.content.slice(0, 2000))
      // Undoable like every other buffer replacement here: a file dropped onto
      // the wrong pane is exactly when you want the previous contents back.
      applyBuffers(
        looksLikeSchema
          ? { schema: action.content, schemaFileName: action.filename }
          : { data: action.content, dataFileName: action.filename },
        `Open ${action.filename}`
      )
      setLastAction(
        `Opened ${action.filename} as ${looksLikeSchema ? 'the schema' : 'the data'}`,
        'success'
      )
      return
    }
    if (action.type === 'save-file') {
      handleSave(lastFocused.current)
      return
    }
    if (action.type === 'copy-output') {
      const text = lastFocused.current === 'schema' ? schemaRef.current : dataRef.current
      void navigator.clipboard.writeText(text).then(
        () => setLastAction('Copied', 'success'),
        () => setLastAction('Copy failed', 'error')
      )
    }
  })

  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      // Skips the debounce and re-announces the verdict on demand. Without the
      // status message the shortcut looked broken whenever the buffers were
      // already validated and nothing on screen changed.
      setSource({ data: dataRef.current, schema: schemaRef.current })
      lastRecorded.current = null
      setLastAction('Revalidated', 'info')
    }, [setLastAction])
  )

  const issues = report.status === 'invalid' ? report.issues : []
  const hasProblems = issues.length > 0

  // Bound per pane once. Building these inline handed Monaco a new `onChange`
  // and `onMount` identity on every keystroke, which it re-binds on.
  const mountData = useCallback((editor: Parameters<OnMount>[0]) => {
    editors.current.data = editor
    editor.onDidFocusEditorText(() => {
      lastFocused.current = 'data'
    })
  }, [])
  const mountSchema = useCallback((editor: Parameters<OnMount>[0]) => {
    editors.current.schema = editor
    editor.onDidFocusEditorText(() => {
      lastFocused.current = 'schema'
    })
  }, [])

  const changeData = useCallback(
    (value: string | undefined) => {
      updateState({ data: value ?? '' })
      // Reverting to a snapshot taken before the last few minutes of typing
      // would throw that typing away, so the offer expires on a manual edit.
      setUndoBuffer(null)
    },
    [updateState]
  )
  const changeSchema = useCallback(
    (value: string | undefined) => {
      updateState({ schema: value ?? '' })
      setUndoBuffer(null)
    },
    [updateState]
  )

  const formatData = useCallback(() => handleFormat('data'), [handleFormat])
  const formatSchema = useCallback(() => handleFormat('schema'), [handleFormat])
  const saveData = useCallback(() => handleSave('data'), [handleSave])
  const saveSchema = useCallback(() => handleSave('schema'), [handleSave])

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--color-border)] px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <StatusIcon status={report.status} />
            <span
              role="status"
              aria-live="polite"
              className="shrink-0 text-xs text-[var(--color-text)]"
            >
              {headline}
            </span>
            {detail && (
              // Outside the live region on purpose: this is the part that
              // changes character by character while a document is broken.
              <span className="min-w-0 truncate text-xs text-[var(--color-text-muted)]">
                {detail}
              </span>
            )}
            {errorLocation && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => goTo(errorLocation.pane, errorLocation.at)}
                title="Move the cursor to the parse error"
                className="shrink-0 gap-1"
              >
                <CrosshairSimpleIcon size={12} aria-hidden="true" />
                Go to error
              </Button>
            )}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select
              aria-label="Template"
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              // The hints live on the options' titles: spelled out in the
              // labels they stretched the closed select across the toolbar.
              className="w-40"
            >
              {Object.entries(TEMPLATES).map(([key, template]) => (
                <option key={key} value={key} title={template.hint}>
                  {template.label}
                </option>
              ))}
            </Select>
            {/* Loading straight from the select's change event destroyed both
                buffers as soon as the keyboard moved through the list, since
                WebKit fires `change` per arrow key on a closed select. */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadTemplate(templateKey)}
              title="Replace both panes with this template and its sample"
            >
              Load template
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleInferSchema}
              className="gap-1"
              title="Replace the schema with one inferred from the data"
            >
              <MagicWandIcon size={13} aria-hidden="true" />
              Infer schema
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerateSample}
              title="Replace the data with a sample the schema accepts"
            >
              Sample data
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-pressed={strict}
              onClick={() => updateState({ strict: !strict })}
              title="Strict mode reports schema authoring mistakes instead of ignoring them"
              className={
                strict ? 'border-[var(--color-warning)] text-[var(--color-warning)]' : undefined
              }
            >
              Strict
            </Button>
            {undoBuffer && (
              <Button variant="ghost" size="sm" onClick={handleUndo} className="gap-1">
                <ArrowUUpLeftIcon size={13} aria-hidden="true" />
                Undo {undoBuffer.label.toLowerCase()}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 max-[900px]:flex-col">
          <EditorPane
            title="JSON Data"
            fileName={state.dataFileName}
            value={data}
            monacoTheme={monacoTheme}
            monacoOptions={monacoOptions}
            onChange={changeData}
            onMount={mountData}
            onFormat={formatData}
            onSave={saveData}
            copyLabel="Copy data"
            className="border-r border-[var(--color-border)] max-[900px]:border-r-0 max-[900px]:border-b"
            empty={
              !data.trim() ? (
                <EmptyState
                  size="sm"
                  icon={ShieldCheckIcon}
                  title="Paste the JSON you want to check"
                  description="Or pick a template, then edit either side — validation is live."
                  action={
                    <span className="pointer-events-auto">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => loadTemplate(DEFAULT_TEMPLATE_KEY)}
                      >
                        Load sample
                      </Button>
                    </span>
                  }
                />
              ) : null
            }
          />
          <EditorPane
            title="JSON Schema"
            fileName={state.schemaFileName}
            value={schema}
            monacoTheme={monacoTheme}
            monacoOptions={monacoOptions}
            onChange={changeSchema}
            onMount={mountSchema}
            onFormat={formatSchema}
            onSave={saveSchema}
            copyLabel="Copy schema"
            headerExtras={
              <div className="ml-auto flex items-center gap-1">
                <Input
                  type="url"
                  aria-label="Schema URL"
                  placeholder="Schema URL"
                  value={state.schemaUrl}
                  onChange={(e) => updateState({ schemaUrl: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleLoadUrl()
                  }}
                  className="w-28"
                />
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void handleLoadUrl()}
                  loading={loadingUrl}
                  disabled={!state.schemaUrl.trim()}
                  className="gap-1"
                  title="Fetch the schema at this URL"
                >
                  <DownloadSimpleIcon size={12} aria-hidden="true" />
                  Load
                </Button>
              </div>
            }
          />
        </div>

        {hasProblems && (
          <ProblemsPanel
            issues={issues}
            total={report.status === 'invalid' ? report.total : 0}
            open={problemsOpen}
            onToggle={() => setProblemsOpen((o) => !o)}
            onSelect={goToIssue}
          />
        )}
      </div>
    </ToolLayout>
  )
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * Split in two so the live region can announce the verdict without the line
 * and column, which change on every keystroke inside a broken document and
 * turned the announcement into a stutter.
 */
function describeReport(report: ValidationReport): { headline: string; detail: string } {
  const at = (location: JsonLocation | null) =>
    location ? ` (line ${location.line}, column ${location.column})` : ''
  switch (report.status) {
    case 'empty':
      return { headline: 'Add JSON data and a schema to validate', detail: '' }
    case 'data-error':
      return {
        headline: 'The JSON data does not parse',
        detail: `${report.message}${at(report.location)}`,
      }
    case 'schema-error':
      return {
        headline:
          report.kind === 'parse' ? 'The schema does not parse' : 'The schema is not usable',
        detail: `${report.message}${at(report.location)}`,
      }
    case 'valid':
      return { headline: 'Valid — the data matches the schema', detail: '' }
    case 'invalid':
      return {
        headline: `${report.total} problem${report.total === 1 ? '' : 's'} found`,
        detail: '',
      }
  }
}

function StatusIcon({ status }: { status: ValidationReport['status'] }) {
  if (status === 'valid') {
    return (
      <CheckCircleIcon
        size={14}
        aria-hidden="true"
        className="shrink-0 text-[var(--color-success)]"
      />
    )
  }
  if (status === 'empty') {
    return (
      <ShieldCheckIcon
        size={14}
        aria-hidden="true"
        className="shrink-0 text-[var(--color-text-muted)]"
      />
    )
  }
  return (
    <WarningCircleIcon
      size={14}
      aria-hidden="true"
      className="shrink-0 text-[var(--color-error)]"
    />
  )
}

function EditorPane({
  title,
  fileName,
  value,
  monacoTheme,
  monacoOptions,
  onChange,
  onMount,
  onFormat,
  onSave,
  copyLabel,
  headerExtras,
  empty,
  className = '',
}: {
  title: string
  fileName: string | null
  value: string
  monacoTheme: string
  monacoOptions: Record<string, unknown>
  onChange: (value: string | undefined) => void
  onMount: (editor: Parameters<OnMount>[0]) => void
  onFormat: () => void
  onSave: () => void
  /** Distinct per pane: two buttons both reading "Copy" are ambiguous aloud. */
  copyLabel: string
  headerExtras?: ReactNode
  empty?: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${className}`}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] px-3 py-1.5">
        <span className="font-ui text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {title}
        </span>
        {fileName && (
          <span className="max-w-[10rem] truncate text-2xs text-[var(--color-text-muted)]">
            {fileName}
          </span>
        )}
        {headerExtras ?? <span className="ml-auto" />}
        <Button variant="ghost" size="xs" onClick={onFormat} disabled={!value.trim()}>
          Format
        </Button>
        <CopyButton text={value} label={copyLabel} className="min-w-0" />
        <Button
          variant="ghost"
          size="xs"
          onClick={onSave}
          disabled={!value.trim()}
          aria-label={`Save ${title.toLowerCase()} to file`}
          title="Save to a file (⌘S)"
        >
          <FloppyDiskIcon size={13} aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Editor
          theme={monacoTheme}
          language="json"
          value={value}
          onChange={onChange}
          options={monacoOptions}
          onMount={onMount}
        />
      </div>
      {empty && (
        // Click-through: the hint must never sit between the user and the caret.
        <div className="pointer-events-none absolute inset-0 top-8 flex items-center justify-center p-4">
          {empty}
        </div>
      )}
    </section>
  )
}

function ProblemsPanel({
  issues,
  total,
  open,
  onToggle,
  onSelect,
}: {
  issues: ValidationIssue[]
  total: number
  open: boolean
  onToggle: () => void
  onSelect: (issue: ValidationIssue) => void
}) {
  const listId = useId()
  return (
    <section
      aria-label="Problems"
      className="flex max-h-52 min-h-0 shrink-0 flex-col border-t border-[var(--color-border)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5">
        <span className="font-ui text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Problems
        </span>
        <span className="text-2xs text-[var(--color-error)]">{total}</span>
        {total > MAX_ISSUES && (
          <span className="text-2xs text-[var(--color-text-muted)]">
            showing the first {MAX_ISSUES}
          </span>
        )}
        <Button
          variant="ghost"
          size="xs"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={listId}
          className="ml-auto"
        >
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>
      {open && (
        <ul id={listId} className="min-h-0 flex-1 overflow-auto py-1">
          {issues.map((issue, i) => (
            <li key={`${issue.pointer}-${issue.keyword}-${i}`}>
              {/* eslint-disable-next-line no-restricted-syntax -- a full-width list row rather than a control: it must fill the panel and keep the monospace pointer aligned, which every Button variant would override. */}
              <button
                type="button"
                onClick={() => onSelect(issue)}
                title="Jump to this path in the data"
                className="flex w-full items-start gap-2 px-3 py-0.5 text-left text-xs hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <span className="shrink-0 rounded bg-[var(--color-surface)] px-1 text-2xs text-[var(--color-text-muted)]">
                  {issue.keyword}
                </span>
                <code className="shrink-0 text-[var(--color-accent)]">{issue.label}</code>
                <span className="text-[var(--color-error)]">{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
