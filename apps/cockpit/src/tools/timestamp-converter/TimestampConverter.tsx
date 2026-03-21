import { useCallback, useMemo, useState, useEffect } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type TimestampState = {
  input: string
}

type TimeFormats = {
  unixSeconds: string
  unixMilliseconds: string
  iso8601: string
  rfc2822: string
  relative: string
  local: string
  utc: string
}

function parseInput(input: string): Date | null {
  if (!input.trim()) return null
  const trimmed = input.trim()

  // Try as unix timestamp
  const num = Number(trimmed)
  if (!isNaN(num) && isFinite(num)) {
    // Heuristic: if < 1e12 it's seconds, otherwise milliseconds
    const ms = num < 1e12 ? num * 1000 : num
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d
  }

  // Try as date string
  const d = new Date(trimmed)
  if (!isNaN(d.getTime())) return d

  return null
}

function relativeTime(date: Date): string {
  const now = Date.now()
  const diffMs = now - date.getTime()
  const absDiff = Math.abs(diffMs)
  const suffix = diffMs >= 0 ? 'ago' : 'from now'

  if (absDiff < 60_000) return `${Math.round(absDiff / 1000)} seconds ${suffix}`
  if (absDiff < 3_600_000) return `${Math.round(absDiff / 60_000)} minutes ${suffix}`
  if (absDiff < 86_400_000) return `${Math.round(absDiff / 3_600_000)} hours ${suffix}`
  if (absDiff < 2_592_000_000) return `${Math.round(absDiff / 86_400_000)} days ${suffix}`
  if (absDiff < 31_536_000_000) return `${Math.round(absDiff / 2_592_000_000)} months ${suffix}`
  return `${Math.round(absDiff / 31_536_000_000)} years ${suffix}`
}

function computeFormats(date: Date): TimeFormats {
  return {
    unixSeconds: String(Math.floor(date.getTime() / 1000)),
    unixMilliseconds: String(date.getTime()),
    iso8601: date.toISOString(),
    rfc2822: date.toUTCString(),
    relative: relativeTime(date),
    local: date.toLocaleString(),
    utc: date.toUTCString(),
  }
}

export default function TimestampConverter() {
  const [state, updateState] = useToolState<TimestampState>('timestamp-converter', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  // Refresh relative time every 10 seconds
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000)
    return () => clearInterval(id)
  }, [])

  const parsed = useMemo(() => {
    const date = parseInput(state.input)
    if (!date) return null
    return computeFormats(date)
    // tick dependency forces re-computation for relative time
  }, [state.input, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNow = useCallback(() => {
    updateState({ input: String(Date.now()) })
    setLastAction('Inserted current timestamp', 'success')
  }, [updateState, setLastAction])

  const formats = parsed
    ? [
        { label: 'Unix (seconds)', value: parsed.unixSeconds },
        { label: 'Unix (milliseconds)', value: parsed.unixMilliseconds },
        { label: 'ISO 8601', value: parsed.iso8601 },
        { label: 'RFC 2822', value: parsed.rfc2822 },
        { label: 'Local time', value: parsed.local },
        { label: 'UTC', value: parsed.utc },
        { label: 'Relative', value: parsed.relative },
      ]
    : []

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={handleNow}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
        >
          Now
        </button>
      </div>
      <div className="p-4">
        <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">Input</h2>
        <input
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Unix timestamp (1234567890) or date string (2024-01-15T10:30:00Z)"
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4">
        {formats.length > 0 ? (
          <div className="flex flex-col gap-3">
            {formats.map((f) => (
              <div
                key={f.label}
                className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <div>
                  <div className="text-xs text-[var(--color-text-muted)]">{f.label}</div>
                  <div className="font-mono text-sm text-[var(--color-text)]">{f.value}</div>
                </div>
                <CopyButton text={f.value} className="ml-2 shrink-0" />
              </div>
            ))}
          </div>
        ) : state.input.trim() ? (
          <div className="text-sm text-[var(--color-error)]">Could not parse input as a date or timestamp</div>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">Enter a timestamp or date string above</div>
        )}
      </div>
    </div>
  )
}
