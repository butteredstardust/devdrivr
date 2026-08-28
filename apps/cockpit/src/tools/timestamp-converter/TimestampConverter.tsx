import { useCallback, useMemo, useState, useEffect } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { Alert } from '@/components/shared/Alert'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { Input, Select } from '@/components/shared/Input'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Toolbar, ToolbarGroup, ToolbarSpacer } from '@/components/shared/Toolbar'
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
  /**
   * How a bare number is read. `auto` uses the magnitude heuristic, which cannot tell a
   * pre-2001 millisecond epoch from a far-future second epoch — the explicit modes exist so
   * negative and historical epochs can be entered unambiguously.
   */
  epochUnit: EpochUnit
}

type EpochUnit = 'auto' | 'seconds' | 'milliseconds'

// ── Helpers ────────────────────────────────────────────────────────

function epochToMs(num: number, unit: EpochUnit): number {
  if (unit === 'seconds') return num * 1000
  if (unit === 'milliseconds') return num
  // `auto`: values whose absolute magnitude is below the millisecond threshold read as seconds.
  return Math.abs(num) < 1e12 ? num * 1000 : num
}

function parseInput(input: string, epochUnit: EpochUnit = 'auto'): Date | null {
  if (!input.trim()) return null
  const trimmed = input.trim()
  const compactDate = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed)
  if (compactDate) {
    const date = new Date(`${compactDate[1]}-${compactDate[2]}-${compactDate[3]}T00:00:00`)
    if (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === Number(compactDate[1]) &&
      date.getMonth() + 1 === Number(compactDate[2]) &&
      date.getDate() === Number(compactDate[3])
    ) {
      return date
    }
    return null
  }
  const num = Number(trimmed)
  if (!isNaN(num) && isFinite(num)) {
    const ms = epochToMs(num, epochUnit)
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
    epochUnit: 'auto',
  })
  // Enumerated once. `Intl.supportedValuesOf('timeZone')` returns ~400 strings and the list cannot
  // change while the app is running.
  const zones = useMemo(() => listTimeZones(), [])
  const { recordEdited, markUserEdit } = useToolHistory({ toolId: 'timestamp-converter' })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const parsed = useMemo(() => {
    const date = parseInput(state.input, state.epochUnit ?? 'auto')
    if (!date) return null
    return { date }
  }, [state.input, state.epochUnit])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!parsed) return
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [parsed])

  const formats = useMemo(() => {
    if (!parsed) return []
    return computeFormats(parsed.date, state.zone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, state.zone, tick])

  // Generated values are written in whatever unit the input is currently read as, so a preset
  // or picker selection round-trips instead of landing 1000× away.
  const writeEpoch = useCallback(
    (ms: number) => String(state.epochUnit === 'seconds' ? Math.round(ms / 1000) : ms),
    [state.epochUnit]
  )

  const handlePreset = useCallback(
    (preset: Preset) => {
      markUserEdit()
      updateState({ input: writeEpoch(preset.getMs()) })
      setLastAction(`Set to ${preset.label}`, 'success')
    },
    [markUserEdit, updateState, setLastAction, writeEpoch]
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
      if (d) {
        markUserEdit()
        updateState({ input: writeEpoch(d.getTime()) })
      }
    },
    [markUserEdit, updateState, state.zone, writeEpoch]
  )

  // Record history when timestamp is successfully converted
  useEffect(() => {
    if (state.input.trim() && parsed) {
      recordEdited({
        input: state.input.slice(0, 100),
        output: parsed.date.toISOString(),
        subTab: 'converted',
        success: true,
      })
    }
  }, [state.input, parsed, recordEdited])

  return (
    <ToolLayout
      toolbar={
        <>
          <Toolbar aria-label="Timestamp presets">
            <ToolbarGroup label="Presets">
              {PRESETS.map((p) => (
                <Button key={p.label} variant="secondary" size="sm" onClick={() => handlePreset(p)}>
                  {p.label}
                </Button>
              ))}
            </ToolbarGroup>
            <ToolbarSpacer />
            <Select
              value={state.epochUnit ?? 'auto'}
              onChange={(e) => updateState({ epochUnit: e.target.value as EpochUnit })}
              aria-label="Numeric input unit"
              className="max-w-[10rem]"
            >
              <option value="auto">Auto detect</option>
              <option value="seconds">Seconds</option>
              <option value="milliseconds">Milliseconds</option>
            </Select>
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
              onChange={(e) => {
                markUserEdit()
                updateState({ input: e.target.value })
              }}
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
