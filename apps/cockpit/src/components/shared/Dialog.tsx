import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { XIcon } from '@phosphor-icons/react'

type DialogProps = {
  title: ReactNode
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
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
        className="fixed inset-0 z-50"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-shadow) 50%, transparent)' }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`animate-fade-in fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg outline-none ${className}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2
            id={titleId}
            className={`font-mono text-sm text-[var(--color-text)] ${titleClassName}`}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
