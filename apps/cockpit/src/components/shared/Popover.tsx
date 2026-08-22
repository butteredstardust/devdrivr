import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useIsInstanceActive } from '@/app/tool-instance'
import { cycleFocus } from '@/lib/focus'

/** Gap between the trigger and the surface, and the minimum inset from a viewport edge. */
const GAP = 6
const EDGE = 8
/** Floor for the computed max-height, so a cramped window scrolls rather than collapses. */
const MIN_HEIGHT = 120

export type PopoverAlign = 'start' | 'end'

export type PopoverTriggerProps = {
  ref: (node: HTMLButtonElement | null) => void
  onClick: () => void
  'aria-expanded': boolean
  'aria-haspopup': 'dialog'
  'aria-controls'?: string
}

type PopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible name of the surface. Announced when focus lands in it. */
  label: string
  /**
   * The trigger, given the props that make it one. It is a render prop rather than a node
   * because `aria-expanded`, `aria-controls` and the ref that anchors the surface all have to
   * land on the same element, and every hand-rolled menu in this app has forgotten at least one
   * of the three.
   */
  trigger: (props: PopoverTriggerProps) => ReactNode
  children: ReactNode
  /** Which edge of the trigger the surface lines up with. `end` (right) suits toolbar tails. */
  align?: PopoverAlign
  className?: string
}

/**
 * A dismissible surface anchored to its trigger.
 *
 * The app had five of these written by hand — two in the tab strip, three in Markdown Editor —
 * and no two agreed on the contract. Between them they managed: no Escape handling at all, a raw
 * `z-20` that put a menu underneath every other popover, coordinate clamping in one direction
 * only, and three duplicated `mousedown` effects in a single file. None returned focus to the
 * trigger.
 *
 * Positioning is measurement-free on purpose. Anchoring by the *trailing* edge
 * (`right: viewportWidth - triggerRight`) means the surface can grow leftwards without ever
 * being measured, so there is no first paint at the wrong coordinates and nothing to correct on
 * a second pass. Vertically it takes what room is left below the trigger as `max-height` and
 * scrolls, which is why there is no flip-above logic: a toolbar popover opens near the top of
 * the window, where flipping would trade a scrollbar for a surface over the thing it configures.
 */
export function Popover({
  open,
  onOpenChange,
  label,
  trigger,
  children,
  align = 'end',
  className = '',
}: PopoverProps) {
  const surfaceId = useId()
  const isInstanceActive = useIsInstanceActive()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<CSSProperties | null>(null)

  const setTriggerRef = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node
  }, [])

  // Focus on mount rather than in an effect keyed on `open`. The surface is not in the DOM until
  // a position exists, so an effect that fires when `open` flips would be aiming at nothing —
  // and an unpositioned surface rendered `visibility: hidden` to hide the flash cannot take
  // focus at all, which is a silent no-op rather than an error. Mounting already positioned
  // removes both problems, and a ref callback focuses exactly once per open for free.
  const setSurfaceRef = useCallback((node: HTMLDivElement | null) => {
    surfaceRef.current = node
    node?.focus()
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }

    function reposition() {
      const anchor = triggerRef.current
      if (!anchor) return

      const rect = anchor.getBoundingClientRect()
      let top = rect.bottom + GAP
      let maxHeight = window.innerHeight - top - EDGE

      if (maxHeight < MIN_HEIGHT) {
        // Too little room below to be usable. Lift the surface until its floor is back on
        // screen rather than letting the bottom overhang: a `fixed` surface cannot be scrolled
        // to, so anything past the viewport edge — the footer, and a reset action with it — is
        // not merely clipped but unreachable. Overlapping the trigger is the lesser harm.
        maxHeight = Math.min(MIN_HEIGHT, window.innerHeight - EDGE * 2)
        top = Math.max(EDGE, window.innerHeight - EDGE - maxHeight)
      }

      const next: CSSProperties = { top, maxHeight }

      if (align === 'end') {
        next.right = Math.max(EDGE, window.innerWidth - rect.right)
      } else {
        next.left = Math.max(EDGE, rect.left)
      }

      // Scroll fires on capture for every scrollable container in the app, including this
      // surface's own list, so an unconditional set would re-render the popover on each tick
      // of a scroll that never moved it.
      setPosition((prev) =>
        prev &&
        prev.top === next.top &&
        prev.maxHeight === next.maxHeight &&
        prev.right === next.right &&
        prev.left === next.left
          ? prev
          : next
      )
    }

    reposition()
    window.addEventListener('resize', reposition)
    // Capture phase: the workspace scrolls its own containers, and a scroll event on one of
    // those does not bubble to window.
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, align])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(e: MouseEvent) {
      if (!isInstanceActive) return
      const target = e.target as Node
      if (surfaceRef.current?.contains(target)) return
      // The trigger is excluded so a click on it toggles once, rather than closing here and
      // reopening in the click handler a moment later.
      if (triggerRef.current?.contains(target)) return
      onOpenChange(false)
    }

    function handleEscape(e: globalThis.KeyboardEvent) {
      if (!isInstanceActive) return
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onOpenChange(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape, true)
    }
  }, [open, isInstanceActive, onOpenChange])

  useEffect(() => {
    if (!open) return

    return () => {
      // Only reclaim focus if the surface still had it. Once the surface unmounts the browser
      // parks focus on <body>, so that is what "the user did not click anything else" looks
      // like; if they did click something, focus is already on it and stealing it back is
      // hostile.
      if (document.activeElement === document.body) {
        triggerRef.current?.focus()
      }
    }
  }, [open])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const surface = surfaceRef.current
    if (!surface) return
    if (cycleFocus(surface, { shiftKey: e.shiftKey }) === 'wrapped') {
      e.preventDefault()
    }
  }

  return (
    <>
      {trigger({
        ref: setTriggerRef,
        onClick: () => onOpenChange(!open),
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        // Only advertise the relationship while the surface exists in the DOM: an
        // `aria-controls` pointing at an unrendered id sends the user's cursor nowhere.
        ...(open ? { 'aria-controls': surfaceId } : {}),
      })}
      {open &&
        position &&
        createPortal(
          <div
            ref={setSurfaceRef}
            id={surfaceId}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            style={position}
            className={`animate-fade-in fixed z-[var(--z-popover)] flex max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg outline-none ${className}`}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}
