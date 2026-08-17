import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InlineInput } from '../InlineInput'

describe('InlineInput', () => {
  it('reports value changes', () => {
    const onChange = vi.fn()
    render(<InlineInput aria-label="Title" value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'x' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('always draws the keyboard focus ring', () => {
    // A borderless field has no other focus affordance, so every variant must
    // carry the ring — this is the regression the component was extracted to stop.
    for (const variant of ['title', 'heading', 'code'] as const) {
      const { unmount } = render(<InlineInput aria-label={variant} variant={variant} readOnly />)
      expect(screen.getByRole('textbox', { name: variant }).className).toContain(
        'focus-visible:shadow-[var(--focus-ring)]'
      )
      unmount()
    }
  })

  it('stays transparent so it reads as the text it edits', () => {
    render(<InlineInput aria-label="Name" readOnly />)
    expect(screen.getByRole('textbox', { name: 'Name' }).className).toContain('bg-transparent')
  })

  it('defaults to the title variant and applies per-variant typography', () => {
    const { rerender } = render(<InlineInput aria-label="Field" readOnly />)
    expect(screen.getByRole('textbox').className).toContain('font-semibold')

    rerender(<InlineInput aria-label="Field" variant="code" readOnly />)
    expect(screen.getByRole('textbox').className).toContain('font-mono')
  })

  it('lets call sites add layout classes without losing the base styling', () => {
    render(<InlineInput aria-label="Field" className="w-full truncate" readOnly />)
    const input = screen.getByRole('textbox')
    expect(input.className).toContain('w-full truncate')
    expect(input.className).toContain('bg-transparent')
  })
})
