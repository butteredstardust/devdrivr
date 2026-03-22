import { create } from 'zustand'

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

  setActiveTool: (toolId: string) => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setLastAction: (message: string, type?: LastAction['type']) => void
  addToast: (message: string, type?: ToastItem['type']) => void
  removeToast: (id: string) => void
  setSettingsPanelOpen: (open: boolean) => void
  toggleSettingsPanel: () => void
  setPendingSendTo: (content: string | null) => void
  consumePendingSendTo: () => string | null
}

export const useUiStore = create<UiStore>()((set, get) => ({
  activeTool: 'uuid-generator',
  commandPaletteOpen: false,
  lastAction: null,
  toasts: [],
  settingsPanelOpen: false,
  pendingSendTo: null,

  setActiveTool: (toolId) => set({ activeTool: toolId }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setLastAction: (message, type = 'info') =>
    set({ lastAction: { message, type, timestamp: Date.now() } }),

  addToast: (message, type = 'info') => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3000)
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
  toggleSettingsPanel: () => set((s) => ({ settingsPanelOpen: !s.settingsPanelOpen })),

  setPendingSendTo: (content) => set({ pendingSendTo: content }),
  consumePendingSendTo: () => {
    const content = get().pendingSendTo
    if (content !== null) set({ pendingSendTo: null })
    return content
  },
}))
