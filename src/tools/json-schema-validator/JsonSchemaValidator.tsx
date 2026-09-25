import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type OnMount } from '@monaco-editor/react'
import { DownloadSimpleIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useToolAction } from '@/hooks/useToolAction'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useMonaco } from '@/hooks/useMonaco'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input } from '@/components/shared/Input'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { useUiStore } from '@/stores/ui.store'
import {
  describeReport,
  detectSchemaDialect,
  pointerLocation,
  validateJson,
  type JsonLocation,
  type JsonSchemaState,
  type Pane,
  type ValidationIssue,
  type ValidationReport,
} from '@/tools/json-schema-validator/json-schema-helpers'
import { DEFAULT_TEMPLATE_KEY, TEMPLATES } from '@/tools/json-schema-validator/templates'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { EditorPane } from '@/tools/json-schema-validator/components/EditorPane'
import { ProblemsPanel } from '@/tools/json-schema-validator/components/ProblemsPanel'
import { SchemaOutline } from '@/tools/json-schema-validator/components/SchemaSummary'
import { ValidatorToolbar } from '@/tools/json-schema-validator/components/ValidatorToolbar'
import { useJsonSchemaDocumentActions } from '@/tools/json-schema-validator/hooks/useJsonSchemaDocumentActions'
import { useSchemaUrlLoader } from '@/tools/json-schema-validator/hooks/useSchemaUrlLoader'

const DEFAULT_TEMPLATE = TEMPLATES[DEFAULT_TEMPLATE_KEY]

/**
 * Parsing on every keystroke of a large document costs a frame, and a live
 * region that re-announces the verdict per character is unusable aloud.
 */
const VALIDATE_DEBOUNCE_MS = 250

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JsonSchemaValidator() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
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
  const copy = useCopyToClipboard()

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

  const [problemsOpen, setProblemsOpen] = useState(true)
  const [templateKey, setTemplateKey] = useState(DEFAULT_TEMPLATE_KEY)

  const {
    undoBuffer,
    setUndoBuffer,
    applyBuffers,
    handleUndo,
    loadTemplate,
    handleInferSchema,
    handleGenerateSample,
    handleFormat,
    handleSave,
    handleOpen,
  } = useJsonSchemaDocumentActions({ state, updateState, dataRef, schemaRef })
  const { loadingUrl, handleLoadUrl } = useSchemaUrlLoader({
    schemaUrl: state.schemaUrl,
    applyBuffers,
  })

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
  const schemaDialect = useMemo(() => detectSchemaDialect(source.schema), [source.schema])

  // Record only verdict changes so validation does not replace the user's latest action on every
  // debounce. Compare headlines because detail positions change during editing.
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
      void copy(text, { success: 'Copied', failure: 'Copy failed' })
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
    [updateState, setUndoBuffer]
  )
  const changeSchema = useCallback(
    (value: string | undefined) => {
      updateState({ schema: value ?? '' })
      setUndoBuffer(null)
    },
    [updateState, setUndoBuffer]
  )

  const formatData = useCallback(() => handleFormat('data'), [handleFormat])
  const formatSchema = useCallback(() => handleFormat('schema'), [handleFormat])
  const saveData = useCallback(() => handleSave('data'), [handleSave])
  const saveSchema = useCallback(() => handleSave('schema'), [handleSave])

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <ValidatorToolbar
          report={report}
          headline={headline}
          detail={detail}
          schemaDialect={schemaDialect}
          errorLocation={errorLocation}
          goTo={goTo}
          handleOpen={handleOpen}
          templateKey={templateKey}
          setTemplateKey={setTemplateKey}
          loadTemplate={loadTemplate}
          handleInferSchema={handleInferSchema}
          handleGenerateSample={handleGenerateSample}
          strict={strict}
          updateState={updateState}
          undoBuffer={undoBuffer}
          handleUndo={handleUndo}
        />
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
                <SchemaOutline schema={schema} />
                <Input
                  type="url"
                  aria-label="Schema URL"
                  monospace
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
