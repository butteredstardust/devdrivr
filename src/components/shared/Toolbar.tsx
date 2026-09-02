import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { CaretDownIcon } from '@phosphor-icons/react'
import { Button } from './Button'
import { Popover, type PopoverTriggerProps } from './Popover'
import { SectionLabel } from './SectionLabel'

type ToolbarProps = {
  children: ReactNode
  className?: string
  /** Bottom border — the common `border-b` toolbar row. Off for toolbars stacked under another bordered row. */
  border?: boolean
  /** Accessible label for a toolbar containing several action groups. */
  'aria-label'?: string
  /** For a collapsible secondary row that a disclosure button's `aria-controls` points at. */
  id?: string
}

// Horizontal control bar — codifies the
// `flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2`
// row hand-rolled at the top of most tools (CsvTools, ApiClient, CodeFormatter, ...).
//
// `min-h-11` matches the title bar's `h-11`, so the chrome stack reads as a rhythm rather than a
// ragged edge. `min-h-10` with `py-2` was a floor that almost nothing reached: measured live at
// 1024px, toolbars came out 42, 43, 46 and 47px tall depending purely on which controls a tool
// happened to contain, so the line under the tab strip jumped every time you switched tabs. The
// tallest control in the app measures 31px, which `py-1.5` leaves at 43px — under the floor — so
// for a row of buttons the floor decides and the height is 44px regardless of contents.
//
// It is a floor, not a fixed height: rows built around a text field instead of buttons (the regex
// pattern, the API request URL) measure 51–65px, set by that control. What the floor buys is that
// height never varies with *how many* controls a row holds — the row never wraps, and overflow is
// resolved by collapsing groups into the trailing menu.
export function Toolbar({
  children,
  className = '',
  border = true,
  id,
  'aria-label': ariaLabel,
}: ToolbarProps) {
  const analysis = useMemo(() => analyzeChildren(children), [children])
  const analysisRef = useRef(analysis)
  analysisRef.current = analysis

  const containerRef = useRef<HTMLDivElement | null>(null)
  const groupNodes = useRef(new Map<number, HTMLDivElement>())
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  // Targets observed but not yet heard from — see the observer effect for why their first
  // callback has to be swallowed.
  const pendingInitialRef = useRef(new Set<Element>())
  const moreNode = useRef<HTMLButtonElement | null>(null)
  const [collapsedCount, setCollapsedCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [tick, forceTick] = useState(0)
  // Whether the row currently renders every group. Honest measurement needs the expanded
  // layout, so a resize pass first expands, then measures on the following render.
  const expandedRef = useRef(true)
  const collapsedRef = useRef(0)

  const measure = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (!expandedRef.current) {
      expandedRef.current = true
      // The row is about to render fully expanded, so the bookkeeping has to say so too.
      // Leaving this at its old value made the next pass's identical result look like "no
      // change" and skip the update, stranding the row expanded and overflowing forever.
      collapsedRef.current = 0
      setCollapsedCount(0)
      forceTick((t) => t + 1)
      return
    }
    const { groupsTotal } = analysisRef.current
    if (groupsTotal === 0) return

    // A zero-width row means no real layout — a hidden tab or a test environment's stubs.
    // Collapsing there would hide controls from tests and from backgrounded instances.
    if (el.clientWidth <= 0) return

    const style = window.getComputedStyle(el)
    const gap = parseFloat(style.columnGap) || 0
    const available =
      el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)

    const kids = Array.from(el.children) as HTMLElement[]
    let fixedNeeded = 0
    for (const kid of kids) fixedNeeded += kid.getBoundingClientRect().width
    const childCount = kids.length

    const groupWidths: number[] = []
    for (let ordinal = 0; ordinal < groupsTotal; ordinal++) {
      const node = groupNodes.current.get(ordinal)
      const width = node ? node.getBoundingClientRect().width : 0
      groupWidths.push(width)
      fixedNeeded -= width
    }

    const moreWidth = moreNode.current ? moreNode.current.offsetWidth : MORE_RESERVE

    const next = planCollapse({
      available,
      fixedWidth: fixedNeeded,
      groupWidths,
      moreWidth,
      gap,
      childCount,
    })
    if (next === collapsedRef.current) return
    collapsedRef.current = next
    if (next > 0) expandedRef.current = false
    setCollapsedCount(next)
    setMenuOpen(false)
  }, [])

  // Re-measure whenever the toolbar's structure changes or an expansion pass has just rendered.
  useLayoutEffect(() => {
    measure()
  }, [measure, analysis.signature, tick])

  const rafRef = useRef(0)
  const requestMeasure = useCallback(() => {
    if (rafRef.current) return
    if (typeof requestAnimationFrame !== 'function') {
      measure()
      return
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      measure()
    })
  }, [measure])

  useEffect(() => {
    const el = containerRef.current
    // jsdom has no ResizeObserver — toolbars render fully expanded in tests.
    if (!el || typeof ResizeObserver === 'undefined') return
    // `observe()` always delivers one callback describing the element's current size, before
    // anything has actually resized. That callback carries no news — the layout effect measures
    // on the very same commit that mounted the node. Acting on it is worse than useless here:
    // an expansion pass remounts the collapsed groups, `setGroupNode` observes the new nodes,
    // their initial callbacks re-enter `measure`, and the row expands and collapses forever at
    // frame rate. So swallow the first callback per target and only react to real resizes.
    const pendingInitial = pendingInitialRef.current
    const observer = new ResizeObserver((entries) => {
      let resized = false
      for (const entry of entries) {
        if (pendingInitial.delete(entry.target)) continue
        resized = true
      }
      if (resized) requestMeasure()
    })
    resizeObserverRef.current = observer
    pendingInitial.add(el)
    observer.observe(el)
    for (const node of groupNodes.current.values()) {
      pendingInitial.add(node)
      observer.observe(node)
    }
    return () => {
      resizeObserverRef.current = null
      pendingInitial.clear()
      observer.disconnect()
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [requestMeasure])

  const setGroupNode = useCallback((ordinal: number, node: HTMLDivElement | null) => {
    const previous = groupNodes.current.get(ordinal)
    if (previous === node) return
    if (previous) {
      pendingInitialRef.current.delete(previous)
      resizeObserverRef.current?.unobserve(previous)
    }
    if (node) {
      groupNodes.current.set(ordinal, node)
      pendingInitialRef.current.add(node)
      resizeObserverRef.current?.observe(node)
    } else {
      groupNodes.current.delete(ordinal)
    }
  }, [])

  const hiddenFrom = analysis.groupsTotal - collapsedCount
  const collapsedGroups = analysis.groupElements.slice(hiddenFrom)

  return (
    <div
      id={id}
      ref={containerRef}
      role="toolbar"
      aria-label={ariaLabel}
      className={`flex min-h-11 items-center gap-2 bg-[var(--color-surface)] px-4 py-1.5 ${border ? 'border-b border-[var(--color-border)]' : ''} ${className}`}
    >
      {analysis.nodes.map((node, index) => {
        const ordinal = analysis.groupOrdinal.get(index)
        if (ordinal === undefined) return node
        if (ordinal >= hiddenFrom) return null
        return cloneElement(node as ReactElement<ToolbarGroupProps>, {
          ref: (el: HTMLDivElement | null) => setGroupNode(ordinal, el),
        })
      })}
      {collapsedCount > 0 && (
        <Popover
          open={menuOpen}
          onOpenChange={setMenuOpen}
          label="More actions"
          align="end"
          className="min-w-56"
          trigger={(triggerProps: PopoverTriggerProps) => (
            <Button
              {...triggerProps}
              ref={(node: HTMLButtonElement | null) => {
                triggerProps.ref(node)
                moreNode.current = node
              }}
              variant="ghost"
              size="sm"
              aria-label="More actions"
              data-testid="toolbar-more-trigger"
              className="shrink-0 px-1.5"
            >
              <CaretDownIcon size={12} aria-hidden="true" />
            </Button>
          )}
        >
          <div
            className="divide-y divide-[var(--color-border)]"
            onClick={(event) => {
              // Dismiss in bubble phase, after the action's own handler has run. Capture phase
              // unmounts nested popovers before a trusted browser click reaches its target.
              const button = (event.target as HTMLElement).closest('button')
              if (button && button.getAttribute('aria-haspopup') !== 'dialog') setMenuOpen(false)
            }}
          >
            {collapsedGroups.map((group, index) => (
              <OverflowSection key={group.key ?? index} element={group} />
            ))}
          </div>
        </Popover>
      )}
    </div>
  )
}

/** Width budgeted for the overflow trigger before it has rendered once. */
const MORE_RESERVE = 34

type ToolbarGroupProps = {
  children: ReactNode
  label?: string
  separated?: boolean
  className?: string
  /** Used by `Toolbar` to measure the group for overflow. Not part of the public contract. */
  ref?: (node: HTMLDivElement | null) => void
}

export function ToolbarGroup({
  children,
  label,
  separated = false,
  className = '',
  ref,
}: ToolbarGroupProps) {
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      data-toolbar-group=""
      className={`flex shrink-0 items-center gap-1.5 ${separated ? 'border-l border-[var(--color-border)] pl-2' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

type OverflowSectionProps = {
  element: ReactElement<ToolbarGroupProps>
}

/**
 * One collapsed group inside the overflow surface: its label as a section heading, its
 * controls restacked vertically. The controls are the very same elements the row renders —
 * they only ever mount in one place, so ids and state stay unique.
 */
function OverflowSection({ element }: OverflowSectionProps) {
  const { label, children } = element.props
  return (
    <section aria-label={label} className="px-2 py-2">
      {label && <SectionLabel className="mb-1.5">{label}</SectionLabel>}
      <div className="flex flex-col items-stretch gap-0.5 [&_>_button]:w-full [&_>_button]:justify-start [&_>_button]:text-left">
        {children}
      </div>
    </section>
  )
}

type ChildAnalysis = {
  nodes: ReactNode[]
  /** Ordinal (among groups) of the group at each child position. */
  groupOrdinal: Map<number, number>
  groupElements: ReactElement<ToolbarGroupProps>[]
  groupsTotal: number
  signature: string
}

function analyzeChildren(children: ReactNode): ChildAnalysis {
  const nodes = Children.toArray(children)
  const groupOrdinal = new Map<number, number>()
  const groupElements: ReactElement<ToolbarGroupProps>[] = []
  let signature = ''
  nodes.forEach((node, index) => {
    if (isValidElement(node) && node.type === ToolbarGroup) {
      groupOrdinal.set(index, groupElements.length)
      groupElements.push(node as ReactElement<ToolbarGroupProps>)
      signature += 'g'
    } else {
      signature += 'o'
    }
  })
  return { nodes, groupOrdinal, groupElements, groupsTotal: groupElements.length, signature }
}

type CollapsePlanInput = {
  /** Content-box width the row may occupy. */
  available: number
  /** Combined width of everything that never collapses (identity, file actions, bare buttons). */
  fixedWidth: number
  /** Natural widths of every group, in row order. */
  groupWidths: number[]
  moreWidth: number
  gap: number
  /** Total mounted children — groups and fixed nodes — at full expansion. */
  childCount: number
}

/**
 * How many trailing groups to fold into the overflow menu so the rest fits.
 *
 * Pure arithmetic so the edge cases — the trigger's own width, the gaps collapsing removes,
 * the rounding slop — are testable without a layout engine. Collapsing proceeds from the
 * right because groups are ordered by importance: the row sheds the least important first.
 */
export function planCollapse({
  available,
  fixedWidth,
  groupWidths,
  moreWidth,
  gap,
  childCount,
}: CollapsePlanInput): number {
  const total = groupWidths.length
  let needed = fixedWidth
  for (const width of groupWidths) needed += width
  needed += Math.max(0, childCount - 1) * gap

  let collapsed = 0
  while (collapsed < total && needed > available + 0.75) {
    const width = groupWidths[total - 1 - collapsed] ?? 0
    needed -= width
    collapsed += 1
    if (collapsed === 1) {
      // The trigger appears, and one gap with it.
      needed += moreWidth + gap
    }
    needed -= gap
  }
  return collapsed
}

export function ToolbarSpacer() {
  return <div className="min-w-2 flex-1" aria-hidden="true" />
}

type DocumentToolbarProps = ToolbarProps

/**
 * Compact chrome for document-oriented tools, on a single line that never wraps. The identity
 * truncates first, then whole groups fold into the trailing "More actions" menu as the
 * workspace narrows, in reverse row order — so group order in JSX is priority order, most
 * important first. The row's height never varies with its contents.
 *
 * No bottom border by default, where `Toolbar` has one. A document toolbar is chrome *for* the
 * document directly beneath it and should look continuous with it — the same argument the tab
 * strip's top pill indicator is built on. Eight of the thirteen call sites had already reached
 * that conclusion independently and passed `border={false}`, which left a third of the app with a
 * seam under its toolbar and two-thirds without, decided tool by tool. Stating it once here makes
 * it a rule; a document toolbar that genuinely stacks above another row can still pass
 * `border` explicitly.
 */
export function DocumentToolbar({
  children,
  className = '',
  border = false,
  ...props
}: DocumentToolbarProps) {
  return (
    <Toolbar {...props} border={border} className={`gap-x-3 ${className}`}>
      {children}
    </Toolbar>
  )
}

type DocumentIdentityProps = {
  title: string
  titleTooltip?: string
  titleTestId?: string
  icon?: ReactNode
  stateLabel?: string
  stateChanged?: boolean
  status?: ReactNode
  statusIcon?: ReactNode
  statusTestId?: string
  /**
   * Off for identity lines whose "status" is static context (a file path, say)
   * rather than a result worth announcing. Keep it on for anything that settles.
   */
  statusLive?: boolean
  className?: string
}

/** File identity and live status used at the leading edge of a document toolbar. */
export function DocumentIdentity({
  title,
  titleTooltip,
  titleTestId,
  icon,
  stateLabel,
  stateChanged = false,
  status,
  statusIcon,
  statusTestId,
  statusLive = true,
  className = '',
}: DocumentIdentityProps) {
  return (
    // The floor and the clip both live here, on the flex item the row actually measures.
    //
    // `min-w-0` let this box absorb every pixel the row was short — measured at 10px wide around a
    // 141px title and status. Because `planCollapse` sums the *rendered* widths of non-group
    // children, a crushed identity made `needed` look small enough to stop folding groups into the
    // overflow menu, so the row read as "fits" while its own text spilled out of a 10px box and
    // painted over the file-action icons to its right. A minimum on the title span alone could not
    // fix that: the children hold their minimums and overflow the parent, which is the spill.
    //
    // With a floor the identity reports an honest width and groups keep collapsing until the name
    // is readable; `overflow-hidden` handles the rest, so the last few pixels truncate the status
    // instead of escaping the box. Safe to clip here — this subtree is text, with no focus ring to
    // cut off.
    <div className={`flex min-w-32 flex-1 items-center gap-2 overflow-hidden ${className}`}>
      {icon}
      <span
        data-testid={titleTestId}
        // Within that floor the title is what holds its ground and the status line (`min-w-0`) is
        // what yields, so a name stays readable while the context beside it shortens.
        className="font-ui min-w-20 max-w-56 truncate text-xs font-semibold text-[var(--color-text)]"
        title={titleTooltip ?? title}
      >
        {title}
      </span>
      {stateLabel && (
        <span
          aria-live="polite"
          className={`shrink-0 text-2xs ${stateChanged ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
        >
          {stateLabel}
        </span>
      )}
      {status && (
        <span
          data-testid={statusTestId}
          role={statusLive ? 'status' : undefined}
          aria-live={statusLive ? 'polite' : undefined}
          className="flex min-w-0 items-center gap-1 truncate text-2xs text-[var(--color-text-muted)]"
        >
          {statusIcon}
          <span className="truncate">{status}</span>
        </span>
      )}
    </div>
  )
}
