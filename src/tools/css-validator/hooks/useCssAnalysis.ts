import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { HistoryEntryInput } from '@/hooks/useToolHistory'
import { useWorker } from '@/hooks/useWorker'
import {
  compareSpecificity,
  countIssues,
  type CssIssue,
  type CssStats,
  type SelectorInfo,
} from '@/tools/css-validator/css-helpers'
import type { CssValidatorState } from '@/tools/css-validator/css-validator-types'
import type { CssWorker } from '@/workers/css.worker'
import CssWorkerFactory from '@/workers/css.worker?worker'

const ANALYZE_DEBOUNCE_MS = 300
/** Long stylesheets are common; beyond this the selector list stops helping. */
const MAX_LISTED_SELECTORS = 100
/**
 * A stylesheet opened from disk can produce thousands of warnings, and every row
 * here is a button. Past this many the list is a scrolling wall rather than a
 * work queue, so the rest are counted instead of mounted.
 */
const MAX_LISTED_ISSUES = 200

type UseCssAnalysisOptions = {
  input: string
  hasInput: boolean
  syntax: CssValidatorState['syntax']
  disabledRules: string[]
  enabledRules: string[]
  userEditedRef: MutableRefObject<boolean>
  record: (entry: HistoryEntryInput) => void
}

export function useCssAnalysis({
  input,
  hasInput,
  syntax,
  disabledRules,
  enabledRules,
  userEditedRef,
  record,
}: UseCssAnalysisOptions) {
  const analyzer = useWorker<CssWorker>(() => new CssWorkerFactory(), ['analyze'])
  const analysisSequenceRef = useRef(0)

  const [issues, setIssues] = useState<CssIssue[]>([])
  const [stats, setStats] = useState<CssStats | null>(null)
  const [selectors, setSelectors] = useState<SelectorInfo[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

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
    if (syntax !== 'css') {
      analysisSequenceRef.current += 1
      setIssues([
        {
          message: `${syntax.toUpperCase()} can be formatted here, but standards analysis is available for plain CSS only.`,
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
  }, [input, hasInput, disabledRules, enabledRules, analyzer, syntax])

  const { errors: errorCount, warnings: warningCount } = useMemo(
    () => countIssues(issues),
    [issues]
  )

  const rankedSelectors = useMemo(
    () => [...selectors].sort(compareSpecificity).slice(0, MAX_LISTED_SELECTORS),
    [selectors]
  )

  const listedIssues = useMemo(() => issues.slice(0, MAX_LISTED_ISSUES), [issues])

  const historySnapshotRef = useRef({ hasInput, input, errorCount, warningCount, record })
  historySnapshotRef.current = { hasInput, input, errorCount, warningCount, record }

  // Only finished runs over text the user actually produced are worth recording;
  // hydrating a tab on startup is not an operation anyone performed.
  useEffect(() => {
    const snapshot = historySnapshotRef.current
    if (!hasAnalyzed || isAnalyzing || !userEditedRef.current || !snapshot.hasInput) return
    snapshot.record({
      input: `CSS: ${snapshot.input.slice(0, 300)}${snapshot.input.length > 300 ? '...' : ''}`,
      output:
        issues.length === 0
          ? 'No problems found'
          : `${snapshot.errorCount} error(s), ${snapshot.warningCount} warning(s)`,
      success: snapshot.errorCount === 0,
    })
    // Recording is keyed to a finished verdict, not to every dependency of it.
  }, [hasAnalyzed, isAnalyzing, issues, userEditedRef])

  return {
    issues,
    stats,
    selectors,
    isAnalyzing,
    hasAnalyzed,
    errorCount,
    warningCount,
    rankedSelectors,
    listedIssues,
  }
}
