import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  ArrowRightIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  FileHtmlIcon,
  FilePlusIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  FrameCornersIcon,
  InfoIcon,
  ListBulletsIcon,
  SlidersHorizontalIcon,
  WarningCircleIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useToolAction } from '@/hooks/useToolAction'
import { useMonaco } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { Alert } from '@/components/shared/Alert'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Select } from '@/components/shared/Input'
import { SegmentedControl, type SegmentedControlOption } from '@/components/shared/SegmentedControl'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { useUiStore } from '@/stores/ui.store'
import { openFileDialog, saveFileDialog, filenameFromPath } from '@/lib/file-io'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import {
  ALL_RULES,
  RULE_CATEGORIES,
  TEMPLATES,
  buildRuleset,
  computeStats,
  countIssues,
  countRuleOverrides,
  isRuleEnabled,
  outlineProblems,
  sortIssues,
  templateById,
  toggleRule,
  type HtmlIssue,
  type RuleConfig,
} from '@/tools/html-validator/html-helpers'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

type ViewMode = 'editor' | 'split' | 'preview'
type Panel = 'problems' | 'outline'

type HtmlValidatorState = {
  input: string
  fileName: string | null
  filePath: string | null
  /**
   * The last text written to (or read from) a file — the dirty comparison.
   * `null` means "never established": state saved before this field existed
   * hydrates that way, and treating it as `''` would report every restored
   * document as modified.
   */
  savedContent: string | null
  viewMode: ViewMode
  templateId: string
  showRules: boolean
  panel: Panel
  panelOpen: boolean
  /** Departures from the rule defaults, so new defaults still reach the user. */
  disabledRules: string[]
  enabledRules: string[]
}

type PendingDocument = {
  input: string
  fileName: string | null
  filePath: string | null
  savedContent: string
  successMessage: string
}

const VIEW_OPTIONS: SegmentedControlOption<ViewMode>[] = [
  { value: 'editor', label: 'Editor' },
  { value: 'split', label: 'Split' },
  { value: 'preview', label: 'Preview' },
]

const VALIDATE_DEBOUNCE_MS = 300
/** Longer than validation: reloading the iframe mid-word is the costly one. */
const PREVIEW_DEBOUNCE_MS = 400

