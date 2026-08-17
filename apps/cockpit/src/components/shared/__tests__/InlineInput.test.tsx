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
    for (const variant of ['title', 'heading', 'display', 'code', 'plain'] as const) {
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

  it('carries its own text size so no call site has to pass one', () => {
    // Typography is variant-only. A `text-*` passed through className ties on specificity
    // with the variant's own size and loses to whichever Tailwind emits later in the
    // stylesheet — which is how the note title silently rendered at text-sm after it was
    // migrated here with `className="w-full text-lg"`. Asserting the variant supplies the
    // size is what makes that reappear as a failure rather than as a screenshot nobody
    // compares.
    const sizes: Record<string, string> = {
      title: 'text-sm',
      heading: 'text-base',
      display: 'text-lg',
      code: 'text-sm',
      plain: 'text-xs',
    }
    for (const [variant, size] of Object.entries(sizes)) {
      const { unmount } = render(
        <InlineInput
          aria-label={variant}
          variant={variant as 'title' | 'heading' | 'display' | 'code' | 'plain'}
          readOnly
        />
      )
      expect(screen.getByRole('textbox', { name: variant }).className).toContain(size)
      unmount()
    }
  })

  it('lets call sites add layout classes without losing the base styling', () => {
    render(<InlineInput aria-label="Field" className="w-full truncate" readOnly />)
    const input = screen.getByRole('textbox')
    expect(input.className).toContain('w-full truncate')
    expect(input.className).toContain('bg-transparent')
  })
})
