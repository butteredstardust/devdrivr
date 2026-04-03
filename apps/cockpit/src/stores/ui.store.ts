import { create } from 'zustand'
import { setSetting } from '@/lib/db'

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
  activeTool: string
  commandPaletteOpen: boolean
  lastAction: LastAction | null
  toasts: ToastItem[]
  settingsPanelOpen: boolean
  pendingSendTo: string | null
  recentToolIds: string[]

  setActiveTool: (toolId: string) => void
  restoreActiveTool: (toolId: string) => void
  trackRecent: (toolId: string) => void
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
  shortcutsModalOpen: boolean
  setShortcutsModalOpen: (open: boolean) => void
  toggleShortcutsModal: () => void
}

export const useUiStore = create<UiStore>()((set, get) => ({
  activeTool: 'uuid-generator',
  commandPaletteOpen: false,
  lastAction: null,
  toasts: [],
  settingsPanelOpen: false,
  pendingSendTo: null,
  shortcutsModalOpen: false,
  recentToolIds: [],

  setActiveTool: (toolId) => {
    set({ activeTool: toolId })
    get().trackRecent(toolId)
    setSetting('activeTool', toolId).catch(() => {})
  },

  // Restore without polluting recents (used during app bootstrap)
  restoreActiveTool: (toolId) => {
    set({ activeTool: toolId })
  },

  trackRecent: (toolId) => {
    set((s) => ({
      recentToolIds: [toolId, ...s.recentToolIds.filter((id) => id !== toolId)].slice(
        0,
        MAX_RECENT
      ),
    }))
  },
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
