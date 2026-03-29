import { useCallback, useMemo, useState, useEffect } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { Alert } from '@/components/shared/Alert'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'

type TimestampState = {
  input: string
}

// ── Helpers ────────────────────────────────────────────────────────

function parseInput(input: string): Date | null {
  if (!input.trim()) return null
  const trimmed = input.trim()
  const num = Number(trimmed)
  if (!isNaN(num) && isFinite(num)) {
    const ms = num < 1e12 ? num * 1000 : num
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d
  }
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
  if (absDiff < 86_400_000) return `${(absDiff / 3_600_000).toFixed(1)} hours ${suffix}`
  if (absDiff < 2_592_000_000) return `${Math.round(absDiff / 86_400_000)} days ${suffix}`
  if (absDiff < 31_536_000_000) return `${Math.round(absDiff / 2_592_000_000)} months ${suffix}`
  return `${(absDiff / 31_536_000_000).toFixed(1)} years ${suffix}`
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

function getTimezoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'Unknown'
  }
}

function getUtcOffset(d: Date): string {
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const h = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const m = String(Math.abs(offset) % 60).padStart(2, '0')
  return `UTC${sign}${h}:${m}`
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type FormatRow = {
  label: string
  value: string
  live?: boolean
  muted?: boolean
}

function computeFormats(date: Date): FormatRow[] {
  const day = DAYS[date.getDay()] ?? ''
  const week = getWeekNumber(date)
  return [
    { label: 'Unix (seconds)', value: String(Math.floor(date.getTime() / 1000)) },
    { label: 'Unix (milliseconds)', value: String(date.getTime()) },
    { label: 'ISO 8601', value: date.toISOString() },
    { label: 'RFC 2822', value: date.toUTCString() },
    { label: `Local (${getTimezoneLabel()})`, value: date.toLocaleString() },
    { label: `UTC (${getUtcOffset(date)})`, value: date.toUTCString() },
    { label: 'Day / Week', value: `${day} · Week ${week}`, muted: true },
    { label: 'Relative', value: relativeTime(date), live: true },
  ]
}

// ── Presets ─────────────────────────────────────────────────────────

type Preset = { label: string; getMs: () => number }

const PRESETS: Preset[] = [
  { label: 'Now', getMs: () => Date.now() },
  { label: '+1h', getMs: () => Date.now() + 3_600_000 },
  { label: '+1d', getMs: () => Date.now() + 86_400_000 },
  { label: '+1w', getMs: () => Date.now() + 604_800_000 },
  {
    label: 'Start of day',
    getMs: () => {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    },
  },
  {
    label: 'End of day',
    getMs: () => {
      const d = new Date()
      d.setHours(23, 59, 59, 999)
      return d.getTime()
    },
  },
  { label: 'Epoch', getMs: () => 0 },
]

// ── Component ──────────────────────────────────────────────────────

export default function TimestampConverter() {
  const [state, updateState] = useToolState<TimestampState>('timestamp-converter', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  const parsed = useMemo(() => {
    const date = parseInput(state.input)
    if (!date) return null
    return { date, formats: computeFormats(date) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.input, tick])

  const handlePreset = useCallback(
    (preset: Preset) => {
      updateState({ input: String(preset.getMs()) })
      setLastAction(`Set to ${preset.label}`, 'success')
    },
    [updateState, setLastAction]
  )

  // Native date/time input value (local ISO format)
  const dateTimeValue = useMemo(() => {
    if (!parsed) return ''
    const d = parsed.date
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }, [parsed])

  const handleDateTimeChange = useCallback(
    (value: string) => {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        updateState({ input: String(d.getTime()) })
      }
    },
    [updateState]
  )

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            variant="secondary"
            size="sm"
            onClick={() => handlePreset(p)}
          >
            {p.label}
          </Button>
        ))}
        <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
          {getTimezoneLabel()} ({getUtcOffset(new Date())})
        </span>
      </div>

      {/* Input area */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <Input
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Unix timestamp, ISO 8601, or any date string..."
          size="md"
          className="flex-1 font-mono"
        />
        <Input
          type="datetime-local"
          step="1"
          value={dateTimeValue}
          onChange={(e) => handleDateTimeChange(e.target.value)}
        />
      </div>

      {/* Format rows */}
      <div className="flex-1 overflow-auto p-4">
        {parsed ? (
          <div className="flex flex-col gap-2">
            {parsed.formats.map((f) => (
              <div
                key={f.label}
                className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                    {f.label}
                    {f.live && (
                      <span
                        className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]"
                        title="Live — updates every second"
                      />
                    )}
                  </div>
                  <div
                    className={`font-mono text-sm ${f.muted ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`}
                  >
                    {f.value}
                  </div>
                </div>
                <CopyButton text={f.value} className="ml-2 shrink-0" />
              </div>
            ))}
          </div>
        ) : state.input.trim() ? (
          <Alert variant="error">Could not parse input as a date or timestamp</Alert>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">
            Enter a timestamp or date string above, or use a preset
          </div>
        )}
      </div>
    </div>
  )
}
