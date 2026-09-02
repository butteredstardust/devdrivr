import { createContext, useContext, useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Measured width of the shell row (sidebar + workspace + notes drawer).
 *
 * `0` is the "not measured" sentinel every consumer must treat as "no layout pressure" — see
 * `fitShellPanels` in lib/shell-layout.ts. The panels each derive their own width from this rather
 * than being handed one, so the sidebar and the drawer cannot disagree about how much room there
 * is: same input, same pure function, same answer.
 */
export const ShellWidthContext = createContext(0)

export function useShellWidth(): number {
  return useContext(ShellWidthContext)
}

/** Observed content-box width of `ref`, or `0` until the first observation lands. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    // jsdom has no ResizeObserver — the shell stays unmeasured there, which is what tests want.
    if (!el || typeof ResizeObserver === 'undefined') return
    setWidth(el.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return width
}
