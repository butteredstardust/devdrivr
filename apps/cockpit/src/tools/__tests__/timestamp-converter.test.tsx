import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { renderTool } from './test-utils'
import TimestampConverter from '../timestamp-converter/TimestampConverter'

const recordMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useToolHistory', () => ({
  useToolHistory: () => ({ record: recordMock }),
}))

describe('TimestampConverter', () => {
  beforeEach(() => {
    recordMock.mockClear()
    vi.useRealTimers()
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
  })

  it('parses a unix timestamp', () => {
    renderTool(TimestampConverter)
    const input = screen.getByPlaceholderText(/unix timestamp/i)
    fireEvent.change(input, { target: { value: '0' } })
    const matches = screen.getAllByText(/1970/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
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
