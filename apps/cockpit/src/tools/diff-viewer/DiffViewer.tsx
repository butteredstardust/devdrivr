import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { html as diff2htmlRender } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'
import DOMPurify from 'dompurify'
import {
  ArrowsLeftRightIcon,
  CheckCircleIcon,
  GitDiffIcon,
  SlidersHorizontalIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonaco } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { CopyButton } from '@/components/shared/CopyButton'
import { Kbd } from '@/components/shared/Kbd'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { Select } from '@/components/shared/Input'
import { Toggle } from '@/components/shared/Toggle'
import { Spinner } from '@/components/shared/Spinner'
import { EmptyState } from '@/components/shared/EmptyState'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { exportFile } from '@/lib/file-io'
import { DIFF_VIEWER_SAMPLE } from '@/lib/tool-samples'
import type { DiffWorker } from '@/workers/diff.worker'
import DiffWorkerFactory from '@/workers/diff.worker?worker'

const { sanitize } = DOMPurify

/**
 * Which panes are on screen. The old tool had no such concept: computing a diff
 * replaced the editors outright, so the 600ms auto-compare pulled the editing
 * surface away mid-keystroke and the only way back was a button that appeared
 * where the editors used to be.
 */
type ViewMode = 'editors' | 'split' | 'diff'

type DiffViewerState = {
  left: string
  right: string
  mode: 'side-by-side' | 'inline'
  language: string
  ignoreWhitespace: boolean
  jsonMode: boolean
  view: ViewMode
  optionsOpen: boolean
}

const VIEW_OPTIONS = [
  { value: 'editors' as const, label: 'Editors' },
  { value: 'split' as const, label: 'Split' },
  { value: 'diff' as const, label: 'Diff' },
]

const LANGUAGES = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'json', label: 'JSON' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'sql', label: 'SQL' },
  { id: 'python', label: 'Python' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'yaml', label: 'YAML' },
  { id: 'xml', label: 'XML' },
]

const DIFF_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'div',
    'span',
    'code',
    'pre',
    'del',
    'ins',
    'br',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'svg',
    'path',
    'label',
    'input',
    'a',
  ],
  ALLOWED_ATTR: [
    'class',
    'style',
    'data-diffline',
    'data-diffpath',
    'type',
    'checked',
    'disabled',
    'title',
    // diff2html renders inline SVG icons; without their geometry attributes
    // they survive sanitisation as empty boxes.
    'viewbox',
    'width',
    'height',
    'd',
    'fill',
    'aria-hidden',
  ],
  FORCE_BODY: true,
}

type DiffStats = { additions: number; deletions: number }

export function parseDiffStats(patch: string): DiffStats {
  if (!patch || patch.trim().length === 0) {
    return { additions: 0, deletions: 0 }
  }

  let additions = 0
  let deletions = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++
  }
  return { additions, deletions }
}

/** Spoken summary of the comparison — the visible counts are icon-terse. */
export function describeDiff(stats: DiffStats | null, identical: boolean): string {
  if (identical) return 'Both sides are identical'
  if (!stats) return 'No comparison yet'
  return `${stats.additions} line${stats.additions === 1 ? '' : 's'} added, ${
    stats.deletions
  } line${stats.deletions === 1 ? '' : 's'} removed`
}

// diff2html ships a light-only stylesheet; these map its tokens onto the app
// theme so the diff follows the current color scheme.
const D2H_THEME_VARS: React.CSSProperties = {
  ['--d2h-bg-color' as string]: 'var(--color-surface)',
  ['--d2h-border-color' as string]: 'var(--color-border)',
  ['--d2h-line-border-color' as string]: 'var(--color-border)',
  ['--d2h-dim-color' as string]: 'var(--color-text-muted)',
  ['--d2h-file-header-bg-color' as string]: 'var(--color-surface)',
  ['--d2h-file-header-border-color' as string]: 'var(--color-border)',
  ['--d2h-empty-placeholder-bg-color' as string]: 'var(--color-surface)',
  ['--d2h-empty-placeholder-border-color' as string]: 'var(--color-border)',
  ['--d2h-ins-bg-color' as string]: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
  ['--d2h-ins-border-color' as string]: 'color-mix(in srgb, var(--color-success) 40%, transparent)',
  ['--d2h-ins-highlight-bg-color' as string]:
    'color-mix(in srgb, var(--color-success) 40%, transparent)',
  ['--d2h-ins-label-color' as string]: 'var(--color-success)',
  ['--d2h-del-bg-color' as string]: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
  ['--d2h-del-border-color' as string]: 'color-mix(in srgb, var(--color-error) 40%, transparent)',
  ['--d2h-del-highlight-bg-color' as string]:
    'color-mix(in srgb, var(--color-error) 40%, transparent)',
  ['--d2h-del-label-color' as string]: 'var(--color-error)',
  ['--d2h-change-del-color' as string]: 'color-mix(in srgb, var(--color-warning) 20%, transparent)',
  ['--d2h-change-ins-color' as string]: 'color-mix(in srgb, var(--color-success) 20%, transparent)',
  ['--d2h-change-label-color' as string]: 'var(--color-warning)',
  ['--d2h-info-bg-color' as string]: 'var(--color-surface)',
  ['--d2h-info-border-color' as string]: 'var(--color-border)',
}

