import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  FileCssIcon,
  FilePlusIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  InfoIcon,
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
import { useValidatorDocument, type PendingValidatorDocument } from '@/hooks/useValidatorDocument'
import { ProblemsList } from '@/components/shared/ProblemsList'
import { Alert } from '@/components/shared/Alert'
import { Kbd } from '@/components/shared/Kbd'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Select } from '@/components/shared/Input'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
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
  compareSpecificity,
  countIssues,
  countRuleOverrides,
  isRuleEnabled,
  templateById,
  toggleRule,
  type CssIssue,
  type CssStats,
  type RuleConfig,
  type SelectorInfo,
} from '@/tools/css-validator/css-helpers'
import type { CssWorker } from '@/workers/css.worker'
import CssWorkerFactory from '@/workers/css.worker?worker'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatShortcut } from '@/lib/shortcut-label'

type Panel = 'problems' | 'selectors'

type CssValidatorState = {
  input: string
  fileName: string | null
  filePath: string | null
  /**
   * The last text written to (or read from) a file. `null` means "never
   * established", which is how state saved before this field existed hydrates;
   * treating it as `''` would call every restored stylesheet modified.
   */
  savedContent: string | null
  templateId: string
  showRules: boolean
  panel: Panel
  panelOpen: boolean
  /** Departures from the rule defaults, so new defaults still reach the user. */
  disabledRules: string[]
  enabledRules: string[]
  syntax: 'css' | 'scss' | 'less'
}

type PendingDocument = PendingValidatorDocument & { syntax?: CssValidatorState['syntax'] }

function syntaxFromFilename(filename: string): CssValidatorState['syntax'] | undefined {
  if (/\.scss$/i.test(filename)) return 'scss'
  if (/\.less$/i.test(filename)) return 'less'
  if (/\.css$/i.test(filename)) return 'css'
  return undefined
}

const ANALYZE_DEBOUNCE_MS = 300
/** Long stylesheets are common; beyond this the selector list stops helping. */
const MAX_LISTED_SELECTORS = 100
/**
 * A stylesheet opened from disk can produce thousands of warnings, and every row
 * here is a button. Past this many the list is a scrolling wall rather than a
 * work queue, so the rest are counted instead of mounted.
 */
const MAX_LISTED_ISSUES = 200

