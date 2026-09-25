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

export type CommandPaletteIntent = 'switch' | 'new-tab'

type UiStore = {
  commandPaletteOpen: boolean
  /**
   * Defines how the command palette opens a selected tool.
   * `switch` focuses an open tab. `new-tab` opens another instance. Closing the palette resets this value to `switch`.
   */
  commandPaletteIntent: CommandPaletteIntent
  lastAction: LastAction | null
  toasts: ToastItem[]
  settingsPanelOpen: boolean
  pendingSendTo: string | null
  shortcutsModalOpen: boolean
  setCommandPaletteOpen: (open: boolean, intent?: CommandPaletteIntent) => void
  toggleCommandPalette: (intent?: CommandPaletteIntent) => void
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

export const useUiStore = create<UiStore>()((set, get) => ({
  commandPaletteOpen: false,
  commandPaletteIntent: 'switch',
  lastAction: null,
  toasts: [],
  settingsPanelOpen: false,
  pendingSendTo: null,
  shortcutsModalOpen: false,
  setCommandPaletteOpen: (open, intent = 'switch') =>
    set({ commandPaletteOpen: open, commandPaletteIntent: open ? intent : 'switch' }),
  toggleCommandPalette: (intent = 'switch') =>
    set((state) => {
      const open = !state.commandPaletteOpen
      return { commandPaletteOpen: open, commandPaletteIntent: open ? intent : 'switch' }
    }),
  setLastAction: (message, type = 'info') =>
    set({ lastAction: { message, type, timestamp: Date.now() } }),
  clearLastAction: () => set({ lastAction: null }),
  addToast: (message, type = 'info') => {
    // A repeated failure, such as every history write while the database is down, shows once.
    // Error toasts stay until dismissal, so duplicates would pile up.
    if (get().toasts.some((toast) => toast.message === message && toast.type === type)) return
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    // Keep errors until dismissal because users need time to understand and resolve them. Remove other feedback after three seconds.
    if (type === 'error') return
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
    }, 3000)
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
  toggleSettingsPanel: () => set((state) => ({ settingsPanelOpen: !state.settingsPanelOpen })),
  setPendingSendTo: (content) => set({ pendingSendTo: content }),
  consumePendingSendTo: () => {
    const content = get().pendingSendTo
    if (content !== null) set({ pendingSendTo: null })
    return content
  },
  setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),
  toggleShortcutsModal: () => set((state) => ({ shortcutsModalOpen: !state.shortcutsModalOpen })),
}))
