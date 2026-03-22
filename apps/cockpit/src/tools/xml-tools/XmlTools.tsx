import { useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import type { XmlWorker } from '@/workers/xml.worker'
import XmlWorkerFactory from '@/workers/xml.worker?worker'

type XmlToolsState = {
  input: string
  activeTab: string
  xpathQuery: string
  indent: number
}

const TABS = [
  { id: 'lint', label: 'Lint & Format' },
  { id: 'tree', label: 'Tree View' },
  { id: 'xpath', label: 'XPath' },
]

export default function XmlTools() {
  useMonacoTheme()
  const [state, updateState] = useToolState<XmlToolsState>('xml-tools', {
    input: '',
    activeTab: 'lint',
    xpathQuery: '',
    indent: 2,
  })

  const worker = useWorker<XmlWorker>(
    () => new XmlWorkerFactory(),
    ['validate', 'format', 'queryXPath']
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)
  const [xpathResults, setXpathResults] = useState<string[]>([])

  const handleFormat = useCallback(async () => {
    if (!worker || !state.input.trim()) return
    const result = await worker.format(state.input, state.indent)
    if (result.valid && result.formatted) {
      updateState({ input: result.formatted })
      setError(null)
      setLastAction('Formatted XML', 'success')
    } else {
      setError(result.errors.join('\n'))
      setLastAction(`${result.errors.length} error(s)`, 'error')
    }
  }, [worker, state.input, state.indent, updateState, setLastAction])

  const handleValidate = useCallback(async () => {
    if (!worker || !state.input.trim()) return
    const result = await worker.validate(state.input)
    if (result.valid) {
      setError(null)
      setLastAction('Valid XML', 'success')
    } else {
      setError(result.errors.join('\n'))
      setLastAction(`${result.errors.length} error(s)`, 'error')
    }
  }, [worker, state.input, setLastAction])

  const handleXPath = useCallback(async () => {
    if (!worker || !state.input.trim() || !state.xpathQuery.trim()) return
    const result = await worker.queryXPath(state.input, state.xpathQuery)
    setXpathResults(result.matches)
    setLastAction(`${result.count} match(es)`, result.count > 0 ? 'success' : 'info')
  }, [worker, state.input, state.xpathQuery, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <TabBar
        tabs={TABS}
        activeTab={state.activeTab}
        onTabChange={(id) => updateState({ activeTab: id })}
      />
      <div className="flex-1 overflow-hidden">
        {state.activeTab === 'lint' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
              <button
                onClick={handleFormat}
                className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
              >
                Format
              </button>
              <button
                onClick={handleValidate}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
              >
                Validate
              </button>
              <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                Indent
                <select
                  value={state.indent}
                  onChange={(e) => updateState({ indent: Number(e.target.value) })}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none"
                >
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                </select>
              </label>
              <CopyButton text={state.input} />
            </div>
            {error && (
              <div className="max-h-24 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
                <pre className="whitespace-pre-wrap">{error}</pre>
              </div>
            )}
            <div className="flex-1">
              <Editor
                language="xml"
                value={state.input}
                onChange={(v) => updateState({ input: v ?? '' })}
                options={EDITOR_OPTIONS}
              />
            </div>
          </div>
        )}

        {state.activeTab === 'tree' && (
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto p-4 text-xs">
              <pre className="whitespace-pre-wrap text-[var(--color-text)]">
                {state.input.trim() ? state.input : 'Enter XML in the Lint & Format tab'}
              </pre>
            </div>
          </div>
        )}

        {state.activeTab === 'xpath' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
              <input
                value={state.xpathQuery}
                onChange={(e) => updateState({ xpathQuery: e.target.value })}
                placeholder="Enter XPath expression (e.g. /root/child)"
                className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
              />
              <button
                onClick={handleXPath}
                className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
              >
                Query
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {xpathResults.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {xpathResults.length} match(es)
                  </div>
                  {xpathResults.map((r, i) => (
                    <pre
                      key={i}
                      className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text)]"
                    >
                      {r}
                    </pre>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--color-text-muted)]">
                  Enter an XPath expression and click Query
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
