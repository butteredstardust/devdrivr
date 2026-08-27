import { describe, expect, it } from 'vitest'
import {
  MAX_NOTES_DRAWER_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_NOTES_DRAWER_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MIN_WORKSPACE_WIDTH,
  SIDEBAR_RAIL_WIDTH,
  clampNotesDrawerWidth,
  clampSidebarWidth,
  fitShellPanels,
} from '@/lib/shell-layout'

/** The app's own minimum window width — src-tauri/tauri.conf.json. */
const MIN_WINDOW = 800

const defaults = {
  sidebarWidth: 288,
  sidebarCollapsed: false,
  notesDrawerWidth: 288,
  notesDrawerOpen: false,
}

const workspace = (shellWidth: number, fit: { sidebarWidth: number; notesDrawerWidth: number }) =>
  shellWidth - fit.sidebarWidth - fit.notesDrawerWidth

describe('clampSidebarWidth', () => {
  it('holds the stored width between its floor and ceiling', () => {
    expect(clampSidebarWidth(10)).toBe(MIN_SIDEBAR_WIDTH)
    expect(clampSidebarWidth(9999)).toBe(MAX_SIDEBAR_WIDTH)
    expect(clampSidebarWidth(240.4)).toBe(240)
  })
})

describe('clampNotesDrawerWidth', () => {
  it('holds the stored width between its floor and ceiling', () => {
    expect(clampNotesDrawerWidth(10)).toBe(MIN_NOTES_DRAWER_WIDTH)
    expect(clampNotesDrawerWidth(9999)).toBe(MAX_NOTES_DRAWER_WIDTH)
  })
})

describe('fitShellPanels', () => {
  it('leaves both panels at their stored widths when the row is wide enough', () => {
    const fit = fitShellPanels({ ...defaults, shellWidth: 1400, notesDrawerOpen: true })
    expect(fit).toEqual({ sidebarWidth: 288, sidebarRailed: false, notesDrawerWidth: 288 })
  })

  it('reports no pressure from an unmeasured row', () => {
    // jsdom has no ResizeObserver and the first render precedes the first observation everywhere
    // else, so `0` must never be read as "the row is 0px wide and everything must collapse".
    const fit = fitShellPanels({ ...defaults, shellWidth: 0, notesDrawerOpen: true })
    expect(fit).toEqual({ sidebarWidth: 288, sidebarRailed: false, notesDrawerWidth: 288 })
  })

  it('narrows the sidebar toward its floor before touching anything else', () => {
    // 800 - 420 leaves a 380px budget; the drawer is closed, so the sidebar simply takes it.
    const fit = fitShellPanels({ ...defaults, shellWidth: MIN_WINDOW, sidebarWidth: 420 })
    expect(fit.sidebarRailed).toBe(false)
    expect(fit.sidebarWidth).toBe(380)
    expect(workspace(MIN_WINDOW, fit)).toBe(MIN_WORKSPACE_WIDTH)
  })

  it('rails the sidebar rather than shrink the drawer the user just opened', () => {
    // The regression: at the app's own minimum window width with stock settings this used to
    // leave the workspace 262px — narrow enough to crush a document toolbar's filename to one
    // glyph and to clip the markdown preview's floating toggle out of the pane entirely.
    const fit = fitShellPanels({ ...defaults, shellWidth: MIN_WINDOW, notesDrawerOpen: true })
    expect(fit.sidebarRailed).toBe(true)
    expect(fit.sidebarWidth).toBe(SIDEBAR_RAIL_WIDTH)
    expect(fit.notesDrawerWidth).toBe(288)
    expect(workspace(MIN_WINDOW, fit)).toBeGreaterThanOrEqual(MIN_WORKSPACE_WIDTH)
  })

  it('keeps a sidebar the user collapsed on its rail', () => {
    const fit = fitShellPanels({ ...defaults, shellWidth: 1400, sidebarCollapsed: true })
    expect(fit).toEqual({
      sidebarWidth: SIDEBAR_RAIL_WIDTH,
      sidebarRailed: true,
      notesDrawerWidth: 0,
    })
  })

  it('gives the drawer no width while it is closed, however tight the row', () => {
    const fit = fitShellPanels({ ...defaults, shellWidth: 300 })
    expect(fit.notesDrawerWidth).toBe(0)
  })

  it('squeezes the drawer only once the rail has given up everything it can', () => {
    // Below the minimum window the workspace floor can no longer be met by railing alone. The
    // drawer gives ground rather than the row overflowing and clipping a panel outright.
    const shellWidth = 600
    const fit = fitShellPanels({ ...defaults, shellWidth, notesDrawerOpen: true })
    expect(fit.sidebarWidth).toBe(SIDEBAR_RAIL_WIDTH)
    expect(fit.notesDrawerWidth).toBeLessThan(MIN_NOTES_DRAWER_WIDTH)
    expect(workspace(shellWidth, fit)).toBe(MIN_WORKSPACE_WIDTH)
  })

  it('never returns a negative width, however small the row', () => {
    for (const shellWidth of [1, 40, 120, 300, 419]) {
      const fit = fitShellPanels({ ...defaults, shellWidth, notesDrawerOpen: true })
      expect(fit.sidebarWidth).toBeGreaterThanOrEqual(0)
      expect(fit.notesDrawerWidth).toBeGreaterThanOrEqual(0)
    }
  })

  it('restores both panels as soon as the row grows back', () => {
    const narrow = fitShellPanels({ ...defaults, shellWidth: MIN_WINDOW, notesDrawerOpen: true })
    const wide = fitShellPanels({ ...defaults, shellWidth: 1400, notesDrawerOpen: true })
    expect(narrow.sidebarRailed).toBe(true)
    // Nothing here writes to the store, so widening the window is enough to undo the rail.
    expect(wide.sidebarRailed).toBe(false)
    expect(wide.sidebarWidth).toBe(288)
  })
})
