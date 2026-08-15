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

  // --- Tab actions ---
  /** Open tool in a new tab, or focus the existing tab if already open. */
  openTab: (toolId: string) => void
  /**
   * Open another tab of a tool that is already open. Deliberately separate
   * from `openTab`: clicking a tool in the sidebar should return you to your
   * work, not fork it, so duplicating stays an explicit request.
   */
  openTabInstance: (toolId: string) => void
  /** Move a tab to a new index, for drag reordering. */
  reorderTab: (tabId: string, toIndex: number) => void
  /** Close a tab by its tab id. Activates adjacent tab if it was active. */
  closeTab: (tabId: string) => void
  /** Close every tab except the one with the given tab id. */
  closeOtherTabs: (tabId: string) => void
  /** Close all tabs to the right of the given tab id. */
  closeTabsToRight: (tabId: string) => void
  /** Switch the active tab without opening a new one. */
  setActiveTab: (tabId: string) => void
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
    const to = Math.max(0, Math.min(toIndex, tabs.length - 1))
    if (from === -1 || from === to) return
    const next = [...tabs]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    next.splice(to, 0, moved)
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
    })
    persistTabs(next, nextActiveId)
  },

  closeOtherTabs: (tabId) => {
    const { tabs } = get()
    if (!tabs.some((t) => t.id === tabId)) return // unknown id — bail
    const next = tabs.filter((t) => t.id === tabId)
    if (next.length === tabs.length) return // nothing to close
    discardClosedState(tabs.filter((t) => t.id !== tabId))
    const nextActiveId = next[0]?.id ?? null
    set({
      tabs: next,
      activeTabId: nextActiveId,
      activeTool: derivedActiveTool(next, nextActiveId),
      tabMru: touchMru(get().tabMru, nextActiveId, next),
    })
    persistTabs(next, nextActiveId)
  },

  closeTabsToRight: (tabId) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === tabId)
    if (idx === -1 || idx === tabs.length - 1) return // nothing to close
    const next = tabs.slice(0, idx + 1)
    discardClosedState(tabs.slice(idx + 1))
    // If active tab was in the closed range, activate the anchor tab
    const nextActiveId = next.some((t) => t.id === activeTabId)
      ? activeTabId
      : (next[next.length - 1]?.id ?? null)
    set({
      tabs: next,
      activeTabId: nextActiveId,
      activeTool: derivedActiveTool(next, nextActiveId),
      tabMru: touchMru(get().tabMru, nextActiveId, next),
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

  restoreTabs: (tabs, activeTabId) => {
    // Sessions saved before tabs could be duplicated have no state keys.
    const keyed = assignStateKeys(tabs)
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
