import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '@/types/models';
import { getSetting, setSetting } from '@/lib/db';
import { applyTheme } from '@/lib/theme';
export const useSettingsStore = create()((set, get) => ({
    ...DEFAULT_SETTINGS,
    initialized: false,
    init: async () => {
        const saved = await getSetting('appSettings', {});
        const merged = { ...DEFAULT_SETTINGS, ...saved };
        set({ ...merged, initialized: true });
        applyTheme(merged.theme);
    },
    update: async (key, value) => {
        set({ [key]: value });
        const state = get();
        const settings = {
            theme: state.theme,
            alwaysOnTop: state.alwaysOnTop,
            sidebarCollapsed: state.sidebarCollapsed,
            notesDrawerOpen: state.notesDrawerOpen,
            defaultIndentSize: state.defaultIndentSize,
            defaultTimezone: state.defaultTimezone,
            editorFontSize: state.editorFontSize,
            editorKeybindingMode: state.editorKeybindingMode,
            historyRetentionPerTool: state.historyRetentionPerTool,
            formatOnPaste: state.formatOnPaste,
        };
        await setSetting('appSettings', settings);
        if (key === 'theme') {
            applyTheme(value);
        }
    },
    toggleTheme: async () => {
        const current = get().theme;
        const next = current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark';
        await get().update('theme', next);
    },
}));