export default function HtmlValidator() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const { record } = useToolHistory({ toolId: 'html-validator' })
  const rulesPanelId = useId()

  const [state, updateState] = useToolState<HtmlValidatorState>('html-validator', {
    input: '',
    fileName: null,
    filePath: null,
    savedContent: null,
    viewMode: 'split',
    templateId: TEMPLATES[0]?.id ?? 'minimal',
    showRules: false,
    panel: 'problems',
    panelOpen: true,
    disabledRules: [],
    enabledRules: [],
  })

  const formatter = useWorker<FormatterWorker>(() => new FormatterWorkerFactory(), ['format'])

  const [issues, setIssues] = useState<HtmlIssue[]>([])
  const [isValidating, setIsValidating] = useState(false)
  const [hasValidated, setHasValidated] = useState(false)
  const [isFormatting, setIsFormatting] = useState(false)
  const [formatError, setFormatError] = useState<string | null>(null)
  const [isPopoutOpen, setIsPopoutOpen] = useState(false)
  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null)
  /** Reloading the iframe on every keystroke made typing stutter. */
  const [previewHtml, setPreviewHtml] = useState('')

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)
  const validationSeqRef = useRef(0)
  /**
   * `useToolState` hydrates asynchronously, so the first validation of a restored
   * document looks exactly like one the user triggered. Only typing and explicit
   * buffer swaps set this, and only it lets a run reach history.
   */
  const userEditedRef = useRef(false)

  const input = state.input ?? ''
  const inputRef = useRef(input)
  inputRef.current = input
  const hasInput = input.trim().length > 0
  // Without a known saved text, only text this session produced counts as unsaved.
  const isDirty =
    state.savedContent === null ? userEditedRef.current && hasInput : input !== state.savedContent
  const { disabledRules, enabledRules } = state
  // The editor-only mode used to be called 'edit'. A session that ended there
  // hydrates that value straight past the default, and an unrecognised mode
  // rendered neither pane — so anything that is not preview or split is editor.
  const viewMode: ViewMode =
    state.viewMode === 'preview' || state.viewMode === 'split' ? state.viewMode : 'editor'
  const showEditor = viewMode === 'editor' || viewMode === 'split'
  const showPreview = viewMode === 'preview' || viewMode === 'split'

  // --- Validation ------------------------------------------------------

  useEffect(() => {
    if (!hasInput) {
      validationSeqRef.current += 1
      setIssues([])
      setIsValidating(false)
      setHasValidated(false)
      return
    }
    const seq = validationSeqRef.current + 1
    validationSeqRef.current = seq
    setIsValidating(true)
    // The previous result is kept on screen while the next one is computed:
    // blanking the list on every keystroke made problems flicker in and out and
    // moved the row under the pointer just as it was clicked.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { HTMLHint } = await import('htmlhint')
          const found = HTMLHint.verify(input, buildRuleset(disabledRules, enabledRules))
          if (seq !== validationSeqRef.current) return
          setIssues(
            sortIssues(
              found.map((result) => ({
                message: result.message,
                line: result.line,
                col: result.col,
                type: result.type === 'error' ? ('error' as const) : ('warning' as const),
                rule: result.rule.id,
              }))
            )
          )
        } catch {
          if (seq !== validationSeqRef.current) return
          // Without a verdict of its own the status line would sit at "Checking…"
          // for as long as the tab stayed open.
          setIssues([
            {
              message: 'The HTML checker failed to load',
              line: 1,
              col: 1,
              type: 'error',
              rule: 'internal',
            },
          ])
        } finally {
          if (seq === validationSeqRef.current) {
            setIsValidating(false)
            setHasValidated(true)
          }
        }
      })()
    }, VALIDATE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input, hasInput, disabledRules, enabledRules])

  const { errors: errorCount, warnings: warningCount } = useMemo(
    () => countIssues(issues),
    [issues]
  )
  const stats = useMemo(() => (hasInput ? computeStats(input) : null), [hasInput, input])
  const outlineIssues = useMemo(() => (stats ? outlineProblems(stats.headings) : []), [stats])

  // Only completed runs of text the user actually produced are worth recording;
  // hydrating a tab on startup is not an operation anyone performed.
  useEffect(() => {
    if (!hasValidated || isValidating || !userEditedRef.current || !hasInput) return
    record({
      input: `HTML: ${input.slice(0, 300)}${input.length > 300 ? '...' : ''}`,
      output:
        issues.length === 0
          ? 'No problems found'
          : `${errorCount} error(s), ${warningCount} warning(s)`,
      success: errorCount === 0,
    })
    // Recording is keyed to a finished verdict, not to every dependency of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidated, isValidating, issues])

  // --- Editor markers --------------------------------------------------

  const syncMarkers = useCallback((current: HtmlIssue[]) => {
    const monaco = monacoRef.current
    const model = editorRef.current?.getModel()
    if (!monaco || !model) return
    const lineCount = model.getLineCount()
    monaco.editor.setModelMarkers(
      model,
      'htmlhint',
      current.map((issue) => {
        // A line from a since-shortened document would make Monaco throw.
        const line = Math.min(Math.max(issue.line, 1), lineCount)
        return {
          severity:
            issue.type === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: `${issue.message} (${issue.rule})`,
          startLineNumber: line,
          endLineNumber: line,
          startColumn: Math.max(issue.col, 1),
          endColumn: model.getLineMaxColumn(line),
        }
      })
    )
  }, [])

  // The effect below only runs against a mounted editor, so problems found while
  // the Preview-only pane was showing had no markers once the editor came back.
  const issuesRef = useRef<HtmlIssue[]>(issues)
  issuesRef.current = issues

  /** A jump requested while no editor was mounted, replayed once one is. */
  const pendingIssueRef = useRef<HtmlIssue | null>(null)

  const revealIssue = useCallback((issue: HtmlIssue) => {
    const editor = editorRef.current
    // Leaving Split for Preview unmounts the editor, and Monaco disposes it
    // without our ref noticing. A disposed editor is still truthy but every
    // call on it no-ops, so the jump has to be judged on the model.
    if (!editor || !editor.getModel()) return false
    const position = { lineNumber: issue.line, column: Math.max(issue.col, 1) }
    editor.revealPositionInCenter(position)
    editor.setPosition(position)
    editor.focus()
    return true
  }, [])

  const handleEditorMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      syncMarkers(issuesRef.current)
      const pending = pendingIssueRef.current
      if (pending) {
        pendingIssueRef.current = null
        revealIssue(pending)
      }
    },
    [syncMarkers, revealIssue]
  )

  useEffect(() => {
    syncMarkers(issues)
  }, [issues, syncMarkers])

  // Markers live on the model, which outlives this component.
  useEffect(() => () => syncMarkers([]), [syncMarkers])

  const goToIssue = useCallback(
    (issue: HtmlIssue) => {
      if (revealIssue(issue)) return
      // Monaco resolves asynchronously, so leaving Preview does not put an
      // editor on screen this frame. Hand the jump to the mount instead.
      pendingIssueRef.current = issue
      if (viewMode === 'preview') updateState({ viewMode: 'split' })
    },
    [revealIssue, viewMode, updateState]
  )

  // --- Preview ---------------------------------------------------------

  useEffect(() => {
    if (!hasInput) {
      setPreviewHtml('')
      return
    }
    const timer = setTimeout(() => setPreviewHtml(input), PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input, hasInput])

  // --- Buffer swaps ----------------------------------------------------

  const applyDocument = useCallback(
    (document: PendingDocument) => {
      userEditedRef.current = true
      updateState({
        input: document.input,
        fileName: document.fileName,
        filePath: document.filePath,
        savedContent: document.savedContent,
      })
      setFormatError(null)
      setPendingDocument(null)
      setLastAction(document.successMessage, 'success')
    },
    [updateState, setLastAction]
  )

  // Loading a template used to overwrite the buffer outright, with no undo and
  // no warning — the one destructive action in the tool.
  const requestDocument = useCallback(
    (document: PendingDocument) => {
      // An empty or already-saved buffer has nothing to lose.
      if (isDirty && inputRef.current.trim()) {
        setPendingDocument(document)
        return
      }
      applyDocument(document)
    },
    [isDirty, applyDocument]
  )

  const handleNew = useCallback(() => {
    requestDocument({
      input: '',
      fileName: null,
      filePath: null,
      savedContent: '',
      successMessage: 'New document created',
    })
  }, [requestDocument])

  const handleLoadTemplate = useCallback(() => {
    const template = templateById(state.templateId)
    if (!template) return
    requestDocument({
      input: template.html,
      fileName: null,
      filePath: null,
      // A template is the buffer's starting point, not an edit of it — calling a
      // freshly loaded template "Modified" made loading a second one ask to
      // discard changes nobody had made.
      savedContent: template.html,
      successMessage: `Loaded the ${template.label.toLowerCase()} template`,
    })
  }, [state.templateId, requestDocument])

  const handleLoadSample = useCallback(() => {
    const sample = TOOL_SAMPLES['html-validator']
    if (!sample) return
    requestDocument({
      input: sample,
      fileName: null,
      filePath: null,
      savedContent: sample,
      successMessage: 'Loaded the sample document',
    })
  }, [requestDocument])

  const handleChange = useCallback(
    (value: string | undefined) => {
      userEditedRef.current = true
      updateState({ input: value ?? '' })
      // The banner describes a failed format of the *old* text.
      setFormatError(null)
    },
    [updateState]
  )

  // --- Files -----------------------------------------------------------

  const handleOpen = useCallback(async () => {
    try {
      const result = await openFileDialog()
      if (!result) return
      requestDocument({
        input: result.content,
        fileName: result.filename,
        filePath: result.path,
        savedContent: result.content,
        successMessage: `Opened ${result.filename}`,
      })
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : 'Open failed', 'error')
    }
  }, [requestDocument, setLastAction])

  const handleSave = useCallback(async () => {
    const snapshot = inputRef.current
    if (!snapshot.trim()) {
      setLastAction('Nothing to save yet', 'info')
      return
    }
    try {
      const path = await saveFileDialog(snapshot, state.fileName ?? 'page.html')
      if (!path) {
        setLastAction('Save cancelled', 'info')
        return
      }
      updateState({ filePath: path, fileName: filenameFromPath(path), savedContent: snapshot })
      setLastAction(`Saved ${path}`, 'success')
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : 'Save failed', 'error')
    }
  }, [state.fileName, updateState, setLastAction])

  // --- Format ----------------------------------------------------------

  const handleFormat = useCallback(async () => {
    const snapshot = inputRef.current
    if (!formatter || !snapshot.trim() || isFormatting) return
    setIsFormatting(true)
    try {
      const formatted = await formatter.format(snapshot, { language: 'html', tabWidth: 2 })
      // Writing the result over a buffer the user kept typing into would
      // silently eat those keystrokes.
      if (inputRef.current !== snapshot) {
        setLastAction('Document changed while formatting — try again', 'info')
        return
      }
      userEditedRef.current = true
      updateState({ input: formatted })
      setFormatError(null)
      setLastAction('Formatted HTML', 'success')
    } catch (err) {
      // Prettier refuses to format markup it cannot parse, which is exactly the
      // markup this tool exists to find — so say so instead of failing silently.
      setFormatError(err instanceof Error ? err.message : 'Could not format this document')
      setLastAction('Format failed', 'error')
    } finally {
      setIsFormatting(false)
    }
  }, [formatter, isFormatting, updateState, setLastAction])

  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      void handleFormat()
    }, [handleFormat])
  )

  // --- Global tool actions ---------------------------------------------

  useToolAction((action) => {
    if (action.type === 'open-file') {
      requestDocument({
        input: action.content,
        fileName: action.filename,
        filePath: action.path ?? null,
        savedContent: action.content,
        successMessage: `Opened ${action.filename}`,
      })
    }
    if (action.type === 'save-file') {
      void handleSave()
    }
    if (action.type === 'copy-output' && inputRef.current.trim()) {
      void copy(inputRef.current, { success: 'Copied HTML', failure: 'Copy failed' })
    }
  })

  // --- Rules -----------------------------------------------------------

  const overrideCount = countRuleOverrides(disabledRules, enabledRules)

  const handleToggleRule = useCallback(
    (rule: RuleConfig, next: boolean) => {
      updateState(toggleRule(rule, disabledRules, enabledRules, next))
    },
    [disabledRules, enabledRules, updateState]
  )

  const handleResetRules = useCallback(() => {
    updateState({ disabledRules: [], enabledRules: [] })
    setLastAction('Rules reset to defaults', 'success')
  }, [updateState, setLastAction])

  // --- Status ----------------------------------------------------------

  const status = !hasInput
    ? 'Nothing to check yet'
    : isValidating && !hasValidated
      ? 'Checking…'
      : issues.length === 0
        ? `No problems · ${stats?.elements ?? 0} element${stats?.elements === 1 ? '' : 's'} · depth ${stats?.depth ?? 0}`
        : `${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}`

  return (
    <ToolLayout fullBleed>
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <DocumentToolbar border={false} aria-label="HTML document actions">
          <DocumentIdentity
            title={state.fileName ?? 'Untitled document'}
            titleTooltip={state.filePath ?? state.fileName ?? 'Untitled document'}
            titleTestId="file-name"
            icon={
              <FileHtmlIcon
                size={16}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)]"
              />
            }
            stateLabel={isDirty ? 'Modified' : 'Saved'}
            stateChanged={isDirty}
            status={status}
            statusTestId="validation-status"
            statusIcon={
              hasInput && hasValidated && issues.length === 0 ? (
                <CheckCircleIcon
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-success)]"
                />
              ) : errorCount > 0 ? (
                <WarningCircleIcon
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-error)]"
                />
              ) : errorCount === 0 && warningCount > 0 ? (
                <WarningIcon
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-warning)]"
                />
              ) : undefined
            }
          />

          <ToolbarGroup label="View controls" separated>
            <SegmentedControl
              aria-label="View mode"
              options={VIEW_OPTIONS}
              value={viewMode}
              onChange={(next) => updateState({ viewMode: next })}
            />
          </ToolbarGroup>

          <ToolbarGroup label="Document actions" separated>
            <Button
              variant="icon"
              size="sm"
              onClick={handleNew}
              title="New HTML document"
              aria-label="New HTML document"
            >
              <FilePlusIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              variant="icon"
              size="sm"
              onClick={() => void handleOpen()}
              title="Open an .html file (⌘O)"
              aria-label="Open HTML file"
            >
              <FolderOpenIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              variant="icon"
              size="sm"
              onClick={() => void handleSave()}
              title="Save the document (⌘S)"
              aria-label="Save HTML document"
            >
              <FloppyDiskIcon size={14} aria-hidden="true" />
            </Button>
          </ToolbarGroup>

          <ToolbarGroup label="Template actions" separated>
            <Select
              aria-label="Starter template"
              value={state.templateId}
              onChange={(e) => updateState({ templateId: e.target.value })}
            >
              {TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </Select>
            <Button variant="secondary" size="sm" onClick={handleLoadTemplate}>
              Load
            </Button>
          </ToolbarGroup>

          <ToolbarGroup label="Markup output" separated>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleFormat()}
              disabled={!hasInput || isFormatting}
              loading={isFormatting}
              title="Reformat the markup (⌘↵)"
            >
              Format
              <span className="ml-1 text-2xs opacity-70" aria-hidden="true">
                ⌘↵
              </span>
            </Button>
            <CopyButton text={input} label="Copy HTML" />
          </ToolbarGroup>

          <Button
            variant={state.showRules ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => updateState({ showRules: !state.showRules })}
            aria-expanded={state.showRules}
            aria-controls={rulesPanelId}
            className="gap-1"
          >
            <SlidersHorizontalIcon size={14} aria-hidden="true" />
            Rules
            {overrideCount > 0 && (
              <span className="rounded-full bg-[var(--color-accent)] px-1.5 text-2xs text-[var(--color-bg)]">
                {overrideCount}
              </span>
            )}
          </Button>
        </DocumentToolbar>

        {state.showRules && (
          <section
            id={rulesPanelId}
            aria-label="Validation rules"
            className="max-h-56 overflow-auto border-t border-[var(--color-border)] px-4 py-3"
          >
            <div className="mb-2 flex items-center gap-3">
              <p className="text-2xs text-[var(--color-text-muted)]">
                {overrideCount === 0
                  ? 'Using the default rules.'
                  : `${overrideCount} rule${overrideCount === 1 ? '' : 's'} changed from the defaults.`}
              </p>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleResetRules}
                disabled={overrideCount === 0}
              >
                Reset to defaults
              </Button>
            </div>
            <div className="grid gap-x-8 gap-y-3 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-4">
              {RULE_CATEGORIES.map((category) => (
                <div key={category.id}>
                  <SectionLabel as="h2" className="mb-1">
                    {category.label}
                  </SectionLabel>
                  {ALL_RULES.filter((rule) => rule.category === category.id).map((rule) => {
                    const enabled = isRuleEnabled(rule, disabledRules, enabledRules)
                    return (
                      <label
                        key={rule.id}
                        // The hint explains *why* — the rule ids alone told the
                        // user nothing they could act on.
                        title={`${rule.id} — ${rule.hint}`}
                        className="flex cursor-pointer items-start gap-1.5 py-0.5 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => handleToggleRule(rule, e.target.checked)}
                          className="mt-0.5 accent-[var(--color-accent)]"
                        />
                        <span
                          className={
                            enabled ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'
                          }
                        >
                          {rule.label}
                        </span>
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        )}
      </header>

      {formatError && (
        <Alert
          variant="error"
          className="max-h-24 overflow-auto rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          <pre className="whitespace-pre-wrap">{formatError}</pre>
        </Alert>
      )}

      {/* Below ~900px a 50/50 split leaves two unusable columns, so the panes stack. */}
      <div className="flex min-h-0 flex-1 overflow-hidden max-[900px]:flex-col">
        {showEditor && (
          <section
            aria-label="HTML source"
            className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden ${
              showPreview
                ? 'w-1/2 border-r border-[var(--color-border)] max-[900px]:w-full max-[900px]:border-r-0 max-[900px]:border-b'
                : 'w-full'
            }`}
          >
            <Editor
              theme={monacoTheme}
              language="html"
              value={input}
              onChange={handleChange}
              onMount={handleEditorMount}
              options={monacoOptions}
            />
            {!hasInput && (
              // Click-through: the hint must never sit between the user and the caret.
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <EmptyState
                  icon={FileHtmlIcon}
                  title="Paste or open an HTML document"
                  description="It is checked as you type, previewed beside the source, and reformatted with ⌘↵."
                  action={
                    TOOL_SAMPLES['html-validator'] ? (
                      <span className="pointer-events-auto">
                        <Button variant="secondary" size="sm" onClick={handleLoadSample}>
                          Load sample
                        </Button>
                      </span>
                    ) : undefined
                  }
                />
              </div>
            )}
          </section>
        )}

        {showPreview && (
          <section
            aria-label="Rendered preview"
            className={`flex min-h-0 min-w-0 flex-col ${showEditor ? 'w-1/2 max-[900px]:w-full' : 'w-full'}`}
          >
            <PaneHeader
              title="Preview"
              actions={
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setIsPopoutOpen(true)}
                  disabled={!hasInput}
                  className="gap-1"
                  title="Expand to a full-size preview (Esc to close)"
                >
                  <FrameCornersIcon size={12} aria-hidden="true" />
                  Expand
                </Button>
              }
            />
            <div className="min-h-0 flex-1 bg-[var(--color-bg)]">
              {/* Deliberate palette exception below: the preview is a page
                  canvas, not app chrome, and user HTML assumes a white
                  background — on --color-bg its black body text is unreadable. */}
              {previewHtml ? (
                <iframe
                  title="HTML preview"
                  sandbox=""
                  srcDoc={previewHtml}
                  className="h-full w-full border-none bg-white"
                />
              ) : (
                <EmptyState
                  size="sm"
                  title={hasInput ? 'Rendering…' : 'Nothing to preview'}
                  description={
                    hasInput
                      ? 'The preview follows the source a moment behind.'
                      : 'Type or open HTML in the source pane.'
                  }
                />
              )}
            </div>
          </section>
        )}
      </div>

      <ResultsPanel
        panel={state.panel}
        open={state.panelOpen}
        onPanelChange={(next) => updateState({ panel: next, panelOpen: true })}
        onToggleOpen={() => updateState({ panelOpen: !state.panelOpen })}
        issues={issues}
        errorCount={errorCount}
        warningCount={warningCount}
        isValidating={isValidating}
        hasValidated={hasValidated}
        hasInput={hasInput}
        headings={stats?.headings ?? []}
        outlineIssues={outlineIssues}
        onGoToIssue={goToIssue}
      />

      <footer className="flex min-h-7 shrink-0 items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-2xs text-[var(--color-text-muted)]">
        <span>
          {stats
            ? `${stats.elements} element${stats.elements === 1 ? '' : 's'} · depth ${stats.depth} · ${stats.headings.length} heading${stats.headings.length === 1 ? '' : 's'}`
            : 'Empty document'}
        </span>
        {stats && stats.styleAttributes > 0 && (
          <span>{stats.styleAttributes} style attributes</span>
        )}
        {stats && stats.scripts > 0 && (
          <span>
            {stats.scripts} script{stats.scripts === 1 ? '' : 's'}
          </span>
        )}
        <span className="ml-auto">{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
      </footer>

      {isPopoutOpen && (
        <Dialog
          title="HTML preview"
          onClose={() => setIsPopoutOpen(false)}
          closeLabel="Close the full-size preview"
          className="h-[90vh] w-[min(95vw,80rem)]"
          bodyClassName="p-0"
        >
          {/* Same deliberate palette exception as the inline preview above. */}
          <iframe
            title="HTML preview (full size)"
            sandbox=""
            srcDoc={previewHtml}
            className="h-full w-full border-none bg-white"
          />
        </Dialog>
      )}

      {pendingDocument && (
        <Dialog
          title="Replace unsaved changes?"
          onClose={() => setPendingDocument(null)}
          className="w-[min(30rem,calc(100vw-2rem))]"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPendingDocument(null)}>
                Keep editing
              </Button>
              <Button type="button" variant="danger" onClick={() => applyDocument(pendingDocument)}>
                Discard changes
              </Button>
            </>
          }
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            The current document has changes that have not been saved to a file. Continuing will
            replace them.
          </p>
        </Dialog>
      )}
    </ToolLayout>
  )
}

// ---------------------------------------------------------------------------
// Problems / outline
// ---------------------------------------------------------------------------

function ResultsPanel({
  panel,
  open,
  onPanelChange,
  onToggleOpen,
  issues,
  errorCount,
  warningCount,
  isValidating,
  hasValidated,
  hasInput,
  headings,
  outlineIssues,
  onGoToIssue,
}: {
  panel: Panel
  open: boolean
  onPanelChange: (next: Panel) => void
  onToggleOpen: () => void
  issues: HtmlIssue[]
  errorCount: number
  warningCount: number
  isValidating: boolean
  hasValidated: boolean
  hasInput: boolean
  headings: { level: number; text: string }[]
  outlineIssues: string[]
  onGoToIssue: (issue: HtmlIssue) => void
}) {
  const panelId = useId()
  const Caret = open ? CaretDownIcon : CaretUpIcon

  return (
    <section
      aria-label="Problems and outline"
      className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <SegmentedControl
          aria-label="Results panel"
          value={panel}
          onChange={onPanelChange}
          options={[
            { value: 'problems' as const, label: `Problems (${issues.length})` },
            { value: 'outline' as const, label: `Outline (${headings.length})` },
          ]}
        />
        {panel === 'problems' && issues.length > 0 && (
          <span className="text-2xs text-[var(--color-text-muted)]">
            {errorCount} error{errorCount === 1 ? '' : 's'} · {warningCount} warning
            {warningCount === 1 ? '' : 's'}
          </span>
        )}
        {isValidating && <span className="text-2xs text-[var(--color-text-muted)]">Checking…</span>}
        <Button
          variant="ghost"
          size="xs"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={panelId}
          className="ml-auto gap-1"
        >
          <Caret size={12} aria-hidden="true" />
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>

      {open && (
        <div id={panelId} className="max-h-48 overflow-auto border-t border-[var(--color-border)]">
          {panel === 'problems' ? (
            issues.length === 0 ? (
              // Before the first run reports, an empty list is not a clean bill
              // of health — saying "No problems" there would be a guess.
              <EmptyState
                size="sm"
                {...(!hasInput
                  ? { icon: InfoIcon }
                  : hasValidated
                    ? { icon: CheckCircleIcon }
                    : {})}
                title={
                  !hasInput
                    ? 'Nothing to check yet'
                    : hasValidated
                      ? 'No problems found'
                      : 'Checking this document…'
                }
                description={
                  !hasInput
                    ? 'Problems appear here as you type.'
                    : hasValidated
                      ? 'Every enabled rule passed on this document.'
                      : 'Every enabled rule is being run against the source.'
                }
              />
            ) : (
              <ul>
                {issues.map((issue, index) => (
                  <li key={`${issue.rule}-${issue.line}-${issue.col}-${index}`}>
                    {/* A problem list nobody can click is a list of coordinates to
                        scroll to by hand — every row jumps the cursor there. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onGoToIssue(issue)}
                      className="w-full justify-start gap-2 rounded-none px-3 text-left"
                      title={`Go to line ${issue.line}, column ${issue.col}`}
                    >
                      {issue.type === 'error' ? (
                        <WarningCircleIcon
                          size={14}
                          aria-hidden="true"
                          className="shrink-0 text-[var(--color-error)]"
                        />
                      ) : (
                        <WarningIcon
                          size={14}
                          aria-hidden="true"
                          className="shrink-0 text-[var(--color-warning)]"
                        />
                      )}
                      <span className="shrink-0 font-mono text-2xs text-[var(--color-text-muted)]">
                        {issue.line}:{issue.col}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text)]">
                        {issue.message}
                      </span>
                      <span className="shrink-0 rounded border border-[var(--color-border)] px-1 text-2xs text-[var(--color-text-muted)]">
                        {issue.rule}
                      </span>
                      <ArrowRightIcon
                        size={12}
                        aria-hidden="true"
                        className="shrink-0 text-[var(--color-text-muted)]"
                      />
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : headings.length === 0 ? (
            <EmptyState
              size="sm"
              icon={ListBulletsIcon}
              title="No headings"
              description="Headings from h1 to h6 are listed here in document order."
            />
          ) : (
            <div className="p-3">
              {outlineIssues.length > 0 && (
                <Alert variant="warning" className="mb-2 text-2xs">
                  <ul>
                    {outlineIssues.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              <ul className="flex flex-col gap-0.5">
                {headings.map((heading, index) => (
                  <li
                    key={`${heading.level}-${index}`}
                    className="truncate text-xs text-[var(--color-text)]"
                    style={{ paddingLeft: (heading.level - 1) * 16 }}
                  >
                    <span className="mr-1.5 font-mono text-2xs text-[var(--color-accent)]">
                      h{heading.level}
                    </span>
                    {heading.text || (
                      <span className="text-[var(--color-text-muted)]">(empty heading)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
