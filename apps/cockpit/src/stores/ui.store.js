import { create } from 'zustand';
export const useUiStore = create()((set, get) => ({
    activeTool: 'uuid-generator',
    commandPaletteOpen: false,
    lastAction: null,
    toasts: [],
    settingsPanelOpen: false,
    pendingSendTo: null,
    setActiveTool: (toolId) => set({ activeTool: toolId }),
    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
    setLastAction: (message, type = 'info') => set({ lastAction: { message, type, timestamp: Date.now() } }),
    addToast: (message, type = 'info') => {
        const id = crypto.randomUUID();
        set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
        setTimeout(() => {
            set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, 3000);
    },
    removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
    toggleSettingsPanel: () => set((s) => ({ settingsPanelOpen: !s.settingsPanelOpen })),
    setPendingSendTo: (content) => set({ pendingSendTo: content }),
    consumePendingSendTo: () => {
        const content = get().pendingSendTo;
        if (content !== null)
            set({ pendingSendTo: null });
        return content;
    },
}));