type PaneProps = {
  title: string
  hint: string
  value: string
  language: string
  onChange: (value: string) => void
  onClear: () => void
  theme: string
  options: Record<string, unknown>
}

function EditorPane({
  title,
  hint,
  value,
  language,
  onChange,
  onClear,
  theme,
  options,
}: PaneProps) {
  const lines = value ? value.split('\n').length : 0
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
        <span className="font-ui truncate text-xs font-semibold text-[var(--color-text)]">
          {title}
        </span>
        <span className="truncate text-2xs text-[var(--color-text-muted)]">{hint}</span>
        <span className="ml-auto shrink-0 text-2xs tabular-nums text-[var(--color-text-muted)]">
          {lines} line{lines === 1 ? '' : 's'}
        </span>
        <Button
          variant="icon"
          size="sm"
          onClick={onClear}
          disabled={!value}
          aria-label={`Clear ${title.toLowerCase()}`}
          title={`Clear ${title.toLowerCase()}`}
        >
          <TrashIcon size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Editor
          theme={theme}
          language={language}
          value={value}
          onChange={(v) => onChange(v ?? '')}
          options={options}
        />
      </div>
    </div>
  )
}

export default function DiffViewer() {
  const optionsId = useId()
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  // Merged once: spreading inline made a new object every render, which
  // @monaco-editor/react re-applies to both editors on every keystroke.
  const editorOptions = useMemo(
    () => ({ ...monacoOptions, wordWrap: 'off' as const }),
    [monacoOptions]
  )
  const [state, updateState] = useToolState<DiffViewerState>('diff-viewer', {
    left: '',
    right: '',
    mode: 'side-by-side',
    language: 'plaintext',
    ignoreWhitespace: false,
    jsonMode: false,
    view: 'split',
    optionsOpen: false,
  })

  const worker = useWorker<DiffWorker>(() => new DiffWorkerFactory(), ['computeDiff'])

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [diffHtml, setDiffHtml] = useState<string>('')
  const [rawPatch, setRawPatch] = useState<string>('')
  const [isComparing, setIsComparing] = useState(false)
  const comparingRef = useRef(false)
  const pendingCompareRef = useRef(false)
  const announceRef = useRef(false)
  const stateRef = useRef(state)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [])

  const bothSidesFilled = state.left.trim().length > 0 && state.right.trim().length > 0
  const stats = useMemo(() => (rawPatch ? parseDiffStats(rawPatch) : null), [rawPatch])
  // `left === right` is only the cheap case. `ignoreWhitespace`/`jsonMode` can
  // also make two textually different sides equivalent, and then the patch has
  // no hunks at all — without this the pane would render an empty diff.
  const identical =
    (state.left === state.right && state.left.trim().length > 0) ||
    (stats !== null && stats.additions === 0 && stats.deletions === 0)

  // Stable object identity is load-bearing: React 19 compares
  // `dangerouslySetInnerHTML` by object identity, not by the `__html` string, so
  // an inline literal re-writes innerHTML on every render — rebuilding the whole
  // subtree and destroying any text selection the user has made in the diff.
  // Memoising also keeps the (non-trivial) sanitize pass off the render path.
  const sanitizedDiffProp = useMemo(
    () => ({ __html: sanitize(diffHtml, DIFF_SANITIZE_CONFIG) }),
    [diffHtml]
  )

  const computeDiff = useCallback(
    async (announce = false) => {
      const current = stateRef.current
      // Same condition as the auto-compare effect: a one-sided "diff" is a
      // whole-file deletion nobody asked for, and nothing would clear it.
      if (!worker || !current.left.trim() || !current.right.trim()) return
      // Set only past the guards — an early return skips the `finally` that
      // resets this, and a stuck flag makes the next *auto* compare toast.
      if (announce) announceRef.current = true
      if (comparingRef.current) {
        pendingCompareRef.current = true
        return
      }
      // A click lands while the keystroke debounce is still pending; without
      // this the same comparison runs twice.
      if (debounceRef.current) clearTimeout(debounceRef.current)
      comparingRef.current = true
      setIsComparing(true)
      try {
        const patch = await worker.computeDiff(current.left, current.right, {
          ignoreWhitespace: current.ignoreWhitespace,
          jsonMode: current.jsonMode,
        })
        setRawPatch(patch)
        setDiffHtml(
          diff2htmlRender(patch, {
            outputFormat: current.mode === 'side-by-side' ? 'side-by-side' : 'line-by-line',
            drawFileList: false,
          })
        )
        // Auto-compare fires on a 600ms debounce while typing; toasting there
        // would spam the status bar, so only an explicit Compare speaks up.
        if (announceRef.current) setLastAction('Diff computed', 'success')
      } catch (err) {
        // Switching tools terminates the worker and rejects everything still in
        // flight; that is a teardown, not a failure the user should see.
        if (mountedRef.current) {
          setLastAction('Diff computation failed', 'error')
          setDiffHtml('')
          setRawPatch('')
        }
        void err
      } finally {
        announceRef.current = false
        comparingRef.current = false
        setIsComparing(false)
        if (pendingCompareRef.current && mountedRef.current) {
          pendingCompareRef.current = false
          retryRef.current = setTimeout(() => void computeDiff(), 0)
        }
      }
    },
    [worker, setLastAction]
  )

  // Auto-compare with debounce when both sides have content
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!state.left.trim() || !state.right.trim()) {
      setDiffHtml('')
      setRawPatch('')
      return
    }
    debounceRef.current = setTimeout(() => {
      void computeDiff()
    }, 600)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.left, state.right, state.ignoreWhitespace, state.jsonMode, state.mode, computeDiff])

  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      void computeDiff(true)
    }, [computeDiff])
  )

  const handleSwap = useCallback(() => {
    updateState({ left: state.right, right: state.left })
    setLastAction('Swapped sides', 'info')
  }, [state.left, state.right, updateState, setLastAction])

  const handleSavePatch = useCallback(() => {
    void exportFile(rawPatch, 'changes.patch').then(
      (path) => setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
      (err: unknown) =>
        setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    )
  }, [rawPatch, setLastAction])

  const loadSample = useCallback(() => {
    updateState({ left: DIFF_VIEWER_SAMPLE.left, right: DIFF_VIEWER_SAMPLE.right })
  }, [updateState])

  const showEditors = state.view !== 'diff'
  const showDiff = state.view !== 'editors'

  const diffBody = identical ? (
    <EmptyState
      icon={CheckCircleIcon}
      size="sm"
      title="No differences"
      description="Both sides are identical."
    />
  ) : isComparing && !diffHtml ? (
    <div className="flex h-full items-center justify-center gap-2 p-6 text-xs text-[var(--color-text-muted)]">
      <Spinner size="sm" />
      Comparing…
    </div>
  ) : diffHtml ? (
    <div
      // Focusable so the diff can be scrolled from the keyboard without a mouse.
      role="region"
      aria-label="Diff result"
      tabIndex={0}
      // The file header is diff2html's per-file banner. There is only ever one
      // virtual file here, and it renders a misleading "RENAMED" badge because
      // the two sides are named `left` and `right`. `!` is required: diff2html's
      // stylesheet is unlayered, so it beats Tailwind's `utilities` layer.
      className="h-full overflow-auto p-2 text-xs focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] [&_.d2h-file-header]:hidden!"
      style={D2H_THEME_VARS}
      dangerouslySetInnerHTML={sanitizedDiffProp}
    />
  ) : (
    <EmptyState
      icon={GitDiffIcon}
      size="sm"
      title={bothSidesFilled ? 'No comparison yet' : 'Nothing to compare'}
      description={
        bothSidesFilled
          ? 'Press ⌘↵ to compare the two sides.'
          : 'Paste the original on the left and the modified version on the right.'
      }
      action={
        !state.left.trim() && !state.right.trim() ? (
          <Button variant="secondary" size="sm" onClick={loadSample}>
            Load sample
          </Button>
        ) : undefined
      }
    />
  )

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <div className="border-b border-[var(--color-border)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
            <SegmentedControl
              aria-label="Diff view mode"
              options={VIEW_OPTIONS}
              value={state.view}
              onChange={(view) => updateState({ view })}
            />

            <span
              role="status"
              aria-live="polite"
              className="flex items-center gap-1.5 text-xs tabular-nums"
            >
              <span className="sr-only">{describeDiff(stats, identical)}</span>
              {identical ? (
                <span
                  aria-hidden="true"
                  className="flex items-center gap-1 text-[var(--color-success)]"
                >
                  <CheckCircleIcon size={14} />
                  Identical
                </span>
              ) : stats ? (
                <span aria-hidden="true">
                  <span className="text-[var(--color-success)]">+{stats.additions}</span>
                  {' / '}
                  <span className="text-[var(--color-error)]">−{stats.deletions}</span>
                </span>
              ) : (
                <span aria-hidden="true" className="text-[var(--color-text-muted)]">
                  —
                </span>
              )}
            </span>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSwap}
                disabled={!state.left && !state.right}
                title="Swap left and right"
                className="gap-1"
              >
                <ArrowsLeftRightIcon size={14} aria-hidden="true" />
                Swap
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateState({ optionsOpen: !state.optionsOpen })}
                aria-expanded={state.optionsOpen}
                {...(state.optionsOpen ? { 'aria-controls': optionsId } : {})}
                className="gap-1"
              >
                <SlidersHorizontalIcon size={14} aria-hidden="true" />
                Options
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void computeDiff(true)}
                disabled={!bothSidesFilled}
                loading={isComparing}
                title="Compare both sides (⌘↵)"
              >
                Compare
                <Kbd keys="mod+enter" variant="inline" className="ml-1" />
              </Button>
            </div>
          </div>

          {state.optionsOpen && (
            <div
              id={optionsId}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2"
            >
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                Layout
                <Select
                  aria-label="Layout"
                  value={state.mode}
                  onChange={(e) => updateState({ mode: e.target.value as DiffViewerState['mode'] })}
                >
                  <option value="side-by-side">Side by Side</option>
                  <option value="inline">Inline</option>
                </Select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                Syntax
                <Select
                  aria-label="Syntax"
                  value={state.language}
                  onChange={(e) => updateState({ language: e.target.value })}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </label>
              <Toggle
                label="Ignore whitespace"
                checked={state.ignoreWhitespace}
                onChange={(checked) => updateState({ ignoreWhitespace: checked })}
              />
              <Toggle
                label="Normalize JSON"
                checked={state.jsonMode}
                onChange={(checked) => updateState({ jsonMode: checked })}
              />
              <div className="ml-auto flex items-center gap-2">
                <CopyButton text={rawPatch} label="Copy patch" />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSavePatch}
                  disabled={!rawPatch || identical}
                  title="Save the unified patch to a file"
                >
                  Save patch…
                </Button>
              </div>
            </div>
          )}
        </div>
      }
    >
      {/* Editors and diff coexist: comparing never takes the editors away. */}
      <div
        className={`grid min-h-0 flex-1 overflow-hidden ${
          showEditors && showDiff ? 'grid-rows-2' : 'grid-rows-1'
        }`}
      >
        {showEditors && (
          <div className="flex min-h-0 gap-px overflow-hidden bg-[var(--color-border)]">
            <EditorPane
              title="Left"
              hint="original"
              value={state.left}
              language={state.language}
              onChange={(v) => updateState({ left: v })}
              onClear={() => updateState({ left: '' })}
              theme={monacoTheme}
              options={editorOptions}
            />
            <EditorPane
              title="Right"
              hint="modified"
              value={state.right}
              language={state.language}
              onChange={(v) => updateState({ right: v })}
              onClear={() => updateState({ right: '' })}
              theme={monacoTheme}
              options={editorOptions}
            />
          </div>
        )}
        {showDiff && (
          <section
            aria-label="Comparison"
            className={`flex min-h-0 flex-col overflow-hidden bg-[var(--color-surface)] ${
              showEditors ? 'border-t border-[var(--color-border)]' : ''
            }`}
          >
            {diffBody}
          </section>
        )}
      </div>
    </ToolLayout>
  )
}
