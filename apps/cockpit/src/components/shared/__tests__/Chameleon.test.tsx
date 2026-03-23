import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Chameleon } from '../Chameleon'

describe('Chameleon', () => {
  it('renders correctly', () => {
    const { container } = render(<Chameleon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 40 36')
  })

  it('renders all mascot pixels as rects', () => {
    const { container } = render(<Chameleon />)
    const rects = container.querySelectorAll('rect')
    // We expect a significant number of rects for the 40x36 mascot
    expect(rects.length).toBeGreaterThan(100)
  })

  it('renders groups with corresponding classes', () => {
    const { container } = render(<Chameleon />)
    expect(container.querySelector('.chameleon-body')).toBeInTheDocument()
    expect(container.querySelector('.chameleon-tail')).toBeInTheDocument()
    expect(container.querySelector('.chameleon-eye')).toBeInTheDocument()
  })

  it('each group contains rects', () => {
    const { container } = render(<Chameleon />)
    expect(container.querySelector('.chameleon-body rect')).toBeInTheDocument()
    expect(container.querySelector('.chameleon-tail rect')).toBeInTheDocument()
    expect(container.querySelector('.chameleon-eye rect')).toBeInTheDocument()
  })

  it('contains passive animation keyframes and class applications', () => {
    const { container } = render(<Chameleon />)
    const style = container.querySelector('style')
    expect(style).toBeInTheDocument()
    expect(style?.textContent).toContain('@keyframes chameleon-blink')
    expect(style?.textContent).toContain('@keyframes chameleon-breathing')
    expect(style?.textContent).toContain('.chameleon-eye rect')
    expect(style?.textContent).toContain('.chameleon-body')
    expect(style?.textContent).toContain('.chameleon-tail')
  })
})
