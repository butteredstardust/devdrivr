import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Toolbar } from '../Toolbar'

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
})
