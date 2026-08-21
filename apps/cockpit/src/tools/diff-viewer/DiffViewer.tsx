import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { html as diff2htmlRender } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'
import DOMPurify from 'dompurify'
import {
  ArrowsLeftRightIcon,
  CaretDownIcon,
  CaretUpIcon,
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
import { PaneHeader } from '@/components/shared/PaneHeader'
import { Select } from '@/components/shared/Input'
import { Toggle } from '@/components/shared/Toggle'
import { Spinner } from '@/components/shared/Spinner'
import { EmptyState } from '@/components/shared/EmptyState'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Toolbar, ToolbarGroup, ToolbarSpacer } from '@/components/shared/Toolbar'
import { buildExportFilename, exportFile } from '@/lib/file-io'
import { extensionForLanguage } from '@/tools/code-formatter/languages'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import { DIFF_VIEWER_SAMPLE } from '@/lib/tool-samples'
import type { DiffWorker } from '@/workers/diff.worker'
import DiffWorkerFactory from '@/workers/diff.worker?worker'
import { formatShortcut } from '@/lib/shortcut-label'

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
  ignoreCase: boolean
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
      <PaneHeader
        title={title}
        // The line count sits in `hint`, not `status`: it changes on every keystroke, and a live
        // region reciting a running total is noise rather than an outcome worth announcing.
        hint={`${hint} · ${lines} line${lines === 1 ? '' : 's'}`}
        actions={
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
        }
      />
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
    ignoreCase: false,
    jsonMode: false,
    view: 'split',
    optionsOpen: false,
  })

  const worker = useWorker<DiffWorker>(() => new DiffWorkerFactory(), ['computeDiff'])
  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    ['detectLanguage']
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [diffHtml, setDiffHtml] = useState<string>('')
  const [rawPatch, setRawPatch] = useState<string>('')
  const [isComparing, setIsComparing] = useState(false)
  const [activeHunk, setActiveHunk] = useState(-1)
  const diffContainerRef = useRef<HTMLDivElement>(null)
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
  const hunkCount = useMemo(() => rawPatch.match(/^@@/gm)?.length ?? 0, [rawPatch])

  useEffect(() => setActiveHunk(-1), [rawPatch])

  const navigateHunk = useCallback(
    (direction: -1 | 1) => {
      const rows = Array.from(
        diffContainerRef.current?.querySelectorAll<HTMLElement>('.d2h-info') ?? []
      ).filter((row) => row.textContent?.trim().startsWith('@@'))
      if (rows.length === 0) return
      const next =
        activeHunk < 0
          ? direction > 0
            ? 0
            : rows.length - 1
          : (activeHunk + direction + rows.length) % rows.length
      setActiveHunk(next)
      const row = rows[next]
      if (!row) return
      row.tabIndex = -1
      if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'center' })
      row.focus({ preventScroll: true })
    },
    [activeHunk]
  )
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
          ignoreCase: current.ignoreCase,
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
  }, [
    state.left,
    state.right,
    state.ignoreWhitespace,
    state.ignoreCase,
    state.jsonMode,
    state.mode,
    computeDiff,
  ])

  useEffect(() => {
    const source = state.left.trim() || state.right.trim()
    if (!formatter || state.language !== 'plaintext' || !source) return
    const timer = setTimeout(() => {
      void formatter.detectLanguage(source).then((language) => {
        if (stateRef.current.language === 'plaintext') updateState({ language })
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [formatter, state.left, state.right, state.language, updateState])

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
    const context =
      state.language === 'plaintext'
        ? 'text-changes'
        : `${extensionForLanguage(state.language)}-changes`
    void exportFile(rawPatch, buildExportFilename(context, 'patch')).then(
      (path) => setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
      (err: unknown) =>
        setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    )
  }, [rawPatch, setLastAction, state.language])

  const loadSample = useCallback(() => {
    updateState({ left: DIFF_VIEWER_SAMPLE.left, right: DIFF_VIEWER_SAMPLE.right })
  }, [updateState])

  const showEditors = state.view !== 'diff'
  const showDiff = state.view !== 'editors'

  // Is there anything in the comparison pane worth giving half the window to?
  //
  // "Nothing to compare" is not. Splitting the pane 50/50 regardless meant the
  // empty state — whose entire message is "paste into the editors" — was the
  // largest thing on screen, crowding out the editors it was pointing at. The
  // editors keep the space until there is a real result to show.
  const hasComparison = identical || isComparing || !!diffHtml

  const prompt = bothSidesFilled
    ? `Press ${formatShortcut('mod+enter')} to compare the two sides.`
    : 'Paste the original on the left and the modified version on the right.'
  const canLoadSample = !state.left.trim() && !state.right.trim()

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
      ref={diffContainerRef}
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
  ) : showEditors ? (
    // Split view, nothing compared yet: one line, not a full-pane empty state.
    // The editors above already say what to do by being empty and focusable, and
    // the toolbar carries Compare — this only has to name the next step and hand
    // over the sample.
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-text-muted)]">
      <GitDiffIcon size={14} aria-hidden="true" />
      <span>{prompt}</span>
      {canLoadSample && (
        <Button variant="ghost" size="xs" onClick={loadSample}>
          Load sample
        </Button>
      )}
    </div>
  ) : (
    // Diff-only view: the pane is all there is, so the full empty state is right.
    <EmptyState
      icon={GitDiffIcon}
      size="sm"
      title={bothSidesFilled ? 'No comparison yet' : 'Nothing to compare'}
      description={prompt}
      action={
        canLoadSample ? (
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
          <Toolbar border={false} aria-label="Diff view and comparison actions">
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

            <ToolbarSpacer />

            <ToolbarGroup>
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
                title={`Compare both sides (${formatShortcut('mod+enter')})`}
              >
                Compare
                <Kbd keys="mod+enter" variant="inline" className="ml-1" />
              </Button>
            </ToolbarGroup>
          </Toolbar>

          {state.optionsOpen && (
            <Toolbar
              id={optionsId}
              border={false}
              aria-label="Diff options"
              className="gap-x-4 border-t border-[var(--color-border)]"
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
                label="Ignore case"
                checked={state.ignoreCase ?? false}
                onChange={(checked) => updateState({ ignoreCase: checked })}
              />
              <Toggle
                label="Normalize JSON"
                checked={state.jsonMode}
                onChange={(checked) => updateState({ jsonMode: checked })}
              />
              <ToolbarSpacer />
              <ToolbarGroup>
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
              </ToolbarGroup>
            </Toolbar>
          )}
        </div>
      }
    >
      {/* Editors and diff coexist: comparing never takes the editors away. */}
      <div
        className={`grid min-h-0 flex-1 overflow-hidden ${
          showEditors && showDiff
            ? hasComparison
              ? 'grid-rows-2'
              : 'grid-rows-[1fr_auto]'
            : 'grid-rows-1'
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
            {hunkCount > 0 && (
              <PaneHeader
                title="Changes"
                hint={
                  activeHunk < 0
                    ? `${hunkCount} hunk${hunkCount === 1 ? '' : 's'}`
                    : `${activeHunk + 1} of ${hunkCount} hunks`
                }
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => navigateHunk(-1)}
                      title="Previous hunk"
                      aria-label="Previous hunk"
                    >
                      <CaretUpIcon size={12} aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => navigateHunk(1)}
                      title="Next hunk"
                      aria-label="Next hunk"
                    >
                      <CaretDownIcon size={12} aria-hidden="true" />
                    </Button>
                  </>
                }
              />
            )}
            {diffBody}
          </section>
        )}
      </div>
    </ToolLayout>
  )
}
