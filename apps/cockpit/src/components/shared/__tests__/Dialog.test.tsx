import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from '@/components/shared/Dialog'

afterEach(cleanup)

function DialogHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open && (
        <Dialog title="Example dialog" onClose={() => setOpen(false)}>
          <button type="button">First action</button>
          <button type="button">Second action</button>
        </Dialog>
      )}
    </>
  )
}

describe('Dialog', () => {
  it('renders an accessible modal dialog and restores focus on close', () => {
    render(<DialogHarness />)

    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Example dialog' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Example dialog' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('traps keyboard focus inside the dialog', () => {
    render(<DialogHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }))

    const dialog = screen.getByRole('dialog', { name: 'Example dialog' })
    const closeButton = screen.getByRole('button', { name: 'Close dialog' })
    const secondAction = screen.getByRole('button', { name: 'Second action' })

    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(secondAction).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(closeButton).toHaveFocus()
  })

  it('supports backdrop close', () => {
    const onClose = vi.fn()

    render(
      <Dialog title="Backdrop dialog" onClose={onClose}>
        Content
      </Dialog>
    )

    fireEvent.click(screen.getByRole('presentation'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Every caller used to supply its own width, and nine different expressions had accumulated —
  // four of them fixed pixel widths that overflowed a narrow window.
  describe('width', () => {
    const widthOf = (el: Element) => Array.from(el.classList).find((c) => c.startsWith('w-['))

    it('is responsive by default, without the caller asking', () => {
      render(
        <Dialog title="Default" onClose={vi.fn()}>
          Content
        </Dialog>
      )
      expect(widthOf(screen.getByRole('dialog'))).toBe('w-[min(26rem,calc(100vw-2rem))]')
    })

    it.each(['sm', 'md', 'lg', 'xl'] as const)('subtracts the same gutter at size %s', (size) => {
      render(
        <Dialog title={`Size ${size}`} onClose={vi.fn()} size={size}>
          Content
        </Dialog>
      )
      expect(widthOf(screen.getByRole('dialog'))).toMatch(
        /^w-\[min\(\d+rem,calc\(100vw-2rem\)\)\]$/
      )
    })

    it('sets no width at size none, for dialogs that size themselves in both axes', () => {
      render(
        <Dialog title="Self-sizing" onClose={vi.fn()} size="none" className="h-[90vh] w-[80rem]">
          Content
        </Dialog>
      )
      expect(widthOf(screen.getByRole('dialog'))).toBe('w-[80rem]')
    })
  })
})
