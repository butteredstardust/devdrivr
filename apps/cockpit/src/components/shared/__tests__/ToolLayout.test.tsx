import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToolLayout } from '@/components/shared/ToolLayout'

describe('ToolLayout', () => {
  it('renders children', () => {
    render(
      <ToolLayout>
        <p>Body content</p>
      </ToolLayout>
    )
    expect(screen.getByText('Body content')).toBeInTheDocument()
  })

  // The tab strip names the tool, so a tool body never repeats it. Library tools that show a
  // heading are naming a collection, which is MasterDetailLayout's job, not this one's.
  it('renders no heading of its own', () => {
    const { container } = render(<ToolLayout>content</ToolLayout>)
    expect(container.querySelector('h1, h2')).not.toBeInTheDocument()
  })

  it('renders the toolbar slot above the body', () => {
    render(
      <ToolLayout toolbar={<div data-testid="toolbar">controls</div>}>
        <p>Body content</p>
      </ToolLayout>
    )
    expect(screen.getByTestId('toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('toolbar').parentElement).toHaveClass('bg-[var(--color-surface)]')
  })

  it('constrains body width to the default max-w when not full-bleed', () => {
    render(
      <ToolLayout>
        <p>Body content</p>
      </ToolLayout>
    )
    const wrapper = screen.getByText('Body content').parentElement
    expect(wrapper?.className).toContain('max-w-3xl')
  })

  it('supports a custom maxWidth class', () => {
    render(
      <ToolLayout maxWidth="max-w-xl">
        <p>Body content</p>
      </ToolLayout>
    )
    const wrapper = screen.getByText('Body content').parentElement
    expect(wrapper?.className).toContain('max-w-xl')
  })

  it('renders an edge-to-edge body with no max-w wrapper when fullBleed is set', () => {
    render(
      <ToolLayout fullBleed>
        <p>Body content</p>
      </ToolLayout>
    )
    const wrapper = screen.getByText('Body content').parentElement
    expect(wrapper?.className ?? '').not.toContain('max-w')
    expect(wrapper?.className ?? '').not.toContain('p-4')
  })
})
