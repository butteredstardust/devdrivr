import { create } from 'zustand'

type LastAction = {
  message: string
  type: 'success' | 'error' | 'info'
  timestamp: number
}

type UiStore = {
  activeTool: string
  commandPaletteOpen: boolean
  lastAction: LastAction | null

  setActiveTool: (toolId: string) => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setLastAction: (message: string, type?: LastAction['type']) => void
}

export const useUiStore = create<UiStore>()((set) => ({
  activeTool: 'uuid-generator',
  commandPaletteOpen: false,
  lastAction: null,

  setActiveTool: (toolId) => set({ activeTool: toolId }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setLastAction: (message, type = 'info') =>
    set({ lastAction: { message, type, timestamp: Date.now() } }),
}))
