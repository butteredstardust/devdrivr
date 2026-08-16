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

  it('omits the header row when no header is given', () => {
    const { container } = render(<ToolLayout>content</ToolLayout>)
    expect(container.querySelector('h2')).not.toBeInTheDocument()
  })

  it('renders title, description, and actions when a header is given', () => {
    render(
      <ToolLayout
        header={{
          title: 'My Tool',
          description: 'Does a thing',
          actions: <button>Reset</button>,
        }}
      >
        content
      </ToolLayout>
    )
    expect(screen.getByRole('heading', { name: 'My Tool' })).toBeInTheDocument()
    expect(screen.getByText('Does a thing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
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
