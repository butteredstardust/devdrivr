import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  DocumentIdentity,
  DocumentToolbar,
  Toolbar,
  ToolbarGroup,
  ToolbarSpacer,
} from '@/components/shared/Toolbar'

describe('Toolbar', () => {
  it('renders children in a row', () => {
    render(
      <Toolbar>
        <button>Format</button>
        <button>Minify</button>
      </Toolbar>
    )
    expect(screen.getByRole('button', { name: 'Format' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Minify' })).toBeInTheDocument()
  })

  it('draws a bottom border by default and omits it when border=false', () => {
    const { container: withBorder } = render(<Toolbar>content</Toolbar>)
    const { container: noBorder } = render(<Toolbar border={false}>content</Toolbar>)
    expect(withBorder.firstElementChild?.className).toContain('border-b')
    expect(noBorder.firstElementChild?.className).not.toContain('border-b')
  })

  it('labels related action groups and provides a flexible spacer', () => {
    const { container } = render(
      <Toolbar aria-label="Editor actions">
        <ToolbarGroup label="Document actions">
          <button>Save</button>
        </ToolbarGroup>
        <ToolbarSpacer />
      </Toolbar>
    )

    expect(screen.getByRole('toolbar', { name: 'Editor actions' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Document actions' })).toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('flex-1')
  })

  it('keeps document identity and status inside compact wrapping chrome', () => {
    render(
      <DocumentToolbar aria-label="Document actions">
        <DocumentIdentity
          title="styles.css"
          stateLabel="Modified"
          stateChanged
          status="No problems"
        />
        <button>Save</button>
      </DocumentToolbar>
    )

    expect(screen.getByRole('toolbar', { name: 'Document actions' })).toHaveClass('min-h-10')
    expect(screen.getByText('styles.css')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No problems')
    expect(screen.getByText('Modified')).toHaveClass('text-[var(--color-accent)]')
    expect(screen.getByText('Modified')).toHaveAttribute('aria-live', 'polite')
  })

  it('leaves static context out of the live region', () => {
    render(<DocumentIdentity title="notes.md" status="~/notes.md" statusLive={false} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('~/notes.md')).toBeInTheDocument()
  })
})
