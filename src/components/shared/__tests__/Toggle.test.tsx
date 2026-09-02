import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Toggle } from '../Toggle'

describe('Toggle', () => {
  it('renders as a switch and reports state changes', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} label="Always on top" />)
    const toggle = screen.getByRole('switch', { name: 'Always on top' })
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('reflects the checked state via aria-checked', () => {
    render(<Toggle checked onChange={() => {}} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('draws a focus-visible ring from the --focus-ring token', () => {
    render(<Toggle checked={false} onChange={() => {}} />)
    expect(screen.getByRole('switch').className).toContain(
      'focus-visible:shadow-[var(--focus-ring)]'
    )
  })
})
