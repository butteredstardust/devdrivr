import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import ColorConverter, {
  apcaContrast,
  generateScale,
  labToLch,
  rgbToLab,
} from '../color-converter/ColorConverter'

describe('ColorConverter', () => {
  it('converts sRGB to CIE LAB and LCH', () => {
    expect(rgbToLab({ r: 255, g: 255, b: 255 })).toEqual({ l: 100, a: 0, b: 0 })
    const red = labToLch(rgbToLab({ r: 255, g: 0, b: 0 }))
    expect(red.l).toBeCloseTo(54.3, 1)
    expect(red.c).toBeGreaterThan(100)
  })
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
    expect(screen.getByText(/^LAB/)).toBeInTheDocument()
    expect(screen.getByText(/^LCH/)).toBeInTheDocument()
  })

  it('updates formats when input changes', () => {
    renderTool(ColorConverter)
    const input = screen.getByPlaceholderText(/#39ff14/)
    fireEvent.change(input, { target: { value: '#ff0000' } })
    expect(screen.getByText(/rgb\(255/i)).toBeInTheDocument()
  })

  it('preserves alpha across converted formats', () => {
    renderTool(ColorConverter)
    fireEvent.change(screen.getByPlaceholderText(/#39ff14/), {
      target: { value: 'rgba(255, 0, 0, 0.5)' },
    })
    expect(screen.getByRole('button', { name: /Copy Hex value #ff000080/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copy HSL value .*\/ 0.5/i })).toBeInTheDocument()
  })

  it('accepts CSS Color 4 short hex and degree hue syntax', () => {
    renderTool(ColorConverter)
    const input = screen.getByPlaceholderText(/#39ff14/)
    fireEvent.change(input, { target: { value: '#0f08' } })
    expect(screen.getByRole('button', { name: /Copy Hex value #00ff0088/i })).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'hsl(120deg 100% 50% / 50%)' } })
    expect(screen.getByRole('button', { name: /Copy Hex value #00ff0080/i })).toBeInTheDocument()
  })

  it('shows WCAG contrast section', () => {
    renderTool(ColorConverter)
    expect(screen.getByText(/contrast/i)).toBeInTheDocument()
  })

  it('generates scale steps from OKLCH lightness and exposes APCA', () => {
    expect(generateScale({ r: 255, g: 0, b: 0 })[0]?.label).toBe('5%')
    expect(apcaContrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeGreaterThan(100)
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

describe('ColorConverter — status and copy affordance', () => {
  it('reports the parsed color in the document toolbar', () => {
    renderTool(ColorConverter)

    expect(screen.getByTestId('color-status')).toHaveTextContent('#39FF14')
    expect(screen.getByTestId('color-status')).toHaveTextContent('formats')
  })

  it('says the input was not understood rather than silently showing nothing', () => {
    renderTool(ColorConverter)
    fireEvent.change(screen.getByPlaceholderText(/#39ff14/), { target: { value: 'not a color' } })

    expect(screen.getByTestId('color-status')).toHaveTextContent('Unrecognised color')
  })

  it('makes each format row itself the copy target, not a column of Copy buttons', () => {
    renderTool(ColorConverter)

    // One button per format, labelled with the format — the seven identically
    // labelled "Copy" buttons this replaced told you nothing about their target.
    expect(screen.getByRole('button', { name: /Copy Hex value/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copy RGB value/ })).toBeInTheDocument()
  })
})
