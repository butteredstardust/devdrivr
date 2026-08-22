import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Popover } from '@/components/shared/Popover'

afterEach(cleanup)

function PopoverHarness({ align }: { align?: 'start' | 'end' } = {}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button">Outside</button>
      <Popover
        open={open}
        onOpenChange={setOpen}
        label="Example popover"
        {...(align ? { align } : {})}
        trigger={(props) => (
          <button type="button" {...props}>
            Open popover
          </button>
        )}
      >
        <button type="button">First action</button>
        <button type="button">Second action</button>
      </Popover>
    </>
  )
}

describe('Popover', () => {
  it('wires the trigger to the surface and returns focus when it closes', () => {
    render(<PopoverHarness />)

    const trigger = screen.getByRole('button', { name: 'Open popover' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    // No dangling reference while the surface is unrendered.
    expect(trigger).not.toHaveAttribute('aria-controls')

    trigger.focus()
    fireEvent.click(trigger)

    const surface = screen.getByRole('dialog', { name: 'Example popover' })
    expect(trigger).toHaveAttribute('aria-controls', surface.id)
    expect(surface).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('never mounts the surface before it has been positioned', () => {
    // Regression: the surface used to render for one commit with `visibility: hidden` while it
    // waited for a position. A hidden element cannot be focused, so the focus call was a silent
    // no-op and the whole keyboard path — Tab into the surface, Escape back to the trigger —
    // was dead in the browser. jsdom does not implement that restriction and had happily
    // reported the surface as focused, so the assertion below is on the *cause* instead.
    render(<PopoverHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open popover' }))

    const surface = screen.getByRole('dialog')
    expect(surface.style.visibility).toBe('')
    expect(surface.style.top).not.toBe('')
  })

  it('renders into the document body so it cannot be clipped by the toolbar', () => {
    render(<PopoverHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open popover' }))

    const surface = screen.getByRole('dialog')
    expect(surface.parentElement).toBe(document.body)
    expect(surface.className).toContain('z-[var(--z-popover)]')
  })

  it('closes on a click outside but lets the trigger toggle itself', () => {
    render(<PopoverHarness />)
    const trigger = screen.getByRole('button', { name: 'Open popover' })

    fireEvent.click(trigger)
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // A mousedown on the trigger must not close the surface out from under the click
    // that follows, or the trigger would reopen what it just closed and never toggle off.
    fireEvent.click(trigger)
    fireEvent.mouseDown(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps Tab inside the surface', () => {
    render(<PopoverHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open popover' }))

    const surface = screen.getByRole('dialog')
    const first = screen.getByRole('button', { name: 'First action' })
    const last = screen.getByRole('button', { name: 'Second action' })

    last.focus()
    fireEvent.keyDown(surface, { key: 'Tab' })
    expect(first).toHaveFocus()

    fireEvent.keyDown(surface, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })

  it('anchors to the trailing edge of the trigger, and to the leading edge on request', () => {
    // jsdom gives every rect zeros, so the assertion is which axis was written, not the
    // value — that is the part that decides whether the surface grows away from the
    // viewport edge or into it.
    render(<PopoverHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open popover' }))
    expect(screen.getByRole('dialog').style.right).not.toBe('')
    expect(screen.getByRole('dialog').style.left).toBe('')

    cleanup()

    render(<PopoverHarness align="start" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open popover' }))
    expect(screen.getByRole('dialog').style.left).not.toBe('')
    expect(screen.getByRole('dialog').style.right).toBe('')
  })
})
