import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { html as diff2htmlRender } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import type { DiffWorker } from '@/workers/diff.worker'
import DiffWorkerFactory from '@/workers/diff.worker?worker'

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
  let additions = 0
  let deletions = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++
  }
  return { additions, deletions }
}

export default function DiffViewer() {
  useMonacoTheme()
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
    } finally {
      comparingRef.current = false
      setIsComparing(false)
    }
  }, [worker, state.left, state.right, state.ignoreWhitespace, state.jsonMode, state.mode, setLastAction])

  // Auto-compare with debounce when both sides have content
  // eslint-disable-next-line react-hooks/exhaustive-deps — computeDiff is intentionally omitted; all its deps are listed directly
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
  }, [state.left, state.right, state.ignoreWhitespace, state.jsonMode, state.mode]) // eslint-disable-line react-hooks/exhaustive-deps

  useKeyboardShortcut({ key: 'Enter', mod: true }, computeDiff)

  const handleSwap = useCallback(() => {
    updateState({ left: state.right, right: state.left })
  }, [state.left, state.right, updateState])

  const identical = state.left === state.right && state.left.trim().length > 0

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={() => void computeDiff()}
          disabled={isComparing}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isComparing ? 'Comparing…' : 'Compare'}
        </button>
        <span className="text-[10px] text-[var(--color-text-muted)]">⌘↵</span>

        {diffHtml && !identical && (
          <button
            onClick={() => {
              setDiffHtml('')
              setRawPatch('')
            }}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
          >
            ← Editors
          </button>
        )}

        <button
          onClick={handleSwap}
          title="Swap left and right"
          className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
        >
          ⇄ Swap
        </button>

        <select
          value={state.mode}
          onChange={(e) => updateState({ mode: e.target.value as DiffViewerState['mode'] })}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        >
          <option value="side-by-side">Side by Side</option>
          <option value="inline">Inline</option>
        </select>

        <select
          value={state.language}
          onChange={(e) => updateState({ language: e.target.value })}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>

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
          {identical && (
            <span className="text-xs text-[var(--color-success)]">Identical</span>
          )}
          {rawPatch && <CopyButton text={rawPatch} label="Copy patch" />}
        </div>
      </div>

      {/* Diff output or editors */}
      {diffHtml && !identical ? (
        <div
          className="flex-1 overflow-auto bg-[var(--color-surface)] p-2 text-xs"
          dangerouslySetInnerHTML={{ __html: diffHtml }}
        />
      ) : (
        <div className="flex flex-1 gap-px bg-[var(--color-border)]">
          <div className="flex flex-1 flex-col">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              Left (original)
            </div>
            <div className="flex-1">
              <Editor
                language={state.language}
                value={state.left}
                onChange={(v) => updateState({ left: v ?? '' })}
                options={{ ...EDITOR_OPTIONS, wordWrap: 'off' }}
              />
            </div>
          </div>
          <div className="flex flex-1 flex-col">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              Right (modified)
            </div>
            <div className="flex-1">
              <Editor
                language={state.language}
                value={state.right}
                onChange={(v) => updateState({ right: v ?? '' })}
                options={{ ...EDITOR_OPTIONS, wordWrap: 'off' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
