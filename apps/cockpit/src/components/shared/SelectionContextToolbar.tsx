import { createPortal } from 'react-dom'
import { useEffect, useRef, type KeyboardEvent, type ReactElement } from 'react'

export type SelectionToolbarState = {
  text: string
  rect: DOMRect
}

export type SelectionToolbarAction = {
  id: string
  label: string
  icon: ReactElement
  onSelect: (text: string) => void | Promise<void>
}

type SelectionContextToolbarProps = {
  selection: SelectionToolbarState | null
  actions: SelectionToolbarAction[]
  onDismiss: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

export function SelectionContextToolbar({
  selection,
  actions,
  onDismiss,
}: SelectionContextToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selection) return

    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
        return
      }

      if (event.key !== 'Tab') return
      const toolbar = toolbarRef.current
      if (!toolbar || toolbar.contains(document.activeElement)) return

      const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button'))
      const target = event.shiftKey ? buttons[buttons.length - 1] : buttons[0]
      if (!target) return

      event.preventDefault()
      target.focus()
    }

    document.addEventListener('keydown', handleGlobalKeyDown, true)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown, true)
  }, [onDismiss, selection])

  if (!selection || actions.length === 0) return null

  const left = clamp(selection.rect.left + selection.rect.width / 2, 24, window.innerWidth - 24)
  const top = clamp(selection.rect.top - 10, 40, window.innerHeight - 24)

  function handleToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onDismiss()
      return
    }

    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []
    )
    if (buttons.length === 0) return

    const current = document.activeElement
    const currentIndex = current instanceof window.HTMLButtonElement ? buttons.indexOf(current) : -1
    let nextIndex = currentIndex

    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = buttons.length - 1
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttons.length
    if (event.key === 'ArrowLeft') {
      nextIndex =
        currentIndex === -1
          ? buttons.length - 1
          : (currentIndex - 1 + buttons.length) % buttons.length
    }

    event.preventDefault()
    buttons[nextIndex]?.focus()
  }

  return createPortal(
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Selection actions"
      className="fixed z-[70] flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-1.5 py-1 shadow-lg"
      style={{ left, top }}
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={handleToolbarKeyDown}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          title={action.label}
          aria-label={action.label}
          className="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]"
          onClick={() => {
            Promise.resolve(action.onSelect(selection.text))
              .catch(() => {})
              .finally(onDismiss)
          }}
        >
          {action.icon}
          <span className="sr-only">{action.label}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}
