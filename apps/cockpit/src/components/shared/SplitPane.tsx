import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

type SplitPaneProps = {
  /** Exactly two panes. A three-way split is a nested `SplitPane`, not a third child. */
  children: [ReactNode, ReactNode]
  direction?: 'horizontal' | 'vertical'
  /** First pane's share of the container, 0–1. Used when nothing is persisted. */
  defaultRatio?: number
  /**
   * Persists the ratio under `cockpit.split.<key>`. Omit for a split whose sizing shouldn't
   * outlive the view. Tools should pass one — re-dragging the same divider every session is
   * exactly the kind of small tax this app exists to remove.
   */
  storageKey?: string
  /** Smallest share either pane can be dragged to, 0–0.5. Keeps a pane from vanishing. */
  minRatio?: number
  /**
   * Viewport width (px) below which the panes stack and the divider disappears.
   *
   * Several tools already did this by hand with `max-[900px]:flex-col`, and without it here they
   * couldn't adopt `SplitPane` at all — a ratio applied as an inline `width` beats any Tailwind
   * breakpoint, so the responsive behaviour would silently stop working. Below the breakpoint
   * there's no useful ratio to drag anyway: the panes want the full width and share the height.
   */
  stackBelow?: number
  /** Keep both panes mounted while showing only the first. Useful for stateful editors. */
  firstVisible?: boolean
  /** Keep both panes mounted while showing only the second. Useful for stateful editors. */
  secondVisible?: boolean
  'aria-label'?: string
  className?: string
}

const STORAGE_PREFIX = 'cockpit.split.'

/** Matches the sidebar and notes-drawer settle delay, so every resize in the app
 *  persists on the same rhythm. */
const PERSIST_DELAY_MS = 500
const KEYBOARD_STEP = 0.02

/** `null` disables the query entirely, so `stackBelow` stays optional without a conditional hook. */
function useMediaQuery(query: string | null): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (!query) {
      setMatches(false)
      return
    }
    const list = window.matchMedia(query)
    setMatches(list.matches)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Keeps a pane from vanishing, and keeps a nonsense `minRatio` from inverting the clamp. */
function normalizeMinRatio(minRatio: number): number {
  if (!Number.isFinite(minRatio)) return 0.15
  return Math.min(0.49, Math.max(0, minRatio))
}

function clampRatio(value: number, minRatio: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1 - minRatio, Math.max(minRatio, value))
}

function readStoredRatio(storageKey: string | undefined, fallback: number): number {
  if (!storageKey) return fallback
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey)
    if (!raw) return fallback
    const parsed = Number.parseFloat(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    // Private mode / disabled storage — a split that can't remember still has to render.
    return fallback
  }
}

/**
 * Two panes with a draggable divider.
 *
 * Fifteen tools rendered a hard-coded 50/50 (`w-1/2` or `grid-cols-2`) before this existed. For
 * something like the diff viewer or a JSON tree next to its output, the two sides are rarely
 * equally dense, and a fixed split makes the app feel rigid in a way that's easy to stop noticing.
 *
 * The divider is a real `separator` with `aria-valuenow`, and resizes with arrow keys — a
 * mouse-only divider is a keyboard-first app quietly excluding its own users.
 */
