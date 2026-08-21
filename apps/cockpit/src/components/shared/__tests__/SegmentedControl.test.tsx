import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SegmentedControl } from '../SegmentedControl'

const OPTIONS = [
  { value: 'match', label: 'Match' },
  { value: 'replace', label: 'Replace' },
  { value: 'extra', label: 'Extra' },
] as const

function Harness() {
  const [value, setValue] = useState<'match' | 'replace' | 'extra'>('match')
  return (
    <SegmentedControl
      aria-label="Regex mode"
      options={[...OPTIONS]}
      value={value}
      onChange={setValue}
    />
  )
}

describe('SegmentedControl', () => {
  it('exposes a radiogroup with a radio per option', () => {
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Regex mode' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('marks the selected option as checked and others as unchecked', () => {
    render(<Harness />)
    expect(screen.getByRole('radio', { name: 'Match' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Replace' })).toHaveAttribute('aria-checked', 'false')
  })

  it('selects an option on click', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: 'Replace' }))
    expect(screen.getByRole('radio', { name: 'Replace' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Match' })).toHaveAttribute('aria-checked', 'false')
  })

  it('moves selection and focus with ArrowRight/ArrowLeft', () => {
    render(<Harness />)
    const match = screen.getByRole('radio', { name: 'Match' })
    match.focus()
    fireEvent.keyDown(match, { key: 'ArrowRight' })
    const replace = screen.getByRole('radio', { name: 'Replace' })
    expect(replace).toHaveAttribute('aria-checked', 'true')
    expect(document.activeElement).toBe(replace)

    fireEvent.keyDown(replace, { key: 'ArrowLeft' })
    expect(screen.getByRole('radio', { name: 'Match' })).toHaveAttribute('aria-checked', 'true')
  })

  it('wraps around with ArrowRight past the last option', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: 'Extra' }))
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Extra' }), { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'Match' })).toHaveAttribute('aria-checked', 'true')
  })

  it('jumps to first/last with Home/End', () => {
    render(<Harness />)
    const match = screen.getByRole('radio', { name: 'Match' })
    fireEvent.keyDown(match, { key: 'End' })
    expect(screen.getByRole('radio', { name: 'Extra' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Extra' }), { key: 'Home' })
    expect(screen.getByRole('radio', { name: 'Match' })).toHaveAttribute('aria-checked', 'true')
  })

  it('uses roving tabindex — only the selected segment is tab-reachable', () => {
    render(<Harness />)
    expect(screen.getByRole('radio', { name: 'Match' })).toHaveAttribute('tabIndex', '0')
    expect(screen.getByRole('radio', { name: 'Replace' })).toHaveAttribute('tabIndex', '-1')
    expect(screen.getByRole('radio', { name: 'Extra' })).toHaveAttribute('tabIndex', '-1')
  })

  // A view mode is state, not the thing to press. A solid accent fill made the selected segment
  // as loud as a primary button, so JSON Tools' toolbar showed "Format" and "Source" competing
  // for the same emphasis with nothing to distinguish action from state.
  it('marks the selected segment with an accent tint, not a solid accent fill', () => {
    render(<Harness />)
    const selected = screen.getByRole('radio', { name: 'Match' })

    expect(selected.className).toContain('bg-[var(--color-accent-dim)]')
    expect(selected.className).not.toContain('bg-[var(--color-accent)]')
  })
})
