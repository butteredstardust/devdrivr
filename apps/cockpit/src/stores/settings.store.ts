import { create } from 'zustand'
import { type AppSettings, DEFAULT_SETTINGS, type Theme } from '@/types/models'
import { getSetting, setSetting } from '@/lib/db'
import { applyTheme } from '@/lib/theme'
import { useUiStore } from '@/stores/ui.store'

type SettingsStore = AppSettings & {
  initialized: boolean
  init: () => Promise<void>
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  toggleTheme: () => Promise<void>
}

// Promise guard prevents concurrent init() calls (StrictMode double-mount)
// from triggering duplicate applyTheme() repaints.
let initPromise: Promise<void> | null = null

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  ...DEFAULT_SETTINGS,
  initialized: false,

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const saved = await getSetting<Partial<AppSettings>>('appSettings', {})
        const merged = { ...DEFAULT_SETTINGS, ...saved }
        set({ ...merged, initialized: true })
        applyTheme(merged.theme)
      })()
    }
    return initPromise
  },

  update: async (key, value) => {
    const previousValue = get()[key]
    set({ [key]: value } as Partial<SettingsStore>)
    if (key === 'theme') {
      applyTheme(value as AppSettings['theme'])
    }
    const state = get()
    const settings: AppSettings = {
      theme: state.theme,
      alwaysOnTop: state.alwaysOnTop,
      sidebarCollapsed: state.sidebarCollapsed,
      notesDrawerOpen: state.notesDrawerOpen,
      notesDrawerWidth: state.notesDrawerWidth,
      defaultIndentSize: state.defaultIndentSize,
      defaultTimezone: state.defaultTimezone,
      editorFont: state.editorFont,
      editorFontSize: state.editorFontSize,
      editorTheme: state.editorTheme,
      editorKeybindingMode: state.editorKeybindingMode,
      historyRetentionPerTool: state.historyRetentionPerTool,
      formatOnPaste: state.formatOnPaste,
    }
    try {
      await setSetting('appSettings', settings)
    } catch (err) {
      // Revert optimistic update
      set({ [key]: previousValue } as Partial<SettingsStore>)
      if (key === 'theme') {
        applyTheme(previousValue as AppSettings['theme'])
      }
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save setting: ' + msg, 'error')
    }
  },

  toggleTheme: async () => {
    const current = get().theme
    const ALL: Theme[] = [
      'system',
      'midnight',
      'warm-terminal',
      'neon-brutalist',
      'earth-code',
      'cyber-luxe',
      'soft-focus',
    ]
    const idx = ALL.indexOf(current)
    const nextIdx = idx === -1 || idx === ALL.length - 1 ? 0 : idx + 1
    await get().update('theme', ALL[nextIdx]!)
  },
}))
