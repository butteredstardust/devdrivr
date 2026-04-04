import { useCallback, useMemo, useEffect } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { Alert } from '@/components/shared/Alert'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { Button } from '@/components/shared/Button'

type Base64State = {
  input: string
  mode: 'encode' | 'decode'
  urlSafe: boolean
  lineWrap: boolean
}

// ── Helpers ────────────────────────────────────────────────────────

function isValidBase64(str: string): boolean {
  if (!str.trim()) return false
  try {
    return btoa(atob(str)) === str.replace(/\s/g, '')
  } catch {
    return false
  }
}

function toUrlSafe(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromUrlSafe(b64: string): string {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4
  if (pad) s += '='.repeat(4 - pad)
  return s
}

function wrapLines(str: string, width: number): string {
  const lines: string[] = []
  for (let i = 0; i < str.length; i += width) {
    lines.push(str.slice(i, i + width))
  }
  return lines.join('\n')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function detectImageMime(b64: string): string | null {
  // Check first few bytes of decoded data via the base64 prefix
  const clean = b64.replace(/\s/g, '')
  if (clean.startsWith('/9j/')) return 'image/jpeg'
  if (clean.startsWith('iVBOR')) return 'image/png'
  if (clean.startsWith('R0lGOD')) return 'image/gif'
  if (clean.startsWith('UklGR')) return 'image/webp'
  if (clean.startsWith('PHN2Zy')) return 'image/svg+xml'
  return null
}

// ── Component ──────────────────────────────────────────────────────

export default function Base64Tool() {
  const [state, updateState] = useToolState<Base64State>('base64', {
    input: '',
    mode: 'encode',
    urlSafe: false,
    lineWrap: false,
  })
  const { record } = useToolHistory({ toolId: 'base64' })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const output = useMemo(() => {
    if (!state.input.trim()) return { text: '', error: null }
    try {
      if (state.mode === 'encode') {
        let encoded = btoa(unescape(encodeURIComponent(state.input)))
        if (state.urlSafe) encoded = toUrlSafe(encoded)
        if (state.lineWrap) encoded = wrapLines(encoded, 76)
        return { text: encoded, error: null }
      } else {
        let toDecode = state.input.replace(/\s/g, '')
        // Strip data URI prefix for decoding
        const dataUriMatch = toDecode.match(/^data:[^;]*;base64,(.*)$/)
        if (dataUriMatch) toDecode = dataUriMatch[1]!
        if (state.urlSafe) toDecode = fromUrlSafe(toDecode)
        return { text: decodeURIComponent(escape(atob(toDecode))), error: null }
      }
    } catch (e) {
      return { text: '', error: (e as Error).message }
    }
  }, [state.input, state.mode, state.urlSafe, state.lineWrap])

  const autoDetect = useMemo(() => {
    if (!state.input.trim()) return null
    return isValidBase64(state.input.replace(/\s/g, ''))
  }, [state.input])

  // Size stats
  const inputBytes = useMemo(() => new TextEncoder().encode(state.input).length, [state.input])
  const outputBytes = useMemo(
    () => (output.text ? new TextEncoder().encode(output.text).length : 0),
    [output.text]
  )
  const ratio = useMemo(() => {
    if (!inputBytes || !outputBytes) return null
    if (state.mode === 'encode') return (outputBytes / inputBytes).toFixed(2)
    return (inputBytes / outputBytes).toFixed(2)
  }, [inputBytes, outputBytes, state.mode])

  // Image preview (decode mode only)
  const imagePreview = useMemo(() => {
    if (state.mode !== 'decode' || !state.input.trim()) return null
    const clean = state.input.replace(/\s/g, '')

    // Check for data URI with image mime
    const dataUriMatch = clean.match(/^data:(image\/[^;]+);base64,(.*)$/)
    if (dataUriMatch) return clean // Already a full data URI

    // Check raw base64 for image signatures
    const mime = detectImageMime(clean)
    if (mime) return `data:${mime};base64,${clean}`

    return null
  }, [state.mode, state.input])

  // Data URI builder (encode mode)
  const dataUri = useMemo(() => {
    if (state.mode !== 'encode' || !output.text) return null
    const raw = output.text.replace(/\n/g, '')
    return `data:text/plain;base64,${raw}`
  }, [state.mode, output.text])

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

  // Record history when output changes successfully
  useEffect(() => {
    if (state.input.trim() && output.text && !output.error) {
      record({
        input: `${state.mode === 'encode' ? 'Encode' : 'Decode'}: ${state.input.slice(0, 500)}${state.input.length > 500 ? '...' : ''}`,
        output: output.text.slice(0, 1000),
        subTab: state.mode,
        success: true,
      })
    }
  }, [state.input, state.mode, output.text, output.error, record])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <Button variant="primary" size="sm" onClick={handleToggle}>
          {state.mode === 'encode' ? 'Encode →' : '← Decode'}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleSwap} disabled={!output.text}>
          ⇄ Swap
        </Button>
        <span className="text-[10px] text-[var(--color-text-muted)]">⌘↵</span>

        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.urlSafe}
            onChange={(e) => updateState({ urlSafe: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          URL-safe
        </label>
        {state.mode === 'encode' && (
          <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={state.lineWrap}
              onChange={(e) => updateState({ lineWrap: e.target.checked })}
              className="accent-[var(--color-accent)]"
            />
            Wrap 76
          </label>
        )}

        {autoDetect && <span className="text-xs text-[var(--color-success)]">✓ Valid Base64</span>}

        {/* Stats */}
        <div className="ml-auto flex items-center gap-2 text-[10px] tabular-nums text-[var(--color-text-muted)]">
          {state.input.trim() && (
            <>
              <span>{formatSize(inputBytes)}</span>
              <span>→</span>
              <span>{formatSize(outputBytes)}</span>
              {ratio && <span>({ratio}×)</span>}
            </>
          )}
        </div>
      </div>

      {/* Panels */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            Input ({state.mode === 'encode' ? 'Text' : 'Base64'})
          </div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder={
              state.mode === 'encode'
                ? 'Enter text to encode...'
                : 'Enter Base64 to decode (data URIs supported)...'
            }
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">
              Output ({state.mode === 'encode' ? 'Base64' : 'Text'})
            </span>
            <div className="flex items-center gap-1">
              {dataUri && state.mode === 'encode' && (
                <CopyButton text={dataUri} label="Copy data URI" />
              )}
              <CopyButton text={output.text} />
            </div>
          </div>
          {output.error ? (
            <Alert variant="error" className="m-4">
              {output.error}
            </Alert>
          ) : (
            <div className="flex flex-1 flex-col overflow-auto">
              <pre className="flex-1 whitespace-pre-wrap break-all p-4 font-mono text-sm text-[var(--color-text)]">
                {output.text}
              </pre>
              {/* Image preview */}
              {imagePreview && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="mb-2 text-xs text-[var(--color-text-muted)]">Image Preview</div>
                  <img
                    src={imagePreview}
                    alt="Decoded preview"
                    className="max-h-48 rounded border border-[var(--color-border)]"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
