import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The drag gesture behind the shell's two resizable edges (sidebar, notes drawer).
 *
 * Both edges used to run their own copy of a `mousemove`/`mouseup` pair on `document`, which
 * ends badly the moment the pointer leaves the window: releasing the button over another
 * application delivers no `mouseup` here, so the listeners, the resizing flag, and the body
 * cursor/selection overrides all survive until the user comes back and clicks again. This uses
 * pointer events with pointer capture — the capture keeps events flowing to the handle while the
 * pointer is outside the window — and ends the gesture on pointer-up, pointer-cancel, window
 * blur, or unmount. Body styles are snapshotted and restored rather than cleared, so a gesture
 * cannot erase a cursor override that something else set.
 */
export type EdgeResizeOptions = {
  /** `1` when the handle sits on the element's right edge, `-1` when it sits on the left. */
  direction: 1 | -1
  /** Width the gesture starts from, read at pointer-down. */
  getWidth: () => number
  clamp: (width: number) => number
  /** Called with the clamped width on every move. */
  onResize: (width: number) => void
  /** Called once with the final width when the gesture ends, however it ends. */
  onCommit: (width: number) => void
}

type Gesture = {
  pointerId: number
  startX: number
  startWidth: number
  width: number
  target: Element
}

export function useEdgeResize(options: EdgeResizeOptions): {
  resizing: boolean
  onPointerDown: (event: React.PointerEvent) => void
} {
  const [resizing, setResizing] = useState(false)
  const gestureRef = useRef<Gesture | null>(null)
  const bodyStyleRef = useRef<{ cursor: string; userSelect: string } | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const restoreBodyStyles = useCallback(() => {
    const previous = bodyStyleRef.current
    if (!previous) return
    bodyStyleRef.current = null
    document.body.style.cursor = previous.cursor
    document.body.style.userSelect = previous.userSelect
  }, [])

  const end = useCallback(
    (commit: boolean) => {
      const gesture = gestureRef.current
      gestureRef.current = null
      restoreBodyStyles()
      setResizing(false)
      if (!gesture) return
      if (gesture.target.hasPointerCapture?.(gesture.pointerId)) {
        gesture.target.releasePointerCapture(gesture.pointerId)
      }
      // The width on screen is the width the user chose, even when the gesture was interrupted
      // rather than released — so an interrupted drag still persists what it left behind.
      if (commit) optionsRef.current.onCommit(gesture.width)
    },
    [restoreBodyStyles]
  )

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture?.(event.pointerId)
    const startWidth = optionsRef.current.getWidth()
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      width: startWidth,
      target,
    }
    bodyStyleRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    setResizing(true)
  }, [])

  useEffect(() => {
    if (!resizing) return

    const move = (event: PointerEvent) => {
      const gesture = gestureRef.current
      if (!gesture || event.pointerId !== gesture.pointerId) return
      const { clamp, onResize, direction } = optionsRef.current
      const next = clamp(gesture.startWidth + direction * (event.clientX - gesture.startX))
      gesture.width = next
      onResize(next)
    }
    // Captured events still bubble to the document, so one listener pair covers both the captured
    // and the uncaptured case; `end` is idempotent, so a doubled release is harmless.
    const up = (event: PointerEvent) => {
      const gesture = gestureRef.current
      if (gesture && event.pointerId !== gesture.pointerId) return
      end(true)
    }
    const blur = () => end(true)

    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', blur)
    }
  }, [resizing, end])

  // Unmounting mid-drag must not leave the body locked. No commit here: the owning component is
  // going away, and its own debounce is being torn down alongside it.
  useEffect(() => restoreBodyStyles, [restoreBodyStyles])

  return { resizing, onPointerDown }
}
