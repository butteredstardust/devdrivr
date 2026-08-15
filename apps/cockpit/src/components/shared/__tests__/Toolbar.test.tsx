import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Toolbar, ToolbarGroup, ToolbarSpacer } from '@/components/shared/Toolbar'

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
})
