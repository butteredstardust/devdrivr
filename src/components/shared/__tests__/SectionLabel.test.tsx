import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionLabel } from '@/components/shared/SectionLabel'

describe('SectionLabel', () => {
  it('renders as a span by default, not a heading', () => {
    render(<SectionLabel>Output</SectionLabel>)
    expect(screen.getByText('Output').tagName).toBe('SPAN')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('renders a real heading when asked, so the outline is a separate decision from the visual', () => {
    render(<SectionLabel as="h2">Validate</SectionLabel>)
    expect(screen.getByRole('heading', { level: 2, name: 'Validate' })).toBeInTheDocument()
  })

  it('applies the single documented label idiom', () => {
    render(<SectionLabel>Input</SectionLabel>)
    const className = screen.getByText('Input').className
    expect(className).toContain('font-ui')
    expect(className).toContain('text-2xs')
    expect(className).toContain('font-semibold')
    expect(className).toContain('uppercase')
    expect(className).toContain('tracking-wide')
  })

  it('renders a hint without uppercasing it', () => {
    render(<SectionLabel hint="12 matches">Results</SectionLabel>)
    const hint = screen.getByText('12 matches')
    expect(hint).toBeInTheDocument()
    expect(hint.className).toContain('normal-case')
  })
})
