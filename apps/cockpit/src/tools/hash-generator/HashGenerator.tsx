import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input } from '@/components/shared/Input'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TextArea } from '@/components/shared/TextArea'
import { Toggle } from '@/components/shared/Toggle'
import { CheckCircleIcon, HashIcon, XCircleIcon } from '@phosphor-icons/react'
import { computeHashes, computeHmac, type Hashes } from './hash-utils'
import { formatBytes } from '@/lib/format'

type HashGeneratorState = {
  input: string
  compareHash: string
  uppercase: boolean
  hmacMode: boolean
  hmacKey: string
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
    <ToolLayout
      toolbar={
        <div className="border-b border-[var(--color-border)] p-4">
          <div className="mb-2 flex items-center gap-3">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">Input</span>
            {state.input && (
              <span className="text-2xs tabular-nums text-[var(--color-text-muted)]">
                {formatBytes(inputBytes)} · {state.input.length} chars
              </span>
            )}
            {isComputing && state.input && (
              <span className="text-2xs text-[var(--color-text-muted)]">Computing…</span>
            )}
          </div>
          <TextArea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder="Enter text to hash..."
            rows={4}
            size="md"
            className="resize-none"
          />

          {/* Options row */}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Toggle
              checked={state.uppercase}
              onChange={(uppercase) => updateState({ uppercase })}
              label="Uppercase"
            />
            <Toggle
              checked={state.hmacMode}
              onChange={(hmacMode) => updateState({ hmacMode })}
              label="HMAC"
            />
            {state.hmacMode && (
              <Input
                value={state.hmacKey}
                onChange={(e) => updateState({ hmacKey: e.target.value })}
                placeholder="Secret key..."
                aria-label="HMAC secret key"
                className="flex-1 font-mono"
              />
            )}
          </div>

          {/* Compare hash */}
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <Input
                value={state.compareHash}
                onChange={(e) => updateState({ compareHash: e.target.value })}
                placeholder="Paste a hash to compare..."
                aria-label="Hash to compare"
                className="flex-1 font-mono"
              />
              {compareNormalized && hashes && (
                <StatusBadge variant={matchedAlgo ? 'success' : 'error'}>
                  {matchedAlgo ? (
                    <CheckCircleIcon size={12} weight="fill" aria-hidden="true" />
                  ) : (
                    <XCircleIcon size={12} weight="fill" aria-hidden="true" />
                  )}
                  {matchedAlgo ? `Matches ${matchedAlgo}` : 'No match'}
                </StatusBadge>
              )}
            </div>
          </div>
        </div>
      }
    >
      {hashList.length > 0 ? (
        <div className="flex flex-col gap-3">
          {hashList.map((h) => {
            const displayValue = applyCase(h.value)
            const isMatch = compareNormalized && h.value.toLowerCase() === compareNormalized
            return (
              <div
                key={h.label}
                className={`flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2 ${
                  isMatch ? 'border-[var(--color-success)] bg-[var(--color-success)]/10' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--color-text-muted)]">
                      {state.hmacMode ? `HMAC-${h.label}` : h.label}
                    </span>
                    <span className="text-2xs text-[var(--color-text-muted)]">{h.bits}-bit</span>
                    {isMatch && <StatusBadge variant="success">Match</StatusBadge>}
                  </div>
                  <div className="truncate font-mono text-xs text-[var(--color-text)]">
                    {displayValue}
                  </div>
                </div>
                <CopyButton text={displayValue} className="ml-2 shrink-0" label="Copy" />
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={HashIcon}
          title="Enter text above to see hashes"
          size="sm"
          className="p-0"
        />
      )}
    </ToolLayout>
  )
}
