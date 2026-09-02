import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '../Button'

describe('Button', () => {
  it('renders children and responds to click', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies danger and icon variant classes', () => {
    const { rerender } = render(<Button variant="danger">Delete</Button>)
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain(
      'text-[var(--color-error)]'
    )
    rerender(
      <Button variant="icon" size="sm" aria-label="Close">
        x
      </Button>
    )
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('p-1.5')
  })

  it('supports the xs size', () => {
    render(<Button size="xs">Tiny</Button>)
    expect(screen.getByRole('button', { name: 'Tiny' }).className).toContain('px-1.5')
  })

  it('sets aria-busy and disables interaction while loading, without changing width', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Submit</Button>)
    const idleButton = screen.getByRole('button', { name: 'Submit' })
    const idleWidthClasses = idleButton.className

    rerender(
      <Button loading onClick={onClick}>
        Submit
      </Button>
    )
    const loadingButton = screen.getByRole('button', { name: 'Submit' })
    expect(loadingButton).toHaveAttribute('aria-busy', 'true')
    expect(loadingButton).toBeDisabled()
    // The label text stays in the DOM (just hidden via the `invisible` utility class)
    // so layout width is unaffected — Tailwind isn't compiled in tests, so assert the
    // class directly rather than relying on computed visibility.
    const label = screen.getByText('Submit')
    expect(label).toBeInTheDocument()
    expect(label.className).toContain('invisible')
    // Sizing/padding classes are identical between idle and loading states.
    expect(loadingButton.className.replace(/\s+/g, ' ')).toContain(
      idleWidthClasses
        .replace(/\s+/g, ' ')
        .split(' ')
        .find((c) => c.startsWith('px-')) ?? ''
    )

    fireEvent.click(loadingButton)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('keeps existing call sites working with default variant/size', () => {
    render(<Button>Default</Button>)
    const button = screen.getByRole('button', { name: 'Default' })
    expect(button.className).toContain('border-[var(--color-border)]')
    expect(button.className).toContain('px-4 py-2')
  })

  it('draws a focus-visible ring from the --focus-ring token', () => {
    render(<Button>Focusable</Button>)
    expect(screen.getByRole('button', { name: 'Focusable' }).className).toContain(
      'focus-visible:shadow-[var(--focus-ring)]'
    )
  })
})
