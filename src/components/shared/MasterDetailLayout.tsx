import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { Button } from './Button'
import { SidebarSimpleIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { useEdgeResize } from '@/hooks/useEdgeResize'

/**
 * Width below which the sidebar yields, however the caller has it set.
 *
 * The detail side of the narrowest tool here (the API Client's method + URL + Send row) needs
 * about 340px before its controls start falling off the right edge. Under this the two cannot
 * both be usable, so the list gives way to the thing being edited — the same yield order
 * `fitShellPanels` applies to the app sidebar.
 */
const MIN_SPLIT_WIDTH = 560

/** Floor is where a folder name stops being readable; the ceiling is the detail pane's floor. */
export const MIN_MASTER_WIDTH = 180
const MIN_DETAIL_WIDTH = 340

/** Width used when nothing is stored. Matches the `w-64` the pane rendered when it was fixed. */
const DEFAULT_MASTER_WIDTH = 256

const STORAGE_PREFIX = 'devdrivr.master-width.'

/**
 * Widest the list may be drawn in a layout of `rootWidth`.
 *
 * An unmeasured root returns the stored width's own ceiling. Clamping to a floor before the
 * first measurement would snap a legitimately wide pane narrow for one frame.
 */
function maxMasterWidth(rootWidth: number): number {
  if (rootWidth <= 0) return Number.POSITIVE_INFINITY
  return Math.max(MIN_MASTER_WIDTH, rootWidth - MIN_DETAIL_WIDTH)
}

function readStoredWidth(storageKey: string | undefined): number {
  if (!storageKey) return DEFAULT_MASTER_WIDTH
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey)
    const parsed = raw === null ? Number.NaN : Number.parseFloat(raw)
    // A stored value is clamped on read, not on next drag: a hand-edited or stale entry would
    // otherwise render the list over the whole tool until someone found the divider.
    return Number.isFinite(parsed) ? Math.max(MIN_MASTER_WIDTH, parsed) : DEFAULT_MASTER_WIDTH
  } catch {
    return DEFAULT_MASTER_WIDTH
  }
}

type MasterDetailLayoutProps = {
  /** Library/list side. Rendered inside an `<aside>` — don't add your own. */
  sidebar: ReactNode
  /** Sidebar heading. Library tools legitimately show their own title; the tab strip names the
   *  tool, this names the collection inside it. */
  title: string
  /** Muted subtitle under the title — usually a count. */
  subtitle?: ReactNode
  /** Primary action for the collection, e.g. a "New" button. */
  sidebarActions?: ReactNode
  children: ReactNode
  /** Controlled collapse. Omit both to render a permanently visible sidebar. */
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
  /**
   * Told whenever the layout overrides `sidebarOpen` because there is no room for both panes.
   * Only needed by callers that render their own toggle outside this component — theirs is the
   * label that would otherwise say "Hide" over an already-hidden pane.
   */
  onCrampedChange?: ((cramped: boolean) => void) | undefined
  /** Temporarily reveal the sidebar as an overlay while the layout is cramped. */
  showSidebarWhenCramped?: boolean | undefined
  /** Close control rendered inside the cramped overlay, where the detail toggle is covered. */
  onCloseCrampedSidebar?: (() => void) | undefined
  /**
   * Persists the sidebar width under this key. Omit to make the pane a fixed default width with
   * no drag handle — a caller with nothing worth widening should not grow a control.
   */
  widthStorageKey?: string
  className?: string
  /** Receives the layout root, so a caller can scope its keyboard listeners to its own subtree. */
  rootRef?: RefObject<HTMLDivElement | null>
}

/**
 * Sidebar-plus-detail shell for library-style tools (snippets, prompt templates, saved requests).
 *
 * Those three tools each hand-rolled this and arrived somewhere different: two bypassed
 * `ToolLayout` entirely with their own `<h1>`, the third nested a sidebar beside a `fullBleed`
 * body. Same shape, three implementations, three sets of breakpoints.
 *
 * Pass `widthStorageKey` to make the list draggable. A list of names does have a right width, but
 * it is the user's name lengths that decide it: deep folder nesting and long titles truncate at
 * any width picked in advance. Without the key the pane stays a fixed column.
 */