export function SplitPane({
  children,
  direction = 'horizontal',
  defaultRatio = 0.5,
  storageKey,
  minRatio = 0.15,
  stackBelow,
  firstVisible = true,
  secondVisible = true,
  'aria-label': ariaLabel,
  className = '',
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const minimum = normalizeMinRatio(minRatio)
  // Clamped before the first render, not after the first drag: a storage value of `2` left over
  // from a bug or a hand-edited file would otherwise render the first pane at 200% and leave the
  // second one unreachable until someone found the divider.
  const [ratio, setRatio] = useState(() =>
    clampRatio(readStoredRatio(storageKey, clampRatio(defaultRatio, minimum)), minimum)
  )
  const [dragging, setDragging] = useState(false)
  const stacked = useMediaQuery(stackBelow ? `(max-width: ${stackBelow - 1}px)` : null)
  const isHorizontal = direction === 'horizontal' && !stacked
  const singlePane = !firstVisible || !secondVisible
  const labelId = useId()

  const clamp = useCallback((value: number) => clampRatio(value, minimum), [minimum])

  const persist = useCallback(
    (value: number) => {
      if (!storageKey) return
      try {
        window.localStorage.setItem(STORAGE_PREFIX + storageKey, value.toFixed(4))
      } catch {
        // Ratio still applies for this session; persistence is a nicety, not a requirement.
      }
    },
    [storageKey]
  )

  // localStorage is synchronous and serialises through the main thread, and a drag
  // commits on every mousemove — writing there per move puts a blocking disk-backed
  // call between the pointer and the next frame. The ratio the user ends on is the
  // only one worth remembering, so the write waits for the settle.
  const persistTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingRatio = useRef<number | null>(null)
  const persistSoon = useCallback(
    (value: number) => {
      pendingRatio.current = value
      clearTimeout(persistTimer.current)
      persistTimer.current = setTimeout(() => {
        pendingRatio.current = null
        persist(value)
      }, PERSIST_DELAY_MS)
    },
    [persist]
  )

  // Closing the tool inside the debounce window must not throw the drag away —
  // flush what is pending instead of cancelling it.
  const persistRef = useRef(persist)
  persistRef.current = persist
  useEffect(
    () => () => {
      clearTimeout(persistTimer.current)
      if (pendingRatio.current !== null) persistRef.current(pendingRatio.current)
    },
    []
  )

  const commit = useCallback(
    (next: number) => {
      const clamped = clamp(next)
      setRatio(clamped)
      persistSoon(clamped)
    },
    [clamp, persistSoon]
  )

  // Listeners go on window, not the divider: the pointer routinely outruns a 4px target mid-drag,
  // and a divider-scoped listener drops the drag the moment that happens.
  useEffect(() => {
    if (!dragging) return

    const handleMove = (event: PointerEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const size = isHorizontal ? rect.width : rect.height
      if (size === 0) return
      const offset = isHorizontal ? event.clientX - rect.left : event.clientY - rect.top
      commit(offset / size)
    }
    const handleUp = () => setDragging(false)

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    // A drag interrupted by the window losing focus never gets its pointer-up.
    window.addEventListener('blur', handleUp)
    // Text selection across both panes while dragging looks broken and blocks the cursor change.
    const previousSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'

    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
      window.removeEventListener('blur', handleUp)
      document.body.style.userSelect = previousSelect
      document.body.style.cursor = ''
    }
  }, [dragging, isHorizontal, commit])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const decrease = isHorizontal ? 'ArrowLeft' : 'ArrowUp'
      const increase = isHorizontal ? 'ArrowRight' : 'ArrowDown'
      if (event.key === decrease) {
        event.preventDefault()
        commit(ratio - KEYBOARD_STEP)
      } else if (event.key === increase) {
        event.preventDefault()
        commit(ratio + KEYBOARD_STEP)
      } else if (event.key === 'Home') {
        event.preventDefault()
        commit(minimum)
      } else if (event.key === 'End') {
        event.preventDefault()
        commit(1 - minimum)
      } else if (event.key === 'Enter') {
        // Reset — the cheapest way back from a split dragged somewhere useless.
        event.preventDefault()
        commit(clampRatio(defaultRatio, minimum))
      }
    },
    [commit, defaultRatio, isHorizontal, minimum, ratio]
  )

  const [first, second] = children
  const percent = `${(ratio * 100).toFixed(2)}%`

  // One JSX shape for both states, deliberately. Stacking used to be a second `return` with two
  // children instead of three, which moved `second` from index 2 to index 1 — React reconciles
  // positionally, so crossing the breakpoint unmounted that pane and mounted a fresh one. In a tool
  // whose pane holds a Monaco editor, that silently discards cursor, scroll and undo history every
  // time the window is dragged past the width. Stacked, the divider stays in the tree and degrades
  // to a plain rule: not focusable, not a `separator`, nothing to drag, but still child index 1.
  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 min-w-0 flex-1 ${isHorizontal ? 'flex-row' : 'flex-col'} ${className}`}
    >
      <div
        className={`min-h-0 min-w-0 flex-col overflow-hidden ${
          firstVisible ? `flex ${stacked || singlePane ? 'flex-1' : ''}` : 'hidden'
        }`}
        // No inline size when stacked: the panes share the height evenly and there's no ratio to
        // apply. An inline width here is also what makes `max-[900px]:flex-col` unusable.
        style={
          stacked || singlePane
            ? undefined
            : isHorizontal
              ? { width: percent }
              : { height: percent }
        }
      >
        {first}
      </div>

      {singlePane ? (
        <div aria-hidden="true" className="hidden" />
      ) : stacked ? (
        <div aria-hidden="true" className="h-px shrink-0 bg-[var(--color-border)]" />
      ) : (
        <div
          role="separator"
          tabIndex={0}
          aria-label={ariaLabel ?? 'Resize panes'}
          aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={Math.round(minimum * 100)}
          aria-valuemax={Math.round((1 - minimum) * 100)}
          aria-controls={labelId}
          // Pointer events rather than mouse events, so touch and pen can drag the divider too.
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.currentTarget.setPointerCapture?.(event.pointerId)
            setDragging(true)
          }}
          onDoubleClick={() => commit(clampRatio(defaultRatio, minimum))}
          onKeyDown={handleKeyDown}
          title="Drag to resize — double-click or Enter to reset"
          className={`group relative shrink-0 border-[var(--color-border)] bg-[var(--color-border)] transition-colors focus-visible:outline-none focus-visible:bg-[var(--color-accent)] ${
            isHorizontal ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize'
          } ${dragging ? 'bg-[var(--color-accent)]' : 'hover:bg-[var(--color-accent)]/60'}`}
        >
          {/* The visible divider is 1px so it reads as a border rather than a widget; this
              invisible overlay gives the pointer a 9px target without that showing up in the
              layout. Below ~8px a divider is measurably annoying to grab. */}
          <span
            aria-hidden="true"
            className={`absolute ${
              isHorizontal ? '-left-1 top-0 h-full w-[9px]' : '-top-1 left-0 h-[9px] w-full'
            }`}
          />
        </div>
      )}

      <div
        id={labelId}
        className={`${secondVisible ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}
      >
        {second}
      </div>
    </div>
  )
}
