import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@/components/shared/StatusBadge'

describe('StatusBadge', () => {
  it('uses the requested semantic token treatment', () => {
    render(<StatusBadge variant="success">Ready</StatusBadge>)
    const badge = screen.getByText('Ready')
    expect(badge.className).toContain('bg-[var(--color-success)]/15')
    expect(badge.className).toContain('text-[var(--color-success)]')
  })
})
