import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Mascot } from '../Mascot'

describe('Mascot', () => {
  it('renders correctly', () => {
    const { container } = render(<Mascot />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 100 100')
  })

  it('has accessible label', () => {
    render(<Mascot />)
    expect(screen.getByLabelText(/geometric mascot/i)).toBeInTheDocument()
  })

  it('contains rotation animation', () => {
    const { container } = render(<Mascot />)
    const style = container.querySelector('style')
    expect(style).toBeInTheDocument()
    expect(style?.textContent).toContain('@keyframes mascot-rotate')
    expect(style?.textContent).toContain('.mascot-geometry')
  })

  it('contains svg paths', () => {
    const { container } = render(<Mascot />)
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
  })
})
