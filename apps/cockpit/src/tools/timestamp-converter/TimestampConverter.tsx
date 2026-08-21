import { useCallback, useMemo, useState, useEffect } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { Alert } from '@/components/shared/Alert'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { Input, Select } from '@/components/shared/Input'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Toolbar, ToolbarSpacer } from '@/components/shared/Toolbar'
import {
  computeFormats,
  listTimeZones,
  LOCAL_ZONE,
  localTimeZone,
  fromZonedWallClock,
  toZonedWallClock,
  zoneOffset,
} from '@/tools/timestamp-converter/timestamp-formats'

type TimestampState = {
  input: string
  /**
   * IANA zone the output list is rendered in, or `LOCAL_ZONE` for "wherever this machine is".
   *
   * Stored as the sentinel rather than the resolved zone so a workspace synced or restored on a
   * laptop that has since travelled still means "here", which is what the user picked.
   */
  zone: string
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
    zone: LOCAL_ZONE,
  })
  // Enumerated once. `Intl.supportedValuesOf('timeZone')` returns ~400 strings and the list cannot
  // change while the app is running.
  const zones = useMemo(() => listTimeZones(), [])
  const { record } = useToolHistory({ toolId: 'timestamp-converter' })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  const parsed = useMemo(() => {
    const date = parseInput(state.input)
    if (!date) return null
    return { date }
  }, [state.input])

  const formats = useMemo(() => {
    if (!parsed) return []
    return computeFormats(parsed.date, state.zone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, state.zone, tick])

  const handlePreset = useCallback(
    (preset: Preset) => {
      updateState({ input: String(preset.getMs()) })
      setLastAction(`Set to ${preset.label}`, 'success')
    },
    [updateState, setLastAction]
  )

  // The picker reads and writes in the *selected* zone, not the host's. A picker that silently
  // meant a different zone from the list below it would be exactly the confusion this feature
  // exists to remove.
  const dateTimeValue = useMemo(
    () => (parsed ? toZonedWallClock(parsed.date, state.zone) : ''),
    [parsed, state.zone]
  )

  const handleDateTimeChange = useCallback(
    (value: string) => {
      const d = fromZonedWallClock(value, state.zone)
      if (d) updateState({ input: String(d.getTime()) })
    },
    [updateState, state.zone]
  )

  // Record history when timestamp is successfully converted
  useEffect(() => {
    if (state.input.trim() && parsed) {
      record({
        input: state.input.slice(0, 100),
        output: parsed.date.toISOString(),
        subTab: 'converted',
        success: true,
      })
    }
  }, [state.input, parsed, record])

  return (
    <ToolLayout
      toolbar={
        <>
          <Toolbar aria-label="Timestamp presets">
            {PRESETS.map((p) => (
              <Button key={p.label} variant="secondary" size="sm" onClick={() => handlePreset(p)}>
                {p.label}
              </Button>
            ))}
            <ToolbarSpacer />
            {/* A native select: ~400 zones with OS type-ahead beats anything hand-rolled, and the
                two entries above the separator cover the cases that aren't a lookup. */}
            <Select
              value={state.zone}
              onChange={(e) => updateState({ zone: e.target.value })}
              aria-label="Output timezone"
              className="max-w-[14rem] font-mono"
            >
              <option value={LOCAL_ZONE}>Local — {localTimeZone()}</option>
              <option value="UTC">UTC</option>
              <option disabled>──────────</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
            <span className="text-2xs tabular-nums text-[var(--color-text-muted)]">
              {zoneOffset(new Date(), state.zone)}
            </span>
          </Toolbar>

          <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            <Input
              value={state.input}
              onChange={(e) => updateState({ input: e.target.value })}
              placeholder="Unix timestamp, ISO 8601, or any date string..."
              aria-label="Timestamp or date to convert"
              size="md"
              className="flex-1 font-mono"
            />
            {/* No placeholder to fall back on — a date picker announces as an unnamed group
                without this. */}
            <Input
              type="datetime-local"
              step="1"
              value={dateTimeValue}
              onChange={(e) => handleDateTimeChange(e.target.value)}
              aria-label="Pick a date and time"
            />
          </div>
        </>
      }
    >
      {parsed ? (
        <div className="flex flex-col gap-2">
          {formats.map((f) => (
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
    </ToolLayout>
  )
}
