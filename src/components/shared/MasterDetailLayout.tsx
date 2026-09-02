import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { SidebarSimpleIcon } from '@phosphor-icons/react'

/**
 * Width below which the sidebar yields, however the caller has it set.
 *
 * The sidebar is 208–256px and the detail side of the narrowest tool here (the API Client's
 * method + URL + Send row) needs about 340px before its controls start falling off the right
 * edge. Under this the two cannot both be usable, so the list gives way to the thing being
 * edited — the same yield order `fitShellPanels` applies to the app sidebar.
 */
const MIN_SPLIT_WIDTH = 560

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
  className?: string
}

/**
 * Sidebar-plus-detail shell for library-style tools (snippets, prompt templates, saved requests).
 *
 * Those three tools each hand-rolled this and arrived somewhere different: two bypassed
 * `ToolLayout` entirely with their own `<h1>`, the third nested a sidebar beside a `fullBleed`
 * body. Same shape, three implementations, three sets of breakpoints.
 *
 * The sidebar is a fixed-width column rather than a `SplitPane` on purpose — a list of names has
 * a right width, and making it draggable adds a decision without adding a capability.
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
  className = '',
}: MasterDetailLayoutProps) {
  // Measured, not queried: the width that matters is this layout's own, and a viewport media
  // query cannot see the app sidebar or the notes drawer taking their share of it. At the app's
  // 800px minimum window with the drawer open, the media query still reserved 208px here for a
  // list while the detail side was down to 230px and shedding its primary controls off-screen.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const crampedRef = useRef(false)
  const [cramped, setCramped] = useState(false)
  const [internalCrampedOpen, setInternalCrampedOpen] = useState(false)

  const report = useCallback((next: boolean) => {
    if (crampedRef.current === next) return
    crampedRef.current = next
    setCramped(next)
  }, [])

  // Notify an externally controlled toggle after this layout has committed its own state. Calling
  // the parent from the state updater produces React's cross-component-render warning when a
  // ResizeObserver result arrives during a render batch.
  useEffect(() => {
    onCrampedChange?.(cramped)
  }, [cramped, onCrampedChange])

  useEffect(() => {
    const el = rootRef.current
    // jsdom has no ResizeObserver — the layout renders as the caller asked for, which is what
    // every existing test asserts.
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0
      // A zero-width root is a backgrounded tab, not a narrow one.
      if (width > 0) report(width < MIN_SPLIT_WIDTH)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [report])

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
    <div ref={rootRef} className={`relative flex h-full min-h-0 bg-[var(--color-bg)] ${className}`}>
      <aside
        aria-label={title}
        // The collapsed state below hides the pane from the eye and the mouse but not from the
        // tab order or the accessibility tree, so its list and header would still be announced
        // and tabbable while the pane reads as closed. `inert` covers all three.
        inert={!effectiveOpen}
        // Narrows below 1000px, the density breakpoint — see DESIGN_SYSTEM.md § Breakpoints. This
        // comment used to claim 1100px matched SnippetsManager; it did not, SnippetsManager has
        // always used 1000px, and that mismatch is where the drift came from.
        // It stays a viewport query because it only picks between two comfortable widths. The
        // width this query can't see — the app sidebar's and the notes drawer's share — is what
        // the measured `cramped` check above handles, and that one decides whether the pane is
        // shown at all.
        className={`flex min-h-0 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width,opacity] duration-[var(--duration-panel)] ease-[var(--ease-in-out)] ${
          crampedOverlayOpen
            ? 'absolute inset-y-0 left-0 z-[var(--z-popover)] w-64 opacity-100 shadow-lg max-[1000px]:w-52'
            : effectiveOpen
              ? 'w-64 opacity-100 max-[1000px]:w-52'
              : 'pointer-events-none w-0 overflow-hidden border-r-0 opacity-0'
        }`}
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
