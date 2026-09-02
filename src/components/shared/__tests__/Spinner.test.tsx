import { describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { Button } from '../Button'
import { Spinner, useDelayedLoading } from '../Spinner'

describe('Spinner', () => {
  it('renders a status role with an accessible label', () => {
    render(<Spinner />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })

  it('supports a custom label', () => {
    render(<Spinner label="Formatting" />)
    expect(screen.getByRole('status', { name: 'Formatting' })).toBeInTheDocument()
  })

  it('applies size classes', () => {
    render(<Spinner size="md" />)
    expect(screen.getByRole('status').className).toContain('h-4 w-4')
  })

  it('uses the animate-spin class so it degrades under prefers-reduced-motion', () => {
    // The global `.animate-spin` override in src/index.css handles the reduced-motion
    // degradation (static ring instead of vanishing) — this just asserts the hook-in point.
    render(<Spinner />)
    expect(screen.getByRole('status').className).toContain('animate-spin')
  })
})

describe('Button loading state (via Spinner)', () => {
  it('still renders the shared Spinner when loading', () => {
    // The spinner sits inside an aria-hidden wrapper (the button itself carries
    // aria-busy for assistive tech), so query the DOM directly rather than by role.
    const { container } = render(<Button loading>Save</Button>)
    const spinner = container.querySelector('[role="status"][aria-label="Loading"]')
    expect(spinner).not.toBeNull()
    expect(spinner?.className).toContain('animate-spin')
  })
})

describe('useDelayedLoading', () => {
  it('does not report active until the delay elapses', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ active }) => useDelayedLoading(active, 150), {
      initialProps: { active: false },
    })
    expect(result.current).toBe(false)

    rerender({ active: true })
    expect(result.current).toBe(false)

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe(false)

    act(() => {
      vi.advanceTimersByTime(60)
    })
    expect(result.current).toBe(true)

    vi.useRealTimers()
  })

  it('never flags a fast operation that finishes before the delay', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ active }) => useDelayedLoading(active, 150), {
      initialProps: { active: false },
    })

    rerender({ active: true })
    act(() => {
      vi.advanceTimersByTime(50)
    })
    rerender({ active: false })
    expect(result.current).toBe(false)

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe(false)

    vi.useRealTimers()
  })
})
