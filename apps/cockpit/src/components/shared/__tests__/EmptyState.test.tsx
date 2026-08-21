import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToolboxIcon } from '@phosphor-icons/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('renders title and optional description', () => {
    render(<EmptyState title="Select a tool to get started" description="Use the sidebar" />)
    expect(screen.getByText('Select a tool to get started')).toBeInTheDocument()
    expect(screen.getByText('Use the sidebar')).toBeInTheDocument()
  })

  it('renders the provided Phosphor icon', () => {
    const { container } = render(<EmptyState icon={ToolboxIcon} title="No history yet" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('uses a smaller icon and tighter padding for the sm size', () => {
    const { container: mdContainer } = render(
      <EmptyState icon={ToolboxIcon} title="Full-pane empty" size="md" />
    )
    const { container: smContainer } = render(
      <EmptyState icon={ToolboxIcon} title="Inline empty" size="sm" />
    )
    const mdSvg = mdContainer.querySelector('svg')
    const smSvg = smContainer.querySelector('svg')
    expect(mdSvg?.getAttribute('width')).toBe('36')
    expect(smSvg?.getAttribute('width')).toBe('24')
  })

  it('renders an optional action', () => {
    render(<EmptyState title="No snippets" action={<button>Create snippet</button>} />)
    expect(screen.getByRole('button', { name: 'Create snippet' })).toBeInTheDocument()
  })

  // --color-text-muted carries 0.6-0.75 alpha in most themes, so an opacity utility on top
  // composites the two. The description used to carry opacity-60, which measured 2.42-3.55:1
  // against the background on all 23 themes — an AA failure everywhere. Hierarchy now comes from
  // the title being full-strength instead, which needs no dimming of the description at all.
  it('does not dim the description with an opacity utility', () => {
    render(<EmptyState title="Nothing here" description="Try a different filter" />)
    expect(screen.getByText('Try a different filter').className).not.toMatch(/\bopacity-\d/)
  })

  it('separates title from description by colour rather than opacity', () => {
    render(<EmptyState title="Nothing here" description="Try a different filter" />)
    expect(screen.getByText('Nothing here').className).toContain('text-[var(--color-text)]')
  })
})
