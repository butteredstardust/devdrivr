import { useCallback, useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'

type Base64State = {
  input: string
  mode: 'encode' | 'decode'
}

function isValidBase64(str: string): boolean {
  if (!str.trim()) return false
  try {
    return btoa(atob(str)) === str.replace(/\s/g, '')
  } catch {
    return false
  }
}

export default function Base64Tool() {
  const [state, updateState] = useToolState<Base64State>('base64', {
    input: '',
    mode: 'encode',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const output = useMemo(() => {
    if (!state.input.trim()) return { text: '', error: null }
    try {
      if (state.mode === 'encode') {
        return { text: btoa(unescape(encodeURIComponent(state.input))), error: null }
      } else {
        return { text: decodeURIComponent(escape(atob(state.input.replace(/\s/g, '')))), error: null }
      }
    } catch (e) {
      return { text: '', error: (e as Error).message }
    }
  }, [state.input, state.mode])

  const autoDetect = useMemo(() => {
    if (!state.input.trim()) return null
    return isValidBase64(state.input.replace(/\s/g, ''))
  }, [state.input])

  const handleSwap = useCallback(() => {
    if (output.text) {
      updateState({ input: output.text, mode: state.mode === 'encode' ? 'decode' : 'encode' })
      setLastAction('Swapped', 'info')
    }
  }, [output.text, state.mode, updateState, setLastAction])

  const handleToggle = useCallback(() => {
    updateState({ mode: state.mode === 'encode' ? 'decode' : 'encode' })
    setLastAction(state.mode === 'encode' ? 'Decode mode' : 'Encode mode', 'info')
  }, [state.mode, updateState, setLastAction])

  useKeyboardShortcut({ key: 'Enter', mod: true }, handleSwap)

  return (
    <div className="flex h-full flex-col">
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
          className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
        >
          Swap ⇄
        </button>
        {autoDetect !== null && (
          <span className={`text-xs ${autoDetect ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}>
            {autoDetect ? '✓ Input looks like Base64' : ''}
          </span>
        )}
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            Input ({state.mode === 'encode' ? 'Text' : 'Base64'})
          </div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder={state.mode === 'encode' ? 'Enter text to encode...' : 'Enter Base64 to decode...'}
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">
              Output ({state.mode === 'encode' ? 'Base64' : 'Text'})
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
    </div>
  )
}
