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

  it('defaults to 24px and honours an explicit size', () => {
    // About renders this at 112px while the sidebar keeps the 24px default, so the artwork has to
    // scale off one prop rather than off a className the viewBox would ignore.
    const { container: small } = render(<Mascot />)
    expect(small.querySelector('svg')?.getAttribute('width')).toBe('24')
    expect(small.querySelector('svg')?.getAttribute('height')).toBe('24')

    const { container: large } = render(<Mascot size={112} />)
    expect(large.querySelector('svg')?.getAttribute('width')).toBe('112')
    expect(large.querySelector('svg')?.getAttribute('height')).toBe('112')
  })

  it('contains svg paths', () => {
    const { container } = render(<Mascot />)
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
  })
})
