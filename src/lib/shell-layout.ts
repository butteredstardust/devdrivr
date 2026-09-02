/**
 * How the three columns of the shell row — sidebar, workspace, notes drawer — share a narrow
 * window.
 *
 * The row used to have no arbiter at all: both side panels are `shrink-0` at a stored pixel width
 * and the workspace is `flex-1` inside `overflow-hidden`, so its min-width resolves to 0 and it
 * absorbs *every* pixel the window loses. At the app's own configured minimum window width (800,
 * see src-tauri/tauri.conf.json) with default settings and the notes drawer open, the workspace
 * measured 262px — narrow enough that a tool's document toolbar crushed its filename to a single
 * glyph, and narrow enough to clip an absolutely-positioned control (the markdown preview's
 * "Edit preview" toggle) clean out of the pane.
 *
 * So the workspace gets a floor and the side panels yield to it, in a fixed order:
 *
 *   1. The sidebar narrows toward `MIN_SIDEBAR_WIDTH`.
 *   2. If that isn't enough it drops to the 40px rail — it has a designed collapsed state and the
 *      notes drawer does not.
 *   3. Only once the rail has given everything it can does the drawer give ground. It is the
 *      panel the user just opened to read; shrinking it first would answer "show me my notes"
 *      by making the notes unreadable.
 *
 * Step 3 is reachable only below ~740px, i.e. below the minimum window the app allows, and exists
 * so a window that somehow gets there degrades instead of overflowing the row and clipping a panel.
 */

/** Width the workspace keeps for itself before either side panel is allowed to take more. */
export const MIN_WORKSPACE_WIDTH = 420

/** Collapsed sidebar — icon rail only. Mirrors the width `Sidebar` renders when collapsed. */
export const SIDEBAR_RAIL_WIDTH = 40

// Floor is where the longest tool names stop being readable at all; ceiling keeps the sidebar
// from eating a window that is only ~800px wide to begin with.
export const MIN_SIDEBAR_WIDTH = 180
export const MAX_SIDEBAR_WIDTH = 420

export const MIN_NOTES_DRAWER_WIDTH = 280
export const MAX_NOTES_DRAWER_WIDTH = 600

export function clampSidebarWidth(width: number): number {
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)))
}

export function clampNotesDrawerWidth(width: number): number {
  return Math.max(MIN_NOTES_DRAWER_WIDTH, Math.min(MAX_NOTES_DRAWER_WIDTH, Math.round(width)))
}

export type ShellFitInput = {
  /** Measured width of the shell row. `0` means "not measured yet" — see `fitShellPanels`. */
  shellWidth: number
  sidebarWidth: number
  sidebarCollapsed: boolean
  notesDrawerWidth: number
  notesDrawerOpen: boolean
}

export type ShellFit = {
  /** Width the sidebar should render at, rail width included. */
  sidebarWidth: number
  /** True when the sidebar must render its icon rail — either by setting or by layout pressure. */
  sidebarRailed: boolean
  /** Width the notes drawer should render at. `0` when closed. */
  notesDrawerWidth: number
}

/**
 * Resolve the two side panels' widths against the space the workspace needs.
 *
 * `shellWidth <= 0` means the row has not been measured — jsdom has no ResizeObserver, and the
 * first render precedes the first observation everywhere else. Both cases must return the panels'
 * natural widths: reporting layout pressure from an unmeasured row would rail the sidebar in every
 * test and flash the rail on mount in the real app.
 */
export function fitShellPanels({
  shellWidth,
  sidebarWidth,
  sidebarCollapsed,
  notesDrawerWidth,
  notesDrawerOpen,
}: ShellFitInput): ShellFit {
  const sidebarNatural = sidebarCollapsed ? SIDEBAR_RAIL_WIDTH : clampSidebarWidth(sidebarWidth)
  const drawerNatural = notesDrawerOpen ? clampNotesDrawerWidth(notesDrawerWidth) : 0
  const natural: ShellFit = {
    sidebarWidth: sidebarNatural,
    sidebarRailed: sidebarCollapsed,
    notesDrawerWidth: drawerNatural,
  }

  if (shellWidth <= 0) return natural

  // Everything the two panels may share once the workspace has taken its floor.
  const budget = Math.max(0, shellWidth - MIN_WORKSPACE_WIDTH)
  if (sidebarNatural + drawerNatural <= budget) return natural

  let railed = sidebarCollapsed
  let sidebar = sidebarCollapsed
    ? SIDEBAR_RAIL_WIDTH
    : Math.max(MIN_SIDEBAR_WIDTH, budget - drawerNatural)
  if (sidebar + drawerNatural > budget) {
    railed = true
    sidebar = SIDEBAR_RAIL_WIDTH
  }

  return {
    sidebarWidth: sidebar,
    sidebarRailed: railed,
    notesDrawerWidth: Math.min(drawerNatural, Math.max(0, budget - sidebar)),
  }
}
