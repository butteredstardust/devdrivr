import { create } from 'zustand'
import { setSetting } from '@/lib/db'
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

  // --- Tab actions ---
  /** Open tool in a new tab, or focus the existing tab if already open. */
  openTab: (toolId: string) => void
  /** Close a tab by its tab id. Activates adjacent tab if it was active. */
  closeTab: (tabId: string) => void
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

export const useUiStore = create<UiStore>()((set, get) => ({
  // --- Tab state ---
  tabs: [],
  activeTabId: null,
  activeTool: '',

  openTab: (toolId) => {
    const existing = get().tabs.find((t) => t.toolId === toolId)
    if (existing) {
      // Tool already open — just focus it
      const activeTool = derivedActiveTool(get().tabs, existing.id)
      set({ activeTabId: existing.id, activeTool })
      persistTabs(get().tabs, existing.id)
    } else {
      const tab: WorkspaceTab = { id: crypto.randomUUID(), toolId }
      const tabs = [...get().tabs, tab]
      set({ tabs, activeTabId: tab.id, activeTool: toolId })
      persistTabs(tabs, tab.id)
    }
    get().trackRecent(toolId)
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
    set({ tabs: next, activeTabId: nextActiveId, activeTool: nextActiveTool })
    persistTabs(next, nextActiveId)
  },

  setActiveTab: (tabId) => {
    const { tabs } = get()
    if (!tabs.some((t) => t.id === tabId)) return
    const activeTool = derivedActiveTool(tabs, tabId)
    set({ activeTabId: tabId, activeTool })
    persistTabs(tabs, tabId)
  },

  restoreTabs: (tabs, activeTabId) => {
    const activeTool = derivedActiveTool(tabs, activeTabId)
    set({ tabs, activeTabId, activeTool })
    // No persist — restoreTabs is bootstrap-only
  },

  // --- Backward-compat ---
  setActiveTool: (toolId) => {
    get().openTab(toolId)
  },

  restoreActiveTool: (toolId) => {
    const tab: WorkspaceTab = { id: crypto.randomUUID(), toolId }
    set({ tabs: [tab], activeTabId: tab.id, activeTool: toolId })
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
