import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CopyButton } from '../CopyButton'

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

describe('CopyButton', () => {
  it('renders the provided label', () => {
    render(<CopyButton text="hello" label="Copy value" />)
    expect(screen.getByRole('button', { name: 'Copy value' })).toBeInTheDocument()
  })

  it('draws a focus-visible ring from the --focus-ring token', () => {
    render(<CopyButton text="hello" />)
    expect(screen.getByRole('button', { name: 'Copy' }).className).toContain(
      'focus-visible:shadow-[var(--focus-ring)]'
    )
  })

  it('uses the shared secondary button treatment', () => {
    render(<CopyButton text="hello" />)
    expect(screen.getByRole('button', { name: 'Copy' }).className).toContain(
      'border-[var(--color-border)]'
    )
  })
})
