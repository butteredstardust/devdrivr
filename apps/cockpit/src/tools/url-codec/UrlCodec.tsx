import { useCallback, useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'

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

// ── Helpers ────────────────────────────────────────────────────────

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

function isDoubleEncoded(input: string): boolean {
  // If decoding once still contains %25 (encoded %), it's likely double-encoded
  try {
    const once = decodeURIComponent(input)
    return /%[0-9A-Fa-f]{2}/.test(once)
  } catch {
    return false
  }
}

function countEncodedChars(input: string, output: string): number {
  if (input.length === output.length) return 0
  // Count percent-encoded sequences in the longer string
  const encoded = input.length > output.length ? input : output
  const matches = encoded.match(/%[0-9A-Fa-f]{2}/g)
  return matches?.length ?? 0
}

// ── Component ──────────────────────────────────────────────────────

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
          text:
            state.encodeMode === 'component'
              ? encodeURIComponent(state.input)
              : encodeURI(state.input),
          error: null,
        }
      } else {
        return {
          text:
            state.encodeMode === 'component'
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

  const doubleEncoded = useMemo(() => {
    if (state.mode !== 'decode' || !state.input.trim()) return false
    return isDoubleEncoded(state.input)
  }, [state.mode, state.input])

  const encodedCount = useMemo(() => {
    if (!state.input.trim() || !output.text) return 0
    return countEncodedChars(state.input, output.text)
  }, [state.input, output.text])

  const handleToggle = useCallback(() => {
    updateState({ mode: state.mode === 'encode' ? 'decode' : 'encode' })
    setLastAction(state.mode === 'encode' ? 'Decode mode' : 'Encode mode', 'info')
  }, [state.mode, updateState, setLastAction])

  const handleSwap = useCallback(() => {
    if (output.text) {
      updateState({ input: output.text, mode: state.mode === 'encode' ? 'decode' : 'encode' })
      setLastAction('Swapped', 'info')
    }
  }, [output.text, state.mode, updateState, setLastAction])

  useKeyboardShortcut({ key: 'Enter', mod: true }, handleSwap)

  const noChange = state.input.trim() && output.text === state.input

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={handleToggle}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
        >
          {state.mode === 'encode' ? 'Encode →' : '← Decode'}
        </button>
        <button
          onClick={handleSwap}
          disabled={!output.text}
          className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
        >
          ⇄ Swap
        </button>
        <span className="text-[10px] text-[var(--color-text-muted)]">⌘↵</span>
        <select
          value={state.encodeMode}
          onChange={(e) =>
            updateState({ encodeMode: e.target.value as UrlCodecState['encodeMode'] })
          }
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        >
          <option value="component">Component</option>
          <option value="full">Full URL</option>
        </select>

        {/* Status badges */}
        <div className="ml-auto flex items-center gap-2">
          {doubleEncoded && (
            <span className="rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-warning)]">
              Double-encoded?
            </span>
          )}
          {noChange && (
            <span className="text-[10px] text-[var(--color-text-muted)]">No change</span>
          )}
          {encodedCount > 0 && !noChange && (
            <span className="text-[10px] tabular-nums text-[var(--color-text-muted)]">
              {encodedCount} char{encodedCount !== 1 ? 's' : ''}{' '}
              {state.mode === 'encode' ? 'encoded' : 'decoded'}
            </span>
          )}
        </div>
      </div>

      {/* Input / Output panels */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            Input ({state.mode === 'encode' ? 'Text' : 'Encoded'})
          </div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder="Enter text or URL..."
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">
              Output ({state.mode === 'encode' ? 'Encoded' : 'Text'})
            </span>
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

      {/* URL parts panel */}
      {urlParts && (
        <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">URL Parts</div>
          {/* Color-coded URL */}
          <div className="mb-2 break-all font-mono text-xs leading-relaxed">
            <span className="text-[var(--color-text-muted)]">{urlParts.protocol}//</span>
            <span className="font-bold text-[var(--color-accent)]">{urlParts.host}</span>
            <span className="text-[var(--color-info)]">{urlParts.pathname}</span>
            {urlParts.search && (
              <span className="text-[var(--color-warning)]">{urlParts.search}</span>
            )}
            {urlParts.hash && (
              <span className="text-[var(--color-success)]">{urlParts.hash}</span>
            )}
          </div>
          {urlParts.params.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {urlParts.params.map((p, i) => (
                <div key={i} className="flex gap-1 text-xs">
                  <span className="font-bold text-[var(--color-accent)]">{p.key}</span>
                  <span className="text-[var(--color-text-muted)]">=</span>
                  <span className="text-[var(--color-text)]">{p.value}</span>
                  <CopyButton text={p.value} label="Copy" className="ml-0.5" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
