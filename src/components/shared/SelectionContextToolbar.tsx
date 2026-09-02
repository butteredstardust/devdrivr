import { createPortal } from 'react-dom'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { useIsInstanceActive } from '@/app/tool-instance'
import { useUiStore } from '@/stores/ui.store'

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
  const isInstanceActive = useIsInstanceActive()
  const setLastAction = useUiStore((s) => s.setLastAction)
  // Clamping the anchor is not the same as clamping what the user sees: the toolbar is translated
  // half its width left and its whole height up, so near an edge it can still land off-screen.
  // Its measured size is what the placement below is actually built from.
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = toolbarRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    setSize((current) =>
      current.width === rect.width && current.height === rect.height
        ? current
        : { width: rect.width, height: rect.height }
    )
  }, [selection, actions])

  useEffect(() => {
    if (!selection) return

    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isInstanceActive) return
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
  }, [isInstanceActive, onDismiss, selection])

  if (!selection || actions.length === 0) return null

  const MARGIN = 8
  const GAP = 10
  const halfWidth = size.width / 2
  // A toolbar wider than the viewport has no valid centre; leave it centred rather than inverting
  // the clamp and pinning it to an edge it overflows anyway.
  const minCenter = MARGIN + halfWidth
  const maxCenter = window.innerWidth - MARGIN - halfWidth
  const anchorCenter = selection.rect.left + selection.rect.width / 2
  const left =
    minCenter > maxCenter ? window.innerWidth / 2 : clamp(anchorCenter, minCenter, maxCenter)

  // Below the selection when there isn't room above it — better to cover the text underneath than
  // to sit off the top of the window where it cannot be clicked at all.
  const fitsAbove = selection.rect.top - GAP - size.height >= MARGIN
  const top = fitsAbove
    ? selection.rect.top - GAP
    : Math.min(selection.rect.bottom + GAP + size.height, window.innerHeight - MARGIN)

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
      className="animate-fade-in-place fixed z-[var(--z-popover)] flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-1.5 py-1 shadow-lg"
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
          className="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          onClick={() => {
            // Dismiss on success only. A rejected clipboard write used to close the toolbar
            // silently, so the selection workflow vanished with no way to tell it had failed.
            Promise.resolve(action.onSelect(selection.text))
              .then(onDismiss)
              .catch(() => setLastAction(`${action.label} failed`, 'error'))
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
