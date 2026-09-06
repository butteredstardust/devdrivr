import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TextArea } from '@/components/shared/TextArea'

describe('TextArea', () => {
  it('provides the shared field and focus treatment', () => {
    render(<TextArea aria-label="Source" />)
    const input = screen.getByRole('textbox', { name: 'Source' })
    expect(input.className).toContain('border-[var(--color-border)]')
    expect(input.className).toContain('focus-visible:shadow-[var(--focus-ring)]')
  })

  it('supports code-oriented input', () => {
    render(<TextArea aria-label="Code" monospace />)
    expect(screen.getByRole('textbox', { name: 'Code' }).className).toContain('font-mono')
  })

  it('preserves native typing through focused rerenders and syncs external changes on blur', () => {
    const { rerender } = render(<TextArea aria-label="Source" value="start" onChange={() => {}} />)
    const textarea = screen.getByRole('textbox', { name: 'Source' }) as HTMLTextAreaElement
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'typed' } })

    rerender(<TextArea aria-label="Source" value="reset" onChange={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'Source' })).toBe(textarea)
    expect(textarea.value).toBe('typed')

    fireEvent.blur(textarea)
    expect(textarea.value).toBe('reset')
  })
})
