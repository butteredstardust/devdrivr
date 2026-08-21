import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { XIcon } from '@phosphor-icons/react'

/**
 * The dialog width scale.
 *
 * `Dialog` used to have no width of its own, so all eighteen callers supplied one and drifted into
 * nine different expressions — `w-[340px]`, `w-[400px]`, `w-[420px]`, `w-full max-w-[560px]`, and
 * three different values of the `w-[min(Xrem,…)]` idiom. The four hardcoded pixel widths were not
 * responsive at all and overflowed a narrow window.
 *
 * Every step subtracts the same 2rem gutter, so no size can exceed the viewport. `none` is for the
 * two dialogs that size against the viewport in both axes and manage it themselves.
 */
const SIZE_CLASSES = {
  sm: 'w-[min(26rem,calc(100vw-2rem))]',
  md: 'w-[min(30rem,calc(100vw-2rem))]',
  lg: 'w-[min(35rem,calc(100vw-2rem))]',
  xl: 'w-[min(42rem,calc(100vw-2rem))]',
  none: '',
} as const

type DialogSize = keyof typeof SIZE_CLASSES

type DialogProps = {
  title: ReactNode
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
  /** Width step. Use `none` only when the dialog sizes itself in both axes. */
  size?: DialogSize
  /**
   * Extra classes. Do **not** set a width here unless `size="none"` — two arbitrary width
   * utilities have equal specificity, so which one wins is stylesheet generation order rather than
   * the order they appear in this string.
   */
  className?: string
  bodyClassName?: string
  titleClassName?: string
  closeLabel?: string
  initialFocusRef?: RefObject<HTMLElement | null>
  onOpenAutoFocus?: (target: HTMLElement) => void
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    return el.tabIndex >= 0 && el.getAttribute('aria-hidden') !== 'true'
  })
}

export function Dialog({
  title,
  children,
  onClose,
  footer,
  size = 'sm',
  className = '',
  bodyClassName = 'p-4',
  titleClassName = '',
  closeLabel = 'Close dialog',
  initialFocusRef,
  onOpenAutoFocus,
}: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const previousFocus =
      document.activeElement instanceof window.HTMLElement ? document.activeElement : null
    const focusTarget = initialFocusRef?.current ?? getFocusableElements(panel)[0] ?? panel

    focusTarget.focus()
    onOpenAutoFocus?.(focusTarget)

    return () => {
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus()
      }
    }
  }, [initialFocusRef, onOpenAutoFocus])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }

    if (e.key !== 'Tab') return

    const panel = panelRef.current
    if (!panel) return

    const focusable = getFocusableElements(panel)
    if (focusable.length === 0) {
      e.preventDefault()
      panel.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (e.shiftKey && (!active || active === first || !panel.contains(active))) {
      e.preventDefault()
      last?.focus()
      return
    }

    if (!e.shiftKey && active === last) {
      e.preventDefault()
      first?.focus()
    }
  }

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-[var(--z-scrim)]"
        style={{ backgroundColor: 'var(--color-scrim)' }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`animate-fade-in fixed left-1/2 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg outline-none ${SIZE_CLASSES[size]} ${className}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 id={titleId} className={`font-ui text-sm text-[var(--color-text)] ${titleClassName}`}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>
        <div className={`font-ui min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
        {footer && (
          <div className="font-ui flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
