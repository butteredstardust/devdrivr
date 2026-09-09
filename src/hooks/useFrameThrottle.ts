import { useCallback, useEffect, useRef } from 'react'

/**
 * Coalesces a high-frequency callback down to one call per animation frame.
 *
 * WARNING: only the newest arguments survive a frame. Use this for a value each later event
 * replaces outright — a pointer position, a pane width. Never use it for events that must all
 * be delivered.
 *
 * A pointer delivers several moves per frame on a high-polling-rate mouse, and each extra call
 * costs a React render whose result is overwritten before it paints. Running inside the frame
 * also puts every layout read after the previous write, instead of forcing a reflow between them.
 *
 * `run` schedules. `flush` runs a pending call at once, so the last position of a gesture still
 * lands on pointer-up. `cancel` drops it. All three are stable across renders, and a pending call
 * is dropped on unmount.
 */
export function useFrameThrottle<A extends unknown[]>(
  callback: (...args: A) => void
): {
  run: (...args: A) => void
  flush: () => void
  cancel: () => void
} {
  // Read the newest callback at call time. Capturing it would make `run` change identity on
  // every render, which re-subscribes the very listeners this hook exists to keep cheap.
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const frameRef = useRef<number | null>(null)
  const argsRef = useRef<A | null>(null)

  const cancel = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    argsRef.current = null
  }, [])

  const flush = useCallback(() => {
    const args = argsRef.current
    cancel()
    if (args) callbackRef.current(...args)
  }, [cancel])

  const run = useCallback((...args: A) => {
    argsRef.current = args
    // jsdom and any non-browser host lack rAF. Falling back to a direct call keeps the
    // behaviour correct there; only the coalescing is lost.
    if (typeof requestAnimationFrame !== 'function') {
      argsRef.current = null
      callbackRef.current(...args)
      return
    }
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      const pending = argsRef.current
      argsRef.current = null
      if (pending) callbackRef.current(...pending)
    })
  }, [])

  useEffect(() => cancel, [cancel])

  return { run, flush, cancel }
}
