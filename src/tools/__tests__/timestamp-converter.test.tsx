import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, fireEvent, act, render } from '@testing-library/react'
import { renderTool } from './test-utils'
import TimestampConverter from '../timestamp-converter/TimestampConverter'
import { useSettingsStore } from '@/stores/settings.store'
import { useToolStateCache } from '@/stores/tool-state.store'
import { DEFAULT_SETTINGS } from '@/types/models'
import { LOCAL_ZONE } from '@/tools/timestamp-converter/timestamp-formats'

const recordMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useToolHistory', () => ({
  useToolHistory: () => ({
    record: recordMock,
    recordEdited: recordMock,
    markUserEdit: vi.fn(),
  }),
}))

describe('TimestampConverter', () => {
  beforeEach(() => {
    recordMock.mockClear()
    vi.useRealTimers()
    useSettingsStore.setState({ ...DEFAULT_SETTINGS })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders preset buttons', () => {
    renderTool(TimestampConverter)
    expect(screen.getByText('Now')).toBeInTheDocument()
    expect(screen.getByText('+1h')).toBeInTheDocument()
    expect(screen.getByText('Epoch')).toBeInTheDocument()
  })

  it('shows format rows after clicking Now', () => {
    renderTool(TimestampConverter)
    fireEvent.click(screen.getByText('Now'))
    expect(screen.getByText('ISO 8601')).toBeInTheDocument()
    expect(screen.getByText('RFC 2822')).toBeInTheDocument()
    expect(screen.getByText(/Relative/)).toBeInTheDocument()
    expect(screen.getByText('ISO week')).toBeInTheDocument()
  })

  it('applies start and end of day presets in the selected timezone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-18T12:00:00Z'))
    renderTool(TimestampConverter)
    fireEvent.change(screen.getByLabelText('Output timezone'), { target: { value: 'UTC' } })

    fireEvent.click(screen.getByRole('button', { name: 'Start of day' }))
    expect(screen.getByLabelText('Timestamp or date to convert')).toHaveValue(
      String(Date.parse('2026-09-18T00:00:00Z'))
    )

    fireEvent.click(screen.getByRole('button', { name: 'End of day' }))
    expect(screen.getByLabelText('Timestamp or date to convert')).toHaveValue(
      String(Date.parse('2026-09-19T00:00:00Z') - 1)
    )
  })

  it('keeps End of day on the same date in seconds mode', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-18T12:00:00Z'))
    renderTool(TimestampConverter)
    fireEvent.change(screen.getByLabelText('Output timezone'), { target: { value: 'UTC' } })
    fireEvent.change(screen.getByLabelText('Numeric input unit'), {
      target: { value: 'seconds' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'End of day' }))
    // Rounding would carry the last millisecond up into the next day.
    expect(screen.getByLabelText('Timestamp or date to convert')).toHaveValue(
      String(Date.parse('2026-09-18T23:59:59Z') / 1000)
    )
  })

  it('formats the same instant in the selected timezone', () => {
    renderTool(TimestampConverter)
    fireEvent.change(screen.getByLabelText('Timestamp or date to convert'), {
      target: { value: '2021-06-01T12:00:00Z' },
    })
    fireEvent.change(screen.getByLabelText('Output timezone'), {
      target: { value: 'Europe/Bucharest' },
    })
    expect(screen.getByText('2021-06-01 15:00:00')).toBeInTheDocument()
  })

  it('uses the configured timezone only for fresh tool state', () => {
    useSettingsStore.setState({ defaultTimezone: 'Europe/Bucharest' })
    renderTool(TimestampConverter)
    expect(screen.getByLabelText('Output timezone')).toHaveValue('Europe/Bucharest')
  })

  it('keeps a valid saved zone and falls back from an invalid saved zone', () => {
    useSettingsStore.setState({ defaultTimezone: 'Europe/Bucharest' })
    useToolStateCache.setState({
      cache: new Map([
        ['timestamp-converter', { input: '', zone: 'America/New_York', epochUnit: 'auto' }],
      ]),
    })
    const first = render(<TimestampConverter />)
    expect(screen.getByLabelText('Output timezone')).toHaveValue('America/New_York')
    first.unmount()

    useToolStateCache.setState({
      cache: new Map([
        ['timestamp-converter', { input: '', zone: 'Mars/Olympus', epochUnit: 'auto' }],
      ]),
    })
    render(<TimestampConverter />)
    expect(screen.getByLabelText('Output timezone')).toHaveValue(LOCAL_ZONE)
  })

  it('parses a unix timestamp', () => {
    renderTool(TimestampConverter)
    const input = screen.getByPlaceholderText(/unix timestamp/i)
    fireEvent.change(input, { target: { value: '0' } })
    const matches = screen.getAllByText(/1970/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it.each(['1727600000', '1727600000000', '1727600000000000', '1727600000000000000'])(
    'auto-detects the epoch unit for %s',
    (value) => {
      renderTool(TimestampConverter)
      fireEvent.change(screen.getByLabelText('Timestamp or date to convert'), {
        target: { value },
      })

      expect(screen.getByText(new Date(1727600000000).toISOString())).toBeInTheDocument()
    }
  )

  it('preserves millisecond precision from nanoseconds', () => {
    renderTool(TimestampConverter)
    fireEvent.change(screen.getByLabelText('Timestamp or date to convert'), {
      target: { value: '1727600000123456789' },
    })

    expect(screen.getByText(new Date(1727600000123).toISOString())).toBeInTheDocument()
  })

  it.each([
    ['microseconds', '1727600000000000', 1000n],
    ['nanoseconds', '1727600000000000000', 1_000_000n],
  ])('parses and writes %s epochs', (unit, value, multiplier) => {
    vi.useFakeTimers()
    const now = new Date('2024-09-29T08:53:20.123Z')
    vi.setSystemTime(now)
    renderTool(TimestampConverter)
    fireEvent.change(screen.getByLabelText('Numeric input unit'), { target: { value: unit } })
    fireEvent.change(screen.getByLabelText('Timestamp or date to convert'), {
      target: { value },
    })
    expect(screen.getByText(new Date(1727600000000).toISOString())).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Now' }))
    expect(screen.getByLabelText('Timestamp or date to convert')).toHaveValue(
      String(BigInt(now.getTime()) * multiplier)
    )
    expect(screen.getByText(now.toISOString())).toBeInTheDocument()
  })

  it('floors a negative microsecond epoch before converting it to a date', () => {
    renderTool(TimestampConverter)
    fireEvent.change(screen.getByLabelText('Numeric input unit'), {
      target: { value: 'microseconds' },
    })
    fireEvent.change(screen.getByLabelText('Timestamp or date to convert'), {
      target: { value: '-1' },
    })

    expect(screen.getByText('1969-12-31T23:59:59.999Z')).toBeInTheDocument()
  })

  it.each(['microseconds', 'nanoseconds'])('restores the saved %s epoch unit', (epochUnit) => {
    useToolStateCache.setState({
      cache: new Map([['timestamp-converter', { input: '', zone: 'UTC', epochUnit }]]),
    })
    render(<TimestampConverter />)

    expect(screen.getByLabelText('Numeric input unit')).toHaveValue(epochUnit)
  })

  it('falls back to auto for an unknown saved epoch unit', () => {
    useToolStateCache.setState({
      cache: new Map([
        ['timestamp-converter', { input: '', zone: 'UTC', epochUnit: 'fortnights' }],
      ]),
    })
    render(<TimestampConverter />)

    expect(screen.getByLabelText('Numeric input unit')).toHaveValue('auto')
  })

  it('parses compact YYYYMMDD dates before treating digits as epoch seconds', () => {
    renderTool(TimestampConverter)
    fireEvent.change(screen.getByLabelText('Timestamp or date to convert'), {
      target: { value: '20240821' },
    })
    expect(screen.getAllByText(/2024-08-21/).length).toBeGreaterThan(0)
  })

  it('shows error for invalid input', () => {
    renderTool(TimestampConverter)
    const input = screen.getByPlaceholderText(/unix timestamp/i)
    fireEvent.change(input, { target: { value: 'not-a-date' } })
    expect(screen.getByText(/could not parse/i)).toBeInTheDocument()
  })

  it('does not record the same timestamp again on live relative ticks', async () => {
    vi.useFakeTimers()
    renderTool(TimestampConverter)
    const input = screen.getByPlaceholderText(/unix timestamp/i)

    fireEvent.change(input, { target: { value: '0' } })

    expect(recordMock).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(3_000)
    })

    expect(recordMock).toHaveBeenCalledTimes(1)
  })
})
