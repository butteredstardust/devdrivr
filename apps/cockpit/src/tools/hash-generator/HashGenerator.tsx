import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { computeHashes, computeHmac, type Hashes } from './hash-utils'

type HashGeneratorState = {
  input: string
  compareHash: string
  uppercase: boolean
  hmacMode: boolean
  hmacKey: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function HashGenerator() {
  const [state, updateState] = useToolState<HashGeneratorState>('hash-generator', {
    input: '',
    compareHash: '',
    uppercase: false,
    hmacMode: false,
    hmacKey: '',
  })
  const { record } = useToolHistory({ toolId: 'hash-generator' })
  const [hashes, setHashes] = useState<Hashes | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runCompute = useCallback(
    (input: string) => {
      setIsComputing(true)
      const fn =
        state.hmacMode && state.hmacKey ? computeHmac(input, state.hmacKey) : computeHashes(input)
      fn.then((result) => {
        setHashes(result)
        setIsComputing(false)
      }).catch(() => {
        setHashes(null)
        setIsComputing(false)
      })
    },
    [state.hmacMode, state.hmacKey]
  )

  useEffect(() => {
    if (!state.input) {
      setHashes(null)
      setIsComputing(false)
      return
    }
    setIsComputing(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runCompute(state.input)
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input, runCompute])

  useEffect(() => {
    if (hashes && !isComputing) {
      record({
        input: state.input.slice(0, 300),
        output: hashes.sha256.slice(0, 500),
        subTab: state.hmacMode ? 'hmac' : 'standard',
        success: true,
      })
    }
  }, [hashes, isComputing, state.input, state.hmacMode, record])

  const applyCase = useCallback(
    (v: string) => (state.uppercase ? v.toUpperCase() : v),
    [state.uppercase]
  )

  const hashList = useMemo(
    () =>
      hashes
        ? [
            { label: 'MD5', value: hashes.md5, bits: 128 },
            { label: 'SHA-1', value: hashes.sha1, bits: 160 },
            { label: 'SHA-256', value: hashes.sha256, bits: 256 },
            { label: 'SHA-512', value: hashes.sha512, bits: 512 },
          ]
        : [],
    [hashes]
  )

  // Compare logic
  const compareNormalized = state.compareHash.trim().toLowerCase()
  const matchedAlgo = useMemo(() => {
    if (!compareNormalized || !hashes) return null
    for (const h of hashList) {
      if (h.value.toLowerCase() === compareNormalized) return h.label
    }
    return null
  }, [compareNormalized, hashes, hashList])

  const inputBytes = useMemo(() => new TextEncoder().encode(state.input).length, [state.input])

  return (
    <div className="flex h-full flex-col">
      {/* Input area */}
      <div className="border-b border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center gap-3">
          <span className="font-pixel text-xs text-[var(--color-text-muted)]">Input</span>
          {state.input && (
            <span className="text-[10px] tabular-nums text-[var(--color-text-muted)]">
              {formatBytes(inputBytes)} · {state.input.length} chars
            </span>
          )}
          {isComputing && state.input && (
            <span className="text-[10px] text-[var(--color-text-muted)]">Computing…</span>
          )}
        </div>
        <textarea
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Enter text to hash..."
          rows={4}
          className="w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
        />

        {/* Options row */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={state.uppercase}
              onChange={(e) => updateState({ uppercase: e.target.checked })}
              className="accent-[var(--color-accent)]"
            />
            Uppercase
          </label>
          <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={state.hmacMode}
              onChange={(e) => updateState({ hmacMode: e.target.checked })}
              className="accent-[var(--color-accent)]"
            />
            HMAC
          </label>
          {state.hmacMode && (
            <input
              value={state.hmacKey}
              onChange={(e) => updateState({ hmacKey: e.target.value })}
              placeholder="Secret key..."
              className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-mono text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
            />
          )}
        </div>

        {/* Compare hash */}
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <input
              value={state.compareHash}
              onChange={(e) => updateState({ compareHash: e.target.value })}
              placeholder="Paste a hash to compare..."
              className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-mono text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
            />
            {compareNormalized && hashes && (
              <span
                className={`shrink-0 text-xs font-bold ${
                  matchedAlgo ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                }`}
              >
                {matchedAlgo ? `✓ Matches ${matchedAlgo}` : '✗ No match'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hash results */}
      <div className="flex-1 overflow-auto p-4">
        {hashList.length > 0 ? (
          <div className="flex flex-col gap-3">
            {hashList.map((h) => {
              const displayValue = applyCase(h.value)
              const isMatch = compareNormalized && h.value.toLowerCase() === compareNormalized
              return (
                <div
                  key={h.label}
                  className={`flex items-center justify-between rounded border px-3 py-2 ${
                    isMatch
                      ? 'border-[var(--color-success)] bg-[var(--color-success)]/10'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--color-text-muted)]">
                        {state.hmacMode ? `HMAC-${h.label}` : h.label}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {h.bits}-bit
                      </span>
                      {isMatch && (
                        <span className="text-[10px] font-bold text-[var(--color-success)]">
                          ✓ Match
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-xs text-[var(--color-text)]">
                      {displayValue}
                    </div>
                  </div>
                  <CopyButton
                    text={displayValue}
                    className="ml-2 shrink-0"
                    label={isMatch ? '✓ Copy' : 'Copy'}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">
            Enter text above to see hashes
          </div>
        )}
      </div>
    </div>
  )
}