export default function CssValidator() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const { record } = useToolHistory({ toolId: 'css-validator' })
  const rulesPanelId = useId()

  const [state, updateState] = useToolState<CssValidatorState>('css-validator', {
    input: '',
    fileName: null,
    filePath: null,
    savedContent: null,
    templateId: TEMPLATES[0]?.id ?? 'flexbox',
    showRules: false,
    panel: 'problems',
    panelOpen: true,
    disabledRules: [],
    enabledRules: [],
    syntax: 'css',
  })

  const formatter = useWorker<FormatterWorker>(() => new FormatterWorkerFactory(), ['format'])
  const analyzer = useWorker<CssWorker>(() => new CssWorkerFactory(), ['analyze'])
  const analysisSequenceRef = useRef(0)

  const [issues, setIssues] = useState<CssIssue[]>([])
  const [stats, setStats] = useState<CssStats | null>(null)
  const [selectors, setSelectors] = useState<SelectorInfo[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [isFormatting, setIsFormatting] = useState(false)
  const [formatError, setFormatError] = useState<string | null>(null)
  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null)

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)
  /**
   * `useToolState` hydrates asynchronously, so the first run over a restored
   * stylesheet is indistinguishable from one the user triggered. Only typing
   * and explicit buffer swaps set this, and only it lets a run reach history.
   */
  const input = state.input ?? ''
  const inputRef = useRef(input)
  inputRef.current = input
  const { hasInput, isDirty, userEditedRef } = useValidatorDocument(input, state.savedContent)
  const { disabledRules, enabledRules } = state

  // --- Analysis --------------------------------------------------------

  useEffect(() => {
    if (!hasInput) {
      setIssues([])
      setStats(null)
      setSelectors([])
      setIsAnalyzing(false)
      setHasAnalyzed(false)
      return
    }
    if (state.syntax !== 'css') {
      analysisSequenceRef.current += 1
      setIssues([
        {
          message: `${state.syntax.toUpperCase()} can be formatted here, but standards analysis is available for plain CSS only.`,
          line: 1,
          column: 1,
          type: 'warning',
          rule: 'syntax-boundary',
        },
      ])
      setStats(null)
      setSelectors([])
      setIsAnalyzing(false)
      setHasAnalyzed(true)
      return
    }
    if (!analyzer) {
      setIsAnalyzing(true)
      return
    }
    setIsAnalyzing(true)
    // The previous results stay on screen while the next run is computed:
    // clearing them on every keystroke made rows flicker away under the pointer.
    const sequence = ++analysisSequenceRef.current
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const analysis = await analyzer.analyze(input, disabledRules, enabledRules)
          if (sequence !== analysisSequenceRef.current) return
          setIssues(analysis.issues)
          setStats(analysis.stats)
          setSelectors(analysis.selectors)
        } catch {
          if (sequence !== analysisSequenceRef.current) return
          setIssues([
            {
              message: 'The CSS analyzer failed to run',
              line: 1,
              column: 1,
              type: 'error',
              rule: 'internal',
            },
          ])
        } finally {
          if (sequence === analysisSequenceRef.current) {
            setIsAnalyzing(false)
            setHasAnalyzed(true)
          }
        }
      })()
    }, ANALYZE_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      analysisSequenceRef.current += 1
    }
  }, [input, hasInput, disabledRules, enabledRules, analyzer, state.syntax])

  const { errors: errorCount, warnings: warningCount } = useMemo(
    () => countIssues(issues),
    [issues]
  )

  const rankedSelectors = useMemo(
    () => [...selectors].sort(compareSpecificity).slice(0, MAX_LISTED_SELECTORS),
    [selectors]
  )

  const listedIssues = useMemo(() => issues.slice(0, MAX_LISTED_ISSUES), [issues])

  // Only finished runs over text the user actually produced are worth recording;
  // hydrating a tab on startup is not an operation anyone performed.
  useEffect(() => {
    if (!hasAnalyzed || isAnalyzing || !userEditedRef.current || !hasInput) return
    record({
      input: `CSS: ${input.slice(0, 300)}${input.length > 300 ? '...' : ''}`,
      output:
        issues.length === 0
          ? 'No problems found'
          : `${errorCount} error(s), ${warningCount} warning(s)`,
      success: errorCount === 0,
    })
    // Recording is keyed to a finished verdict, not to every dependency of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAnalyzed, isAnalyzing, issues])

  // --- Editor markers --------------------------------------------------

  const syncMarkers = useCallback((current: CssIssue[]) => {
    const monaco = monacoRef.current
    const model = editorRef.current?.getModel()
    if (!monaco || !model) return
    const lineCount = model.getLineCount()
    monaco.editor.setModelMarkers(
      model,
      'css-validator',
      current.map((issue) => {
        // A line from a since-shortened stylesheet would make Monaco throw.
        const line = Math.min(Math.max(issue.line, 1), lineCount)
        return {
          severity:
            issue.type === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: `${issue.message} (${issue.rule})`,
          startLineNumber: line,
          endLineNumber: line,
          startColumn: Math.max(issue.column, 1),
          endColumn: model.getLineMaxColumn(line),
        }
      })
    )
  }, [])

  // Markers used to be `deltaDecorations`, which draws a stripe but stays out of
  // Monaco's own problem plumbing — no hover severity, no minimap, no overview
  // ruler. They also only applied to an already-mounted editor.
  const issuesRef = useRef<CssIssue[]>(issues)
  issuesRef.current = issues

  const handleEditorMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      syncMarkers(issuesRef.current)
    },
    [syncMarkers]
  )

  useEffect(() => {
    syncMarkers(issues)
  }, [issues, syncMarkers])

  // Markers live on the model, which outlives this component.
  useEffect(() => () => syncMarkers([]), [syncMarkers])

  const goToPosition = useCallback((line: number, column: number) => {
    const editor = editorRef.current
    // A disposed editor is still truthy but every call on it no-ops, so the
    // jump has to be judged on the model.
    if (!editor || !editor.getModel()) return
    const position = { lineNumber: Math.max(line, 1), column: Math.max(column, 1) }
    editor.revealPositionInCenter(position)
    editor.setPosition(position)
    editor.focus()
  }, [])

  // --- Buffer swaps ----------------------------------------------------

  const applyDocument = useCallback(
    (document: PendingDocument) => {
      userEditedRef.current = true
      updateState({
        input: document.input,
        fileName: document.fileName,
        filePath: document.filePath,
        savedContent: document.savedContent,
        ...(document.syntax ? { syntax: document.syntax } : {}),
      })
      setFormatError(null)
      setPendingDocument(null)
      setLastAction(document.successMessage, 'success')
    },
    [updateState, setLastAction, userEditedRef]
  )

  // Loading a sample used to overwrite the buffer outright, with no undo and no
  // warning — the one destructive action in the tool.
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
      successMessage: 'New stylesheet created',
    })
  }, [requestDocument])

  const handleLoadTemplate = useCallback(() => {
    const template = templateById(state.templateId)
    if (!template) return
    requestDocument({
      input: template.css,
      fileName: null,
      filePath: null,
      // A template is the buffer's starting point, not an edit of it — calling a
      // freshly loaded one "Modified" made the next load ask to discard changes
      // nobody had made.
      savedContent: template.css,
      successMessage: `Loaded the ${template.label.toLowerCase()} template`,
    })
  }, [state.templateId, requestDocument])

  const handleLoadSample = useCallback(() => {
    const sample = TOOL_SAMPLES['css-validator']
    if (!sample) return
    requestDocument({
      input: sample,
      fileName: null,
      filePath: null,
      savedContent: sample,
      successMessage: 'Loaded the sample stylesheet',
    })
  }, [requestDocument])

  const handleChange = useCallback(
    (value: string | undefined) => {
      userEditedRef.current = true
      // The first edit of a stylesheet with no file behind it establishes an
      // empty saved text. `userEditedRef` alone would not survive the unmount a
      // tab switch causes, so returning to the tab would call typed-but-unsaved
      // CSS "Saved" and let the next template replace it without asking.
      updateState(
        state.savedContent === null
          ? { input: value ?? '', savedContent: '' }
          : { input: value ?? '' }
      )
      // The banner describes a failed format of the *old* text.
      setFormatError(null)
    },
    [state.savedContent, updateState, userEditedRef]
  )

  // --- Files -----------------------------------------------------------

  const handleOpen = useCallback(async () => {
    try {
      const result = await openFileDialog()
      if (!result) return
      const syntax = syntaxFromFilename(result.filename)
      requestDocument({
        input: result.content,
        fileName: result.filename,
        filePath: result.path,
        savedContent: result.content,
        ...(syntax ? { syntax } : {}),
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
      const path = await saveFileDialog(snapshot, state.fileName ?? `styles.${state.syntax}`)
      if (!path) {
        setLastAction('Save cancelled', 'info')
        return
      }
      updateState({ filePath: path, fileName: filenameFromPath(path), savedContent: snapshot })
      setLastAction(`Saved ${path}`, 'success')
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : 'Save failed', 'error')
    }
  }, [state.fileName, state.syntax, updateState, setLastAction])

  // --- Format ----------------------------------------------------------

  const handleFormat = useCallback(async () => {
    const snapshot = inputRef.current
    if (!formatter || !snapshot.trim() || isFormatting) return
    setIsFormatting(true)
    try {
      const formatted = await formatter.format(snapshot, { language: state.syntax, tabWidth: 2 })
      // Writing the result over a buffer the user kept typing into would
      // silently eat those keystrokes.
      if (inputRef.current !== snapshot) {
        setLastAction('Stylesheet changed while formatting — try again', 'info')
        return
      }
      userEditedRef.current = true
      updateState(
        state.savedContent === null ? { input: formatted, savedContent: '' } : { input: formatted }
      )
      setFormatError(null)
      setLastAction(`Formatted ${state.syntax.toUpperCase()}`, 'success')
    } catch (err) {
      // Prettier refuses to format CSS it cannot parse, which is exactly the CSS
      // this tool exists to find. The old fallback ran a regex "formatter" over
      // it instead, quietly rewriting text nobody had checked.
      setFormatError(err instanceof Error ? err.message : 'Could not format this stylesheet')
      setLastAction('Format failed', 'error')
    } finally {
      setIsFormatting(false)
    }
  }, [
    formatter,
    isFormatting,
    state.savedContent,
    state.syntax,
    updateState,
    setLastAction,
    userEditedRef,
  ])

  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      void handleFormat()
    }, [handleFormat])
  )

  // --- Global tool actions ---------------------------------------------

  useToolAction((action) => {
    if (action.type === 'open-file') {
      const syntax = syntaxFromFilename(action.filename)
      requestDocument({
        input: action.content,
        fileName: action.filename,
        filePath: action.path ?? null,
        savedContent: action.content,
        ...(syntax ? { syntax } : {}),
        successMessage: `Opened ${action.filename}`,
      })
    }
    if (action.type === 'save-file') {
      void handleSave()
    }
    if (action.type === 'copy-output' && inputRef.current.trim()) {
      void copy(inputRef.current, { success: 'Copied CSS', failure: 'Copy failed' })
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
    : isAnalyzing && !hasAnalyzed
      ? 'Checking…'
      : issues.length === 0
        ? `No problems · ${stats?.rules ?? 0} rule${stats?.rules === 1 ? '' : 's'}`
        : `${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}`

  return (
    <ToolLayout fullBleed>
      {/* The seam belongs to the rules panel, not the toolbar: it marks the bottom of a chrome
          block that is genuinely two rows tall. With the panel closed this header is a single
          toolbar row, and a border would be the divider the toolbar primitive dropped. */}
      <header
        className={`bg-[var(--color-surface)] ${
          state.showRules ? 'border-b border-[var(--color-border)]' : ''
        }`}
      >
        <DocumentToolbar aria-label="Stylesheet actions">
          <DocumentIdentity
            title={state.fileName ?? 'Untitled stylesheet'}
            titleTooltip={state.filePath ?? state.fileName ?? 'Untitled stylesheet'}
            titleTestId="file-name"
            icon={
              <FileCssIcon
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
              hasInput && hasAnalyzed && issues.length === 0 ? (
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

          <ToolbarGroup label="Document actions" separated>
            <Button
              variant="icon"
              size="sm"
              onClick={handleNew}
              title="New stylesheet"
              aria-label="New stylesheet"
            >
              <FilePlusIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              variant="icon"
              size="sm"
              onClick={() => void handleOpen()}
              title={`Open a .css file (${formatShortcut('mod+o')})`}
              aria-label="Open CSS file"
            >
              <FolderOpenIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              variant="icon"
              size="sm"
              onClick={() => void handleSave()}
              title={`Save the stylesheet (${formatShortcut('mod+s')})`}
              aria-label="Save stylesheet"
            >
              <FloppyDiskIcon size={14} aria-hidden="true" />
            </Button>
          </ToolbarGroup>

          <ToolbarGroup label="Template actions" separated>
            <Select
              aria-label="Stylesheet syntax"
              value={state.syntax}
              onChange={(event) =>
                updateState({ syntax: event.target.value as CssValidatorState['syntax'] })
              }
            >
              <option value="css">CSS</option>
              <option value="scss">SCSS</option>
              <option value="less">Less</option>
            </Select>
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

          <ToolbarGroup label="Stylesheet output" separated>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleFormat()}
              disabled={!hasInput || isFormatting || !formatter}
              loading={isFormatting}
              title={`Reformat the stylesheet (${formatShortcut('mod+enter')})`}
            >
              Format
              <Kbd keys="mod+enter" variant="inline" className="ml-1" />
            </Button>
            <CopyButton text={input} label="Copy CSS" />
          </ToolbarGroup>

          <Button
            variant={state.showRules ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => updateState({ showRules: !state.showRules })}
            aria-expanded={state.showRules}
            {...(state.showRules ? { 'aria-controls': rulesPanelId } : {})}
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
            aria-label="Lint rules"
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
            <div className="grid gap-x-8 gap-y-3 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3">
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

      <section aria-label="CSS source" className="relative min-h-0 flex-1 overflow-hidden">
        <Editor
          theme={monacoTheme}
          language={state.syntax}
          value={input}
          onChange={handleChange}
          onMount={handleEditorMount}
          options={monacoOptions}
        />
        {!hasInput && (
          // Click-through: the hint must never sit between the user and the caret.
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <EmptyState
              icon={FileCssIcon}
              title="Paste or open a stylesheet"
              description={`It is checked against the CSS specification as you type, and reformatted with ${formatShortcut('mod+enter')}.`}
              action={
                TOOL_SAMPLES['css-validator'] ? (
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

      <ResultsPanel
        panel={state.panel}
        open={state.panelOpen}
        onPanelChange={(next) => updateState({ panel: next, panelOpen: true })}
        onToggleOpen={() => updateState({ panelOpen: !state.panelOpen })}
        issues={listedIssues}
        totalIssues={issues.length}
        errorCount={errorCount}
        warningCount={warningCount}
        isAnalyzing={isAnalyzing}
        hasAnalyzed={hasAnalyzed}
        hasInput={hasInput}
        selectors={rankedSelectors}
        totalSelectors={selectors.length}
        onGoTo={goToPosition}
      />

      <footer className="flex min-h-7 shrink-0 items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-2xs text-[var(--color-text-muted)]">
        <span>
          {stats
            ? `${stats.rules} rule${stats.rules === 1 ? '' : 's'} · ${stats.selectors} selector${stats.selectors === 1 ? '' : 's'} · ${stats.declarations} declaration${stats.declarations === 1 ? '' : 's'}`
            : 'Empty stylesheet'}
        </span>
        {stats && stats.customProperties > 0 && <span>{stats.customProperties} custom props</span>}
        {stats && stats.mediaQueries > 0 && <span>{stats.mediaQueries} media queries</span>}
        {stats && stats.idSelectors > 0 && (
          <span className="text-[var(--color-warning)]">
            {stats.idSelectors} ID selector{stats.idSelectors === 1 ? '' : 's'}
          </span>
        )}
        {stats && stats.importants > 0 && (
          <span className="text-[var(--color-warning)]">{stats.importants} !important</span>
        )}
        <span className="ml-auto">{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
      </footer>

      {pendingDocument && (
        <Dialog
          title="Replace unsaved changes?"
          onClose={() => setPendingDocument(null)}
          size="md"
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
            The current stylesheet has changes that have not been saved to a file. Continuing will
            replace them.
          </p>
        </Dialog>
      )}
    </ToolLayout>
  )
}

// ---------------------------------------------------------------------------
// Problems / selectors
// ---------------------------------------------------------------------------

function ResultsPanel({
  panel,
  open,
  onPanelChange,
  onToggleOpen,
  issues,
  totalIssues,
  errorCount,
  warningCount,
  isAnalyzing,
  hasAnalyzed,
  hasInput,
  selectors,
  totalSelectors,
  onGoTo,
}: {
  panel: Panel
  open: boolean
  onPanelChange: (next: Panel) => void
  onToggleOpen: () => void
  issues: CssIssue[]
  totalIssues: number
  errorCount: number
  warningCount: number
  isAnalyzing: boolean
  hasAnalyzed: boolean
  hasInput: boolean
  selectors: SelectorInfo[]
  totalSelectors: number
  onGoTo: (line: number, column: number) => void
}) {
  const panelId = useId()
  const Caret = open ? CaretDownIcon : CaretUpIcon

  return (
    <section
      aria-label="Problems and selectors"
      className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <SegmentedControl
          aria-label="Results panel"
          value={panel}
          onChange={onPanelChange}
          options={[
            { value: 'problems' as const, label: `Problems (${totalIssues})` },
            { value: 'selectors' as const, label: `Selectors (${totalSelectors})` },
          ]}
        />
        {panel === 'problems' && totalIssues > 0 && (
          <span className="text-2xs text-[var(--color-text-muted)]">
            {errorCount} error{errorCount === 1 ? '' : 's'} · {warningCount} warning
            {warningCount === 1 ? '' : 's'}
          </span>
        )}
        {isAnalyzing && <span className="text-2xs text-[var(--color-text-muted)]">Checking…</span>}
        <Button
          variant="ghost"
          size="xs"
          onClick={onToggleOpen}
          aria-expanded={open}
          {...(open ? { 'aria-controls': panelId } : {})}
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
                {...(!hasInput ? { icon: InfoIcon } : hasAnalyzed ? { icon: CheckCircleIcon } : {})}
                title={
                  !hasInput
                    ? 'Nothing to check yet'
                    : hasAnalyzed
                      ? 'No problems found'
                      : 'Checking this stylesheet…'
                }
                description={
                  !hasInput
                    ? 'Problems appear here as you type.'
                    : hasAnalyzed
                      ? 'Every enabled rule passed on this stylesheet.'
                      : 'Every enabled rule is being run against the source.'
                }
              />
            ) : (
              <>
                <ProblemsList
                  items={issues.map((issue, index) => ({
                    id: `${issue.rule}-${issue.line}-${issue.column}-${index}`,
                    message: issue.message,
                    severity: issue.type,
                    line: issue.line,
                    column: issue.column,
                    code: issue.rule,
                  }))}
                  onSelect={(problem) => onGoTo(problem.line ?? 1, problem.column ?? 1)}
                />
                {totalIssues > issues.length && (
                  <p className="px-3 py-1.5 text-2xs text-[var(--color-text-muted)]">
                    {totalIssues - issues.length} more problem
                    {totalIssues - issues.length === 1 ? '' : 's'} not listed — fix these first, or
                    switch a rule off.
                  </p>
                )}
              </>
            )
          ) : selectors.length === 0 ? (
            <EmptyState
              size="sm"
              title="No selectors"
              description="Selectors are listed here most specific first, so the rules hardest to override sit at the top."
            />
          ) : (
            <ul>
              {selectors.map((selector, index) => (
                <li key={`${selector.text}-${selector.line}-${index}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onGoTo(selector.line, selector.column)}
                    className="w-full justify-start gap-2 rounded-none px-3 text-left"
                    title={`Go to line ${selector.line}`}
                  >
                    <span className="shrink-0 font-mono text-2xs text-[var(--color-text-muted)]">
                      {selector.line}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-text)]">
                      {selector.text}
                    </span>
                    <span
                      className={`shrink-0 rounded border px-1 font-mono text-2xs ${
                        selector.specificity[0] > 0
                          ? 'border-[var(--color-warning)] text-[var(--color-warning)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                      }`}
                      title="Specificity: ids, classes, elements"
                    >
                      {selector.specificity.join('-')}
                    </span>
                  </Button>
                </li>
              ))}
              {totalSelectors > selectors.length && (
                <li className="px-3 py-1.5 text-2xs text-[var(--color-text-muted)]">
                  {totalSelectors - selectors.length} less specific selector
                  {totalSelectors - selectors.length === 1 ? '' : 's'} not listed.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
