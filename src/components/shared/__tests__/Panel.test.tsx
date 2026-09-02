import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Panel } from '../Panel'

describe('Panel', () => {
  it('renders children', () => {
    render(
      <Panel>
        <p>Panel content</p>
      </Panel>
    )
    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })

  it('renders a header row when title or actions are provided', () => {
    render(
      <Panel title="Environments" actions={<button>Add</button>}>
        content
      </Panel>
    )
    expect(screen.getByText('Environments')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('omits the header row when neither title nor actions are given', () => {
    const { container } = render(<Panel>content</Panel>)
    expect(container.querySelector('h3')).not.toBeInTheDocument()
  })

  it('supports opting out of body padding', () => {
    const { container } = render(<Panel padded={false}>content</Panel>)
    const body = container.querySelector('div > div')
    expect(body?.className).not.toContain('p-3')
  })
})
