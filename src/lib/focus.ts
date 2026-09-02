/**
 * Focusable-element discovery, shared by every surface that has to keep Tab inside itself.
 *
 * `Dialog` owned this privately until `Popover` needed the same answer. Two copies of a
 * selector list is how the two surfaces end up disagreeing about whether a `[tabindex="-1"]`
 * element is reachable, which is the kind of difference nobody notices until a keyboard user
 * falls out of one of them.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    return el.tabIndex >= 0 && el.getAttribute('aria-hidden') !== 'true'
  })
}

/**
 * Tab / Shift-Tab cycling within `container`. Returns true when the event was handled, so the
 * caller can decide whether to `preventDefault` on its own terms.
 */
export function cycleFocus(
  container: HTMLElement,
  { shiftKey }: { shiftKey: boolean }
): 'wrapped' | 'passed' {
  const focusable = getFocusableElements(container)
  if (focusable.length === 0) {
    container.focus()
    return 'wrapped'
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement

  if (shiftKey && (!active || active === first || !container.contains(active))) {
    last?.focus()
    return 'wrapped'
  }

  if (!shiftKey && active === last) {
    first?.focus()
    return 'wrapped'
  }

  return 'passed'
}
