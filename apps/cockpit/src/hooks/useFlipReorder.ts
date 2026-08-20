import { useCallback, useLayoutEffect, useRef } from 'react'

const DURATION_MS = 180

/**
 * Animates a horizontal list between orderings, FLIP-style.
 *
 * Registered elements are measured after every commit. When one has moved, it
 * is snapped back to where it was with a transform and then released, so the
 * browser animates the gap rather than the layout — no reflow per frame, and
 * no need to know the widths in advance.
 *
 * Driven by measured position rather than by the drag, so it covers every way
 * the order can change (drop, pin, unpin, closing a tab that shifts the rest),
 * not just the one the user's finger is on.
 *
 * Reduced motion needs no branch here: `index.css` clamps every transition
 * duration to 0.01ms with `!important` under `prefers-reduced-motion`, which
 * beats the inline duration set below, so the elements simply appear in place.
 */
export function useFlipReorder(key: string): (id: string, node: HTMLElement | null) => void {
  const nodes = useRef(new Map<string, HTMLElement>())
  const prevLefts = useRef(new Map<string, number>())

  const register = useCallback((id: string, node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node)
    else nodes.current.delete(id)
  }, [])

  useLayoutEffect(() => {
    const previous = prevLefts.current
    const current = new Map<string, number>()

    for (const [id, node] of nodes.current) {
      const left = node.getBoundingClientRect().left
      current.set(id, left)

      const before = previous.get(id)
      // No previous position means the element just mounted; it has nothing to
      // travel from, and animating it from 0 would fly it in from the far left.
      if (before === undefined) continue
      const delta = before - left
      if (Math.abs(delta) < 1) continue

      node.style.transition = 'none'
      node.style.transform = `translateX(${delta}px)`
      // Two frames: the first lets the browser take the snapped-back position
      // as the starting style, the second starts the transition from it. With
      // only one, the style recalc can coalesce both writes and nothing moves.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          node.style.transition = `transform ${DURATION_MS}ms ease`
          node.style.transform = ''
        })
      })
    }

    prevLefts.current = current
  }, [key])

  return register
}
