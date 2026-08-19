import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaneHeader } from '@/components/shared/PaneHeader'

describe('PaneHeader', () => {
  it('renders the title', () => {
    render(<PaneHeader title="CSS Input" />)
    expect(screen.getByText('CSS Input')).toBeInTheDocument()
  })

  it('announces status politely but leaves hints silent', () => {
    render(<PaneHeader title="Output" hint="240 B" status="Formatted" />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Formatted')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('240 B')).not.toHaveAttribute('aria-live')
  })

  it('renders actions, the slot the hand-rolled copies lacked', () => {
    render(<PaneHeader title="Output" actions={<button>Copy</button>} />)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('uses the documented pane-header padding', () => {
    const { container } = render(<PaneHeader title="Output" />)
    expect(container.firstElementChild?.className).toContain('px-3 py-1.5')
  })
})
