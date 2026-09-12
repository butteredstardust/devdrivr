import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Input } from '../Input'
import { ControlLabelProvider } from '@/components/shared/ControlLabel'

describe('Input', () => {
  it('reports value changes', () => {
    const onChange = vi.fn()
    render(<Input aria-label="Name" value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'x' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('preserves native typing through focused rerenders and syncs external changes on blur', () => {
    const { rerender } = render(<Input aria-label="Name" value="start" onChange={() => {}} />)
    const input = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'typed' } })

    rerender(<Input aria-label="Name" value="reset" onChange={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'Name' })).toBe(input)
    expect(input.value).toBe('typed')

    fireEvent.blur(input)
    expect(input.value).toBe('reset')
  })

  it('uses row label and hint ids unless explicit aria attributes override them', () => {
    const { rerender } = render(
      <ControlLabelProvider id="row-label" descriptionId="row-hint">
        <Input type="number" value={1} onChange={() => {}} />
      </ControlLabelProvider>
    )
    const contextual = screen.getByRole('spinbutton')
    expect(contextual).toHaveAttribute('aria-labelledby', 'row-label')
    expect(contextual).toHaveAttribute('aria-describedby', 'row-hint')

    rerender(
      <ControlLabelProvider id="row-label" descriptionId="row-hint">
        <Input
          type="number"
          value={1}
          onChange={() => {}}
          aria-label="Explicit label"
          aria-describedby="explicit-hint"
        />
      </ControlLabelProvider>
    )
    const explicit = screen.getByRole('spinbutton', { name: 'Explicit label' })
    expect(explicit).not.toHaveAttribute('aria-labelledby')
    expect(explicit).toHaveAttribute('aria-describedby', 'explicit-hint')
  })

  it('keeps the always-visible click focus border alongside the keyboard focus-visible ring', () => {
    render(<Input aria-label="Search" value="" onChange={() => {}} />)
    const input = screen.getByRole('textbox', { name: 'Search' })
    // The click-visible accent border must survive — text inputs need it whether
    // the field was focused by mouse or keyboard.
    expect(input.className).toContain('focus:border-[var(--color-accent)]')
    // The keyboard-only ring must be drawn from the shared --focus-ring token.
    expect(input.className).toContain('focus-visible:shadow-[var(--focus-ring)]')
  })
})
