import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
