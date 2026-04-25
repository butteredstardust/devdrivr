import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import ColorConverter from '../color-converter/ColorConverter'

describe('ColorConverter', () => {
  it('renders with default color', () => {
    renderTool(ColorConverter)
    const inputs = screen.getAllByDisplayValue('#39ff14')
    expect(inputs.length).toBeGreaterThanOrEqual(1)
  })

  it('shows format outputs for a valid hex', () => {
    renderTool(ColorConverter)
    expect(screen.getByText(/^Hex/)).toBeInTheDocument()
    expect(screen.getByText(/^RGB/)).toBeInTheDocument()
    expect(screen.getByText(/^HSL/)).toBeInTheDocument()
  })

  it('updates formats when input changes', () => {
    renderTool(ColorConverter)
    const input = screen.getByPlaceholderText(/#39ff14/)
    fireEvent.change(input, { target: { value: '#ff0000' } })
    expect(screen.getByText(/rgb\(255/i)).toBeInTheDocument()
  })

  it('shows WCAG contrast section', () => {
    renderTool(ColorConverter)
    expect(screen.getByText(/contrast/i)).toBeInTheDocument()
  })

  it('rejects out-of-range RGB and HSL values', () => {
    renderTool(ColorConverter)
    const input = screen.getByPlaceholderText(/#39ff14/)

    fireEvent.change(input, { target: { value: 'rgb(999, 0, 0)' } })
    expect(screen.queryByText(/rgb\(999/i)).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'hsl(120, 150%, 50%)' } })
    expect(screen.queryByText(/hsl\(120, 150%/i)).not.toBeInTheDocument()
  })
})