export function MasterDetailLayout({
  sidebar,
  title,
  subtitle,
  sidebarActions,
  children,
  sidebarOpen = true,
  onToggleSidebar,
  onCrampedChange,
  showSidebarWhenCramped = false,
  onCloseCrampedSidebar,
  widthStorageKey,
  className = '',
  rootRef: externalRootRef,
}: MasterDetailLayoutProps) {
  // Measured, not queried: the width that matters is this layout's own, and a viewport media
  // query cannot see the app sidebar or the notes drawer taking their share of it. At the app's
  // 800px minimum window with the drawer open, the media query still reserved 208px here for a
  // list while the detail side was down to 230px and shedding its primary controls off-screen.
  const ownRootRef = useRef<HTMLDivElement | null>(null)
  const rootRef = externalRootRef ?? ownRootRef
  const crampedRef = useRef(false)
  const [cramped, setCramped] = useState(false)
  const [internalCrampedOpen, setInternalCrampedOpen] = useState(false)
  const [rootWidth, setRootWidth] = useState(0)
  const [width, setWidth] = useState(() => readStoredWidth(widthStorageKey))
  const resizable = widthStorageKey !== undefined
  const paneId = useId()

  const report = useCallback((next: boolean) => {
    if (crampedRef.current === next) return
    crampedRef.current = next
    setCramped(next)
  }, [])

  // The ceiling moves with the tool pane, so a window resize can leave the stored width too wide.
  // Clamp at render rather than writing the narrowed value back: widening the window again should
  // return the pane to the width the user chose, not to what the narrowest moment allowed.
  const maxWidth = maxMasterWidth(rootWidth)
  const renderedWidth = Math.min(Math.max(width, MIN_MASTER_WIDTH), maxWidth)

  // Read at pointer-down only; keeps the gesture from re-subscribing on every pixel of a drag.
  // A gesture starts from the rendered width, not the stored one. When the row has narrowed the
  // pane below the stored width, starting from the stored width gives the user a dead zone: the
  // first pixels of the drag close a gap they cannot see before the edge moves.
  const widthRef = useRef(renderedWidth)
  widthRef.current = renderedWidth

  const clampWidth = useCallback(
    (value: number) => Math.round(Math.min(Math.max(value, MIN_MASTER_WIDTH), maxWidth)),
    [maxWidth]
  )

  const persistWidth = useCallback(
    (final: number) => {
      if (!widthStorageKey) return
      try {
        window.localStorage.setItem(STORAGE_PREFIX + widthStorageKey, String(Math.round(final)))
      } catch {
        // The width still applies for this session. Persistence is a nicety, not a requirement.
      }
    },
    [widthStorageKey]
  )

  const { resizing, onPointerDown: handleDragStart } = useEdgeResize({
    direction: 1,
    getWidth: () => widthRef.current,
    clamp: clampWidth,
    onResize: setWidth,
    onCommit: persistWidth,
  })

  // Keyboard resizing, so the divider isn't pointer-only. The handle sits on the list's right
  // edge, so ArrowRight widens it — the width grows in the direction the key points.
  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step =
        event.key === 'ArrowRight'
          ? 16
          : event.key === 'ArrowLeft'
            ? -16
            : event.key === 'Home'
              ? -Number.MAX_SAFE_INTEGER
              : event.key === 'End'
                ? Number.MAX_SAFE_INTEGER
                : null
      if (step === null) return
      event.preventDefault()
      const next = clampWidth(widthRef.current + step)
      setWidth(next)
      persistWidth(next)
    },
    [clampWidth, persistWidth]
  )

  // Notify an externally controlled toggle after this layout has committed its own state. Calling
  // the parent from the state updater produces React's cross-component-render warning when a
  // ResizeObserver result arrives during a render batch.
  useEffect(() => {
    onCrampedChange?.(cramped)
  }, [cramped, onCrampedChange])

  // A layout effect, so the first measurement lands before the browser paints. The ceiling is
  // unknown until the row is measured, so a stored width wider than the window would otherwise
  // paint once at full size and crush the detail pane for that frame.
  useLayoutEffect(() => {
    const el = rootRef.current
    // jsdom has no ResizeObserver — the layout renders as the caller asked for, which is what
    // every existing test asserts.
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (width: number) => {
      // A zero-width root is a backgrounded tab, not a narrow one.
      if (width <= 0) return
      report(width < MIN_SPLIT_WIDTH)
      setRootWidth(width)
    }
    measure(el.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => measure(entry?.contentRect.width ?? 0))
    observer.observe(el)
    return () => observer.disconnect()
  }, [report, rootRef])

  useEffect(() => {
    if (!cramped) setInternalCrampedOpen(false)
  }, [cramped])

  const toggleInternalCrampedSidebar = useCallback(() => {
    setInternalCrampedOpen((open) => !open)
  }, [])

  const externallyControlledWhenCramped =
    onCrampedChange !== undefined || onCloseCrampedSidebar !== undefined
  const effectiveOpen =
    sidebarOpen &&
    (!cramped ||
      showSidebarWhenCramped ||
      (!externallyControlledWhenCramped && internalCrampedOpen))
  const crampedOverlayOpen = cramped && effectiveOpen
  const detailToggle =
    onToggleSidebar ??
    (cramped && !externallyControlledWhenCramped ? toggleInternalCrampedSidebar : undefined)
  const overlayClose = onCloseCrampedSidebar ?? toggleInternalCrampedSidebar

  return (
    <div
      ref={rootRef}
      className={cn(`relative flex h-full min-h-0 bg-[var(--color-bg)]`, className)}
    >
      <aside
        id={paneId}
        aria-label={title}
        // The collapsed state below hides the pane from the eye and the mouse but not from the
        // tab order or the accessibility tree, so its list and header would still be announced
        // and tabbable while the pane reads as closed. `inert` covers all three.
        inert={!effectiveOpen}
        // Narrow below the 1000px density breakpoint. See DESIGN_SYSTEM.md § Breakpoints.
        // It stays a viewport query because it only picks between two comfortable widths. The
        // width this query can't see — the app sidebar's and the notes drawer's share — is what
        // the measured `cramped` check above handles, and that one decides whether the pane is
        // shown at all.
        // A width transition animates every pixel of a drag, which reads as dropped frames rather
        // than as motion. Drop it for the duration of the gesture.
        className={cn(
          'flex min-h-0 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] duration-[var(--duration-panel)] ease-[var(--ease-in-out)]',
          resizing ? 'transition-none' : 'transition-[width,opacity]',
          crampedOverlayOpen
            ? 'absolute inset-y-0 left-0 z-[var(--z-popover)] opacity-100 shadow-lg'
            : effectiveOpen
              ? 'opacity-100'
              : 'pointer-events-none w-0 overflow-hidden border-r-0 opacity-0',
          // The fixed widths only apply when the caller opted out of resizing. `w-52` below the
          // 1000px density breakpoint — see DESIGN_SYSTEM.md § Breakpoints.
          !resizable && effectiveOpen && 'w-64 max-[1000px]:w-52'
        )}
        style={resizable && effectiveOpen ? { width: renderedWidth } : undefined}
      >
        <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-ui truncate text-sm font-semibold text-[var(--color-text)]">
              {title}
            </h2>
            {subtitle && (
              <p className="truncate text-2xs text-[var(--color-text-muted)]">{subtitle}</p>
            )}
          </div>
          {sidebarActions}
          {crampedOverlayOpen && (
            <Button
              variant="icon"
              size="sm"
              onClick={overlayClose}
              aria-label={`Hide ${title}`}
              title={`Hide ${title}`}
            >
              <SidebarSimpleIcon size={14} aria-hidden="true" />
            </Button>
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>
      </aside>

      {/* Not rendered while the pane is an overlay: the overlay floats over the detail side, so a
          divider there would resize the list against a pane it is covering. */}
      {resizable && effectiveOpen && !crampedOverlayOpen && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${title}`}
          // Names the pane this divider sizes. The label says what it does; this says to what.
          aria-controls={paneId}
          aria-valuenow={renderedWidth}
          aria-valuemin={MIN_MASTER_WIDTH}
          aria-valuemax={Number.isFinite(maxWidth) ? maxWidth : undefined}
          tabIndex={0}
          onPointerDown={handleDragStart}
          onKeyDown={handleResizeKeyDown}
          // 1px of border, but a 5px target. A hairline divider is a pointer accuracy test.
          className={cn(
            'relative z-10 -ml-px w-[5px] shrink-0 cursor-col-resize touch-none',
            'after:absolute after:inset-y-0 after:left-px after:w-px after:bg-transparent',
            'hover:after:bg-[var(--color-accent)] focus-visible:after:bg-[var(--color-accent)]',
            'focus-visible:outline-none',
            resizing && 'after:bg-[var(--color-accent)]'
          )}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {detailToggle && (
          <div className="flex shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1">
            <Button
              variant="icon"
              size="sm"
              onClick={detailToggle}
              aria-expanded={effectiveOpen}
              aria-label={effectiveOpen ? `Hide ${title}` : `Show ${title}`}
              className={effectiveOpen ? 'text-[var(--color-accent)]' : undefined}
            >
              <SidebarSimpleIcon size={14} aria-hidden="true" />
            </Button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
