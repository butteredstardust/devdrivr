import { create } from 'zustand'
import { setSetting, deleteToolState } from '@/lib/db'
import { useToolStateCache } from '@/stores/tool-state.store'
import { assignStateKeys, stateKeyFor } from '@/lib/tab-state-key'
import type { WorkspaceTab } from '@/types/tools'

const MAX_RECENT = 5

type LastAction = {
  message: string
  type: 'success' | 'error' | 'info'
  timestamp: number
}

type ToastItem = {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

type UiStore = {
  // --- Tab state ---
  tabs: WorkspaceTab[]
  activeTabId: string | null
  /** Always mirrors tabs.find(t => t.id === activeTabId)?.toolId ?? '' */
  activeTool: string
  /**
   * Tab ids most-recently-active first. The workspace keeps the leading few
   * mounted, so this is what decides which backgrounded tab keeps its editor
   * and which gets torn down.
   */
  tabMru: string[]
  /**
   * Ids of tabs whose tool reports unsaved work, so the strip can mark them.
   *
   * Tools already tracked this privately — the API client compares its draft
   * to the saved request, the markdown editor and HTML validator compare
   * against the last text written to disk — but each kept the answer to
   * itself, so the one place it is useful at a glance had no way to ask.
   * Reported through `useTabDirty`; deliberately not persisted, since it is
   * derived from tool state that is itself restored on launch.
   */
  dirtyTabIds: string[]

  // --- Tab actions ---
  /** Open tool in a new tab, or focus the existing tab if already open. */
  openTab: (toolId: string) => void
  /**
   * Open another tab of a tool that is already open. Deliberately separate
   * from `openTab`: clicking a tool in the sidebar should return you to your
   * work, not fork it, so duplicating stays an explicit request.
   */
  openTabInstance: (toolId: string) => void
  /** Move a tab to a new index, for drag reordering. Clamped to the tab's own pinned/unpinned block. */
  reorderTab: (tabId: string, toIndex: number) => void
  /** Pin or unpin a tab, re-sorting so pinned tabs lead. */
  toggleTabPinned: (tabId: string) => void
  /** Close a tab by its tab id. Activates adjacent tab if it was active. */
  closeTab: (tabId: string) => void
  /** Close every tab except the given one — and any pinned tabs, which survive. */
  closeOtherTabs: (tabId: string) => void
  /** Close all tabs to the right of the given tab id. */
  closeTabsToRight: (tabId: string) => void
  /** Switch the active tab without opening a new one. */
  setActiveTab: (tabId: string) => void
  /** Report whether a tab holds unsaved work. Called by tools via `useTabDirty`. */
  setTabDirty: (tabId: string, dirty: boolean) => void
  /** Bootstrap-only restore — does NOT persist to DB. */
  restoreTabs: (tabs: WorkspaceTab[], activeTabId: string | null) => void

  // --- Backward-compat aliases ---
  /** Alias for openTab (used by SidebarItem, CommandPalette, shortcuts). */
  setActiveTool: (toolId: string) => void
  /** Alias for restoreTabs with a single tab (used during legacy bootstrap). */
  restoreActiveTool: (toolId: string) => void

  // --- Recents ---
  recentToolIds: string[]
  trackRecent: (toolId: string) => void

  // --- UI overlays ---
  commandPaletteOpen: boolean
  lastAction: LastAction | null
  toasts: ToastItem[]
  settingsPanelOpen: boolean
  pendingSendTo: string | null
  shortcutsModalOpen: boolean

  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setLastAction: (message: string, type?: LastAction['type']) => void
  clearLastAction: () => void
  addToast: (message: string, type?: ToastItem['type']) => void
  removeToast: (id: string) => void
  setSettingsPanelOpen: (open: boolean) => void
  toggleSettingsPanel: () => void
  setPendingSendTo: (content: string | null) => void
  consumePendingSendTo: () => string | null
  setShortcutsModalOpen: (open: boolean) => void
  toggleShortcutsModal: () => void
}

function derivedActiveTool(tabs: WorkspaceTab[], activeTabId: string | null): string {
  return tabs.find((t) => t.id === activeTabId)?.toolId ?? ''
}

function persistTabs(tabs: WorkspaceTab[], activeTabId: string | null): void {
  setSetting('openTabs', tabs).catch(() => {})
  setSetting('activeTabId', activeTabId).catch(() => {})
}

/**
 * Forget the state of tabs that are being closed.
 *
 * Only scoped keys — a duplicate tab's `<toolId>#<tabId>`, whose tab id will
 * never come round again. The bare tool id is deliberately left behind: closing
 * a tool and reopening it is how you get your work back.
 */
function discardClosedState(closed: WorkspaceTab[]): void {
  for (const tab of closed) {
    const key = tab.stateKey ?? tab.toolId
    if (!key.includes('#')) continue
    useToolStateCache.getState().discard(key)
    deleteToolState(key).catch(() => {})
  }
}

/** Drops dirty flags belonging to tabs that no longer exist. */
function pruneDirty(dirtyTabIds: string[], tabs: WorkspaceTab[]): string[] {
  if (dirtyTabIds.length === 0) return dirtyTabIds
  const live = new Set(tabs.map((tab) => tab.id))
  const next = dirtyTabIds.filter((id) => live.has(id))
  // Same array when nothing was dropped, so subscribers don't re-render.
  return next.length === dirtyTabIds.length ? dirtyTabIds : next
}

/**
 * Pinned tabs ahead of unpinned ones, order preserved within each block.
 *
 * The strip renders store order directly, so this is what keeps pins on the
 * left no matter how they got there — pinning, restoring an old session, or
 * closing the tab that used to sit between two blocks.
 */
function sortPinnedFirst(tabs: WorkspaceTab[]): WorkspaceTab[] {
  const pinned = tabs.filter((tab) => tab.pinned)
  if (pinned.length === 0 || pinned.length === tabs.length) return tabs
  return [...pinned, ...tabs.filter((tab) => !tab.pinned)]
}

/** Most-recently-active first, with ids of closed tabs dropped. */
function touchMru(mru: string[], tabId: string | null, tabs: WorkspaceTab[]): string[] {
  const live = new Set(tabs.map((tab) => tab.id))
  const rest = mru.filter((id) => id !== tabId && live.has(id))
  return tabId && live.has(tabId) ? [tabId, ...rest] : rest
}

export const useUiStore = create<UiStore>()((set, get) => ({
  // --- Tab state ---
  tabs: [],
  activeTabId: null,
  activeTool: '',
  tabMru: [],
  dirtyTabIds: [],

  openTab: (toolId) => {
    const { tabs: currentTabs, tabMru } = get()
    const existing =
      tabMru
        .map((id) => currentTabs.find((tab) => tab.id === id))
        .find((tab) => tab?.toolId === toolId) ?? currentTabs.find((tab) => tab.toolId === toolId)
    if (existing) {
      // Tool already open — return to its most recently used instance.
      const activeTool = derivedActiveTool(currentTabs, existing.id)
      set({
        activeTabId: existing.id,
        activeTool,
        tabMru: touchMru(get().tabMru, existing.id, currentTabs),
      })
      persistTabs(currentTabs, existing.id)
      get().trackRecent(toolId)
    } else {
      get().openTabInstance(toolId)
    }
  },

  openTabInstance: (toolId) => {
    const id = crypto.randomUUID()
    const current = get().tabs
    const tab: WorkspaceTab = { id, toolId, stateKey: stateKeyFor(current, toolId, id) }
    const tabs = [...current, tab]
    set({ tabs, activeTabId: id, activeTool: toolId, tabMru: touchMru(get().tabMru, id, tabs) })
    persistTabs(tabs, id)
    get().trackRecent(toolId)
  },

  reorderTab: (tabId, toIndex) => {
    const { tabs, activeTabId } = get()
    const from = tabs.findIndex((t) => t.id === tabId)
    if (from === -1) return
    const moved = tabs[from]
    if (!moved) return
    // A drag is clamped to the tab's own block. Dropping an unpinned tab among
    // the pins would otherwise be undone by `sortPinnedFirst` on the next
    // mutation, which reads as the tab springing back for no visible reason —
    // better to refuse the move than to accept it and silently revert it.
    const pinnedCount = tabs.filter((tab) => tab.pinned).length
    const lower = moved.pinned ? 0 : pinnedCount
    const upper = moved.pinned ? pinnedCount - 1 : tabs.length - 1
    const to = Math.max(lower, Math.min(toIndex, upper))
    if (from === to) return
    const next = [...tabs]
    next.splice(from, 1)
    next.splice(to, 0, moved)
    set({ tabs: next })
    persistTabs(next, activeTabId)
  },

  toggleTabPinned: (tabId) => {
    const { tabs, activeTabId } = get()
    const target = tabs.find((tab) => tab.id === tabId)
    if (!target) return

    const rest = tabs.filter((tab) => tab.id !== tabId)
    const pinnedCount = rest.filter((tab) => tab.pinned).length
    // One insertion point serves both directions: counted among the *other*
    // tabs, index `pinnedCount` is the end of the pinned block when pinning
    // and the head of the unpinned block when unpinning. Either way the tab
    // lands on the near edge of the block it just joined, which is the least
    // it can move and still be in the right partition. Leaving an unpinned tab
    // where the pin had hoisted it would silently keep a reordering the user
    // never asked for and can no longer undo.
    const next = [...rest]
    next.splice(pinnedCount, 0, { ...target, pinned: !target.pinned })
    set({ tabs: next })
    persistTabs(next, activeTabId)
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === tabId)
    if (idx === -1) return
    const next = tabs.filter((t) => t.id !== tabId)
    let nextActiveId = activeTabId
    if (activeTabId === tabId) {
      // Prefer the tab before; fall back to the tab after; else null
      const candidate = next[idx - 1] ?? next[idx] ?? null
      nextActiveId = candidate?.id ?? null
    }
    const nextActiveTool = derivedActiveTool(next, nextActiveId)
    discardClosedState(tabs.filter((t) => t.id === tabId))
    // Surviving tabs keep their state keys. The bare key the closed tab held
    // is only up for grabs by a tab opened later, which is what makes closing
    // a tool and reopening it give you your work back.
    set({
      tabs: next,
      activeTabId: nextActiveId,
      activeTool: nextActiveTool,
      tabMru: touchMru(get().tabMru, nextActiveId, next),
      dirtyTabIds: pruneDirty(get().dirtyTabIds, next),
    })
    persistTabs(next, nextActiveId)
  },

  closeOtherTabs: (tabId) => {
    const { tabs } = get()
    if (!tabs.some((t) => t.id === tabId)) return // unknown id — bail
    // Pinning is a statement that a tab should stay put; "Close Others"
    // sweeping it away would make the pin worthless exactly when it matters.
    const survives = (t: WorkspaceTab) => t.id === tabId || !!t.pinned
    const next = tabs.filter(survives)
    if (next.length === tabs.length) return // nothing to close
    discardClosedState(tabs.filter((t) => !survives(t)))
    const nextActiveId = tabId
    set({
      tabs: next,
      activeTabId: nextActiveId,
      activeTool: derivedActiveTool(next, nextActiveId),
      tabMru: touchMru(get().tabMru, nextActiveId, next),
      dirtyTabIds: pruneDirty(get().dirtyTabIds, next),
    })
    persistTabs(next, nextActiveId)
  },

  closeTabsToRight: (tabId) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === tabId)
    if (idx === -1 || idx === tabs.length - 1) return // nothing to close
    // Pinned tabs to the right survive, for the same reason they survive
    // "Close Others".
    const doomed = tabs.slice(idx + 1).filter((t) => !t.pinned)
    if (doomed.length === 0) return
    const doomedIds = new Set(doomed.map((t) => t.id))
    const next = tabs.filter((t) => !doomedIds.has(t.id))
    discardClosedState(doomed)
    // If active tab was in the closed range, activate the anchor tab
    const nextActiveId = next.some((t) => t.id === activeTabId)
      ? activeTabId
      : (next[next.length - 1]?.id ?? null)
    set({
      tabs: next,
      activeTabId: nextActiveId,
      activeTool: derivedActiveTool(next, nextActiveId),
      tabMru: touchMru(get().tabMru, nextActiveId, next),
      dirtyTabIds: pruneDirty(get().dirtyTabIds, next),
    })
    persistTabs(next, nextActiveId)
  },

  setActiveTab: (tabId) => {
    const { tabs } = get()
    if (!tabs.some((t) => t.id === tabId)) return
    const activeTool = derivedActiveTool(tabs, tabId)
    set({ activeTabId: tabId, activeTool, tabMru: touchMru(get().tabMru, tabId, tabs) })
    persistTabs(tabs, tabId)
  },

  setTabDirty: (tabId, dirty) => {
    const { dirtyTabIds, tabs } = get()
    const already = dirtyTabIds.includes(tabId)
    if (already === dirty) return
    // Ignore unknown ids so a tool unmounting after its tab closed cannot
    // resurrect a flag that `pruneDirty` just dropped.
    if (dirty && !tabs.some((tab) => tab.id === tabId)) return
    set({
      dirtyTabIds: dirty ? [...dirtyTabIds, tabId] : dirtyTabIds.filter((id) => id !== tabId),
    })
  },

  restoreTabs: (tabs, activeTabId) => {
    // Sessions saved before tabs could be duplicated have no state keys.
    const keyed = sortPinnedFirst(assignStateKeys(tabs))
    const activeTool = derivedActiveTool(keyed, activeTabId)
    set({ tabs: keyed, activeTabId, activeTool, tabMru: touchMru([], activeTabId, keyed) })
    // No persist — restoreTabs is bootstrap-only
  },

  // --- Backward-compat ---
  setActiveTool: (toolId) => {
    get().openTab(toolId)
  },

  restoreActiveTool: (toolId) => {
    const tab: WorkspaceTab = { id: crypto.randomUUID(), toolId, stateKey: toolId }
    set({ tabs: [tab], activeTabId: tab.id, activeTool: toolId, tabMru: [tab.id] })
  },

  // --- Recents ---
  recentToolIds: [],
  trackRecent: (toolId) => {
    set((s) => ({
      recentToolIds: [toolId, ...s.recentToolIds.filter((id) => id !== toolId)].slice(
        0,
        MAX_RECENT
      ),
    }))
  },

  // --- UI overlays ---
  commandPaletteOpen: false,
  lastAction: null,
  toasts: [],
  settingsPanelOpen: false,
  pendingSendTo: null,
  shortcutsModalOpen: false,

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setLastAction: (message, type = 'info') =>
    set({ lastAction: { message, type, timestamp: Date.now() } }),
  clearLastAction: () => set({ lastAction: null }),

  addToast: (message, type = 'info') => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
  toggleSettingsPanel: () => set((s) => ({ settingsPanelOpen: !s.settingsPanelOpen })),

  setPendingSendTo: (content) => set({ pendingSendTo: content }),
  consumePendingSendTo: () => {
    const content = get().pendingSendTo
    if (content !== null) set({ pendingSendTo: null })
    return content
  },

  setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),
  toggleShortcutsModal: () => set((s) => ({ shortcutsModalOpen: !s.shortcutsModalOpen })),
}))
