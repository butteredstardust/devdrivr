import { useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { html as diff2htmlRender } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useUiStore } from '@/stores/ui.store'
import type { DiffWorker } from '@/workers/diff.worker'

type DiffViewerState = {
  left: string
  right: string
  mode: 'side-by-side' | 'inline'
  ignoreWhitespace: boolean
  jsonMode: boolean
}

export default function DiffViewer() {
  useMonacoTheme()
  const [state, updateState] = useToolState<DiffViewerState>('diff-viewer', {
    left: '',
    right: '',
    mode: 'side-by-side',
    ignoreWhitespace: false,
    jsonMode: false,
  })

  const worker = useWorker<DiffWorker>(
    () => new Worker(new URL('../../workers/diff.worker.ts', import.meta.url), { type: 'module' })
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [diffHtml, setDiffHtml] = useState<string>('')

  const computeDiff = useCallback(async () => {
    if (!worker) return
    const patch = await worker.computeDiff(state.left, state.right, {
      ignoreWhitespace: state.ignoreWhitespace,
      jsonMode: state.jsonMode,
    })
    const rendered = diff2htmlRender(patch, {
      outputFormat: state.mode === 'side-by-side' ? 'side-by-side' : 'line-by-line',
      drawFileList: false,
    })
    setDiffHtml(rendered)
    setLastAction('Diff computed', 'success')
  }, [worker, state, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={computeDiff}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
        >
          Compare
        </button>
        {diffHtml && (
          <button
            onClick={() => setDiffHtml('')}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
          >
            Edit
          </button>
        )}
        <select
          value={state.mode}
          onChange={(e) => updateState({ mode: e.target.value as DiffViewerState['mode'] })}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
        >
          <option value="side-by-side">Side by Side</option>
          <option value="inline">Inline</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.ignoreWhitespace}
            onChange={(e) => updateState({ ignoreWhitespace: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          Ignore whitespace
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.jsonMode}
            onChange={(e) => updateState({ jsonMode: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          JSON mode
        </label>
      </div>

      {diffHtml ? (
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
