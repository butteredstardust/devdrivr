import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { OnMount } from '@monaco-editor/react'
import type { HistoryEntryInput } from '@/hooks/useToolHistory'
import type { WorkerRpc } from '@/hooks/useWorker'
import {
  buildRuleset,
  countIssues,
  outlineProblemDetails,
  type HtmlIssue,
  type HtmlStats,
} from '@/tools/html-validator/html-helpers'
import type {
  UpdateHtmlValidatorState,
  ViewMode,
} from '@/tools/html-validator/html-validator-types'
import type { HtmlWorker } from '@/workers/html.worker'

const VALIDATE_DEBOUNCE_MS = 300

type UseHtmlValidationOptions = {
  input: string
  hasInput: boolean
  disabledRules: string[]
  enabledRules: string[]
  validator: WorkerRpc<HtmlWorker> | null
  userEditedRef: MutableRefObject<boolean>
  record: (entry: HistoryEntryInput) => void
  viewMode: ViewMode
  updateState: UpdateHtmlValidatorState
}

export function useHtmlValidation({
  input,
  hasInput,
  disabledRules,
  enabledRules,
  validator,
  userEditedRef,
  record,
  viewMode,
  updateState,
}: UseHtmlValidationOptions) {
  const [issues, setIssues] = useState<HtmlIssue[]>([])
  const [stats, setStats] = useState<HtmlStats | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [hasValidated, setHasValidated] = useState(false)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)
  const validationSeqRef = useRef(0)

  // --- Validation ------------------------------------------------------

  useEffect(() => {
    if (!hasInput) {
      validationSeqRef.current += 1
      setIssues([])
      setStats(null)
      setIsValidating(false)
      setHasValidated(false)
      return
    }
    if (!validator) {
      setIsValidating(true)
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
          const found = await validator.validateHtml(
            input,
            buildRuleset(disabledRules, enabledRules)
          )
          if (seq !== validationSeqRef.current) return
          setIssues(found.issues)
          setStats(found.stats)
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
  }, [input, hasInput, disabledRules, enabledRules, validator])

  const { errors: errorCount, warnings: warningCount } = useMemo(
    () => countIssues(issues),
    [issues]
  )
  const outlineIssues = useMemo(() => (stats ? outlineProblemDetails(stats.headings) : []), [stats])

  const historySnapshotRef = useRef({ hasInput, input, errorCount, warningCount, record })
  historySnapshotRef.current = { hasInput, input, errorCount, warningCount, record }

  // Only completed runs of text the user actually produced are worth recording;
  // hydrating a tab on startup is not an operation anyone performed.
  useEffect(() => {
    const snapshot = historySnapshotRef.current
    if (!hasValidated || isValidating || !userEditedRef.current || !snapshot.hasInput) return
    snapshot.record({
      input: `HTML: ${snapshot.input.slice(0, 300)}${snapshot.input.length > 300 ? '...' : ''}`,
      output:
        issues.length === 0
          ? 'No problems found'
          : `${snapshot.errorCount} error(s), ${snapshot.warningCount} warning(s)`,
      success: snapshot.errorCount === 0,
    })
    // Recording is keyed to a finished verdict, not to every dependency of it.
  }, [hasValidated, isValidating, issues, userEditedRef])

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

  return {
    issues,
    stats,
    isValidating,
    hasValidated,
    errorCount,
    warningCount,
    outlineIssues,
    handleEditorMount,
    goToIssue,
  }
}
