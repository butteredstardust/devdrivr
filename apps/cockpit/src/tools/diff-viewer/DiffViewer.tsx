import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { html as diff2htmlRender } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'
import DOMPurify from 'dompurify'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { Select } from '@/components/shared/Input'
import type { DiffWorker } from '@/workers/diff.worker'
import DiffWorkerFactory from '@/workers/diff.worker?worker'

const { sanitize } = DOMPurify

type DiffViewerState = {
  left: string
  right: string
  mode: 'side-by-side' | 'inline'
  language: string
  ignoreWhitespace: boolean
  jsonMode: boolean
}

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

type DiffStats = { additions: number; deletions: number }

function parseDiffStats(patch: string): DiffStats {
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

export default function DiffViewer() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const [state, updateState] = useToolState<DiffViewerState>('diff-viewer', {
    left: '',
    right: '',
    mode: 'side-by-side',
    language: 'plaintext',
    ignoreWhitespace: false,
    jsonMode: false,
  })

  const worker = useWorker<DiffWorker>(() => new DiffWorkerFactory(), ['computeDiff'])

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [diffHtml, setDiffHtml] = useState<string>('')
  const [rawPatch, setRawPatch] = useState<string>('')
  const [isComparing, setIsComparing] = useState(false)
  const comparingRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stats = useMemo(() => (rawPatch ? parseDiffStats(rawPatch) : null), [rawPatch])

  const computeDiff = useCallback(async () => {
    if (!worker || comparingRef.current) return
    if (!state.left.trim() && !state.right.trim()) return
    comparingRef.current = true
    setIsComparing(true)
    try {
      const patch = await worker.computeDiff(state.left, state.right, {
        ignoreWhitespace: state.ignoreWhitespace,
        jsonMode: state.jsonMode,
      })
      setRawPatch(patch)
      const rendered = diff2htmlRender(patch, {
        outputFormat: state.mode === 'side-by-side' ? 'side-by-side' : 'line-by-line',
        drawFileList: false,
      })
      setDiffHtml(rendered)
      setLastAction('Diff computed', 'success')
    } catch (error) {
      setLastAction('Diff computation failed', 'error')
      setDiffHtml('')
      setRawPatch('')
    } finally {
      comparingRef.current = false
      setIsComparing(false)
    }
  }, [
    worker,
    state.left,
    state.right,
    state.ignoreWhitespace,
    state.jsonMode,
    state.mode,
    setLastAction,
    setDiffHtml,
    setRawPatch,
  ])

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

  useKeyboardShortcut({ key: 'Enter', mod: true }, computeDiff)

  const handleSwap = useCallback(() => {
    updateState({ left: state.right, right: state.left })
  }, [state.left, state.right, updateState])

  const identical = state.left === state.right && state.left.trim().length > 0

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void computeDiff()}
          disabled={isComparing}
        >
          {isComparing ? 'Comparing…' : 'Compare'}
        </Button>
        <span className="text-[10px] text-[var(--color-text-muted)]">⌘↵</span>

        {diffHtml && !identical && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDiffHtml('')
              setRawPatch('')
            }}
          >
            ← Editors
          </Button>
        )}

        <Button variant="secondary" size="sm" onClick={handleSwap} title="Swap left and right">
          ⇄ Swap
        </Button>

        <Select
          value={state.mode}
          onChange={(e) => updateState({ mode: e.target.value as DiffViewerState['mode'] })}
        >
          <option value="side-by-side">Side by Side</option>
          <option value="inline">Inline</option>
        </Select>

        <Select value={state.language} onChange={(e) => updateState({ language: e.target.value })}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>

        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.ignoreWhitespace}
            onChange={(e) => updateState({ ignoreWhitespace: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          Ignore WS
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.jsonMode}
            onChange={(e) => updateState({ jsonMode: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          JSON
        </label>

        {/* Stats + export on the right */}
        <div className="ml-auto flex items-center gap-2">
          {stats && !identical && (
            <span className="text-xs tabular-nums">
              <span className="text-[var(--color-success)]">+{stats.additions}</span>
              {' / '}
              <span className="text-[var(--color-error)]">−{stats.deletions}</span>
            </span>
          )}
          {identical && <span className="text-xs text-[var(--color-success)]">Identical</span>}
          {rawPatch && <CopyButton text={rawPatch} label="Copy patch" />}
        </div>
      </div>

      {/* Diff output or editors */}
      {diffHtml && !identical ? (
        <div
          className="flex-1 overflow-auto bg-[var(--color-surface)] p-2 text-xs"
          style={{
            // Map diff2html tokens to app theme tokens so the diff
            // always matches the current color scheme without needing
            // the bundled light-only diff2html.min.css
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
            ['--d2h-ins-highlight-bg-color' as string]: 'color-mix(in srgb, var(--color-success) 40%, transparent)',
            ['--d2h-ins-label-color' as string]: 'var(--color-success)',
            ['--d2h-del-bg-color' as string]: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
            ['--d2h-del-border-color' as string]: 'color-mix(in srgb, var(--color-error) 40%, transparent)',
            ['--d2h-del-highlight-bg-color' as string]: 'color-mix(in srgb, var(--color-error) 40%, transparent)',
            ['--d2h-del-label-color' as string]: 'var(--color-error)',
            ['--d2h-change-del-color' as string]: 'color-mix(in srgb, var(--color-warning) 20%, transparent)',
            ['--d2h-change-ins-color' as string]: 'color-mix(in srgb, var(--color-success) 20%, transparent)',
            ['--d2h-change-label-color' as string]: 'var(--color-warning)',
            ['--d2h-info-bg-color' as string]: 'var(--color-surface)',
            ['--d2h-info-border-color' as string]: 'var(--color-border)',
          }}
          dangerouslySetInnerHTML={{
            __html: sanitize(diffHtml, {
              ALLOWED_TAGS: [
                'div', 'span', 'code', 'pre', 'del', 'ins', 'br', 'hr',
                'table', 'thead', 'tbody', 'tr', 'th', 'td',
                'svg', 'path', 'label', 'input', 'a',
              ],
              ALLOWED_ATTR: ['class', 'style', 'data-diffline', 'data-diffpath', 'type', 'checked', 'disabled', 'title'],
              FORCE_BODY: true,
            }),
          }}
        />
      ) : (
        <div className="flex flex-1 gap-px bg-[var(--color-border)]">
          <div className="flex flex-1 flex-col">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              Left (original)
            </div>
            <div className="flex-1">
              <Editor
                theme={monacoTheme}
                language={state.language}
                value={state.left}
                onChange={(v) => updateState({ left: v ?? '' })}
                options={{ ...monacoOptions, wordWrap: 'off' }}
              />
            </div>
          </div>
          <div className="flex flex-1 flex-col">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              Right (modified)
            </div>
            <div className="flex-1">
              <Editor
                theme={monacoTheme}
                language={state.language}
                value={state.right}
                onChange={(v) => updateState({ right: String(v) })}
                options={{ ...monacoOptions, wordWrap: 'off' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
