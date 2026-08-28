import { useCallback, useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import { cycleFocus, getFocusableElements } from '@/lib/focus'

/**
 * The focus lifecycle every modal surface owes its keyboard users: move focus in on open, keep Tab
 * inside, close on Escape, and hand focus back to whatever had it before.
 *
 * `Dialog` had this, and Prompt Templates' two modals each had their own retelling of it — with a
 * hand-written focusable selector that disagreed with `lib/focus`, a `disabled` filter that missed
 * `aria-hidden`, and a global `window` keydown listener where a panel-scoped one would do. Three
 * copies means an accessibility fix lands in one of them. This is the single copy; callers keep
 * their own markup and their own extra shortcuts.
 */
export type ModalFocusOptions = {
  onClose: () => void
  /** Explicit first focus target. Falls back to `initialFocusSelector`, then the first focusable. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Queried inside the panel when no `initialFocusRef` is given — e.g. the first form field. */
  initialFocusSelector?: string
  onOpenAutoFocus?: (target: HTMLElement) => void
  /**
   * When false the panel neither takes focus nor answers keys. Tool instances stay mounted while
   * hidden, and a background instance grabbing focus is how a modal nobody can see swallows the
   * keyboard.
   */
  enabled?: boolean
}

export type ModalFocus<T extends HTMLElement = HTMLDivElement> = {
  panelRef: RefObject<T | null>
  /** Attach to the panel. Handles Escape and Tab; leaves every other key to the caller. */
  onKeyDown: (event: KeyboardEvent<T>) => void
}

export function useModalFocus<T extends HTMLElement = HTMLDivElement>({
  onClose,
  initialFocusRef,
  initialFocusSelector,
  onOpenAutoFocus,
  enabled = true,
}: ModalFocusOptions): ModalFocus<T> {
  const panelRef = useRef<T | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onOpenAutoFocusRef = useRef(onOpenAutoFocus)
  onOpenAutoFocusRef.current = onOpenAutoFocus

  useEffect(() => {
    const panel = panelRef.current
    if (!enabled || !panel) return

    const previousFocus =
      document.activeElement instanceof window.HTMLElement ? document.activeElement : null
    const focusTarget =
      initialFocusRef?.current ??
      (initialFocusSelector ? panel.querySelector<HTMLElement>(initialFocusSelector) : null) ??
      getFocusableElements(panel)[0] ??
      panel

    focusTarget.focus()
    onOpenAutoFocusRef.current?.(focusTarget)

    return () => {
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus()
      }
    }
  }, [enabled, initialFocusRef, initialFocusSelector])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<T>) => {
      if (!enabled) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return

      if (cycleFocus(panel, { shiftKey: event.shiftKey }) === 'wrapped') {
        event.preventDefault()
      }
    },
    [enabled]
  )

  return { panelRef, onKeyDown }
}
