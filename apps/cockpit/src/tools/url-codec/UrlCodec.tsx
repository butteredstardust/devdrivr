import { useCallback, useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type UrlCodecState = {
  input: string
  mode: 'encode' | 'decode'
  encodeMode: 'component' | 'full'
}

type UrlParts = {
  protocol: string
  host: string
  pathname: string
  search: string
  hash: string
  params: Array<{ key: string; value: string }>
}

function parseUrl(input: string): UrlParts | null {
  try {
    const url = new URL(input)
    const params: Array<{ key: string; value: string }> = []
    url.searchParams.forEach((value, key) => {
      params.push({ key, value })
    })
    return {
      protocol: url.protocol,
      host: url.host,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      params,
    }
  } catch {
    return null
  }
}

export default function UrlCodec() {
  const [state, updateState] = useToolState<UrlCodecState>('url-codec', {
    input: '',
    mode: 'encode',
    encodeMode: 'component',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const output = useMemo(() => {
    if (!state.input.trim()) return { text: '', error: null }
    try {
      if (state.mode === 'encode') {
        return {
          text: state.encodeMode === 'component'
            ? encodeURIComponent(state.input)
            : encodeURI(state.input),
          error: null,
        }
      } else {
        return {
          text: state.encodeMode === 'component'
            ? decodeURIComponent(state.input)
            : decodeURI(state.input),
          error: null,
        }
      }
    } catch (e) {
      return { text: '', error: (e as Error).message }
    }
  }, [state.input, state.mode, state.encodeMode])

  const urlParts = useMemo(() => {
    const decoded = state.mode === 'decode' && output.text ? output.text : state.input
    return parseUrl(decoded)
  }, [state.input, state.mode, output.text])

  const handleToggle = useCallback(() => {
    updateState({ mode: state.mode === 'encode' ? 'decode' : 'encode' })
    setLastAction(state.mode === 'encode' ? 'Decode mode' : 'Encode mode', 'info')
  }, [state.mode, updateState, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={handleToggle}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
        >
          {state.mode === 'encode' ? 'Encode →' : '← Decode'}
        </button>
        <select
          value={state.encodeMode}
          onChange={(e) => updateState({ encodeMode: e.target.value as UrlCodecState['encodeMode'] })}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
        >
          <option value="component">Component (encodeURIComponent)</option>
          <option value="full">Full URL (encodeURI)</option>
        </select>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">Input</div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder="Enter text or URL..."
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">Output</span>
            <CopyButton text={output.text} />
          </div>
          {output.error ? (
            <div className="p-4 text-sm text-[var(--color-error)]">{output.error}</div>
          ) : (
            <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-sm text-[var(--color-text)]">
              {output.text}
            </pre>
          )}
        </div>
      </div>
      {urlParts && (
        <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">URL Parts</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div><span className="text-[var(--color-text-muted)]">Protocol:</span> <span className="text-[var(--color-text)]">{urlParts.protocol}</span></div>
            <div><span className="text-[var(--color-text-muted)]">Host:</span> <span className="text-[var(--color-text)]">{urlParts.host}</span></div>
            <div><span className="text-[var(--color-text-muted)]">Path:</span> <span className="text-[var(--color-text)]">{urlParts.pathname}</span></div>
            <div><span className="text-[var(--color-text-muted)]">Hash:</span> <span className="text-[var(--color-text)]">{urlParts.hash || '(none)'}</span></div>
          </div>
          {urlParts.params.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-xs text-[var(--color-text-muted)]">Query Parameters:</div>
              {urlParts.params.map((p, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-[var(--color-accent)]">{p.key}</span>
                  <span className="text-[var(--color-text-muted)]">=</span>
                  <span className="text-[var(--color-text)]">{p.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
