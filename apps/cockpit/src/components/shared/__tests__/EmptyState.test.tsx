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
})
