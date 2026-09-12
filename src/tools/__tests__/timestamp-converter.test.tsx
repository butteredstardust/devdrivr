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
