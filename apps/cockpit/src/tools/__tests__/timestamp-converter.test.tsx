import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import TimestampConverter from '../timestamp-converter/TimestampConverter'

describe('TimestampConverter', () => {
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
})
