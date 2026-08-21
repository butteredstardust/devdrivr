import { create } from 'zustand'
import { type AppSettings, DEFAULT_SETTINGS, type Theme } from '@/types/models'
import { getSetting, setSetting } from '@/lib/db'
import { applyTheme, ALL_THEMES } from '@/lib/theme'
import { useUiStore } from '@/stores/ui.store'

type SettingsStore = AppSettings & {
  initialized: boolean
  init: () => Promise<void>
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<boolean>
  toggleTheme: () => Promise<void>
}

// Exhaustiveness contract: this is a Record<keyof AppSettings, true>, so adding a
// field to AppSettings without listing it here fails `tsc --noEmit`. APP_SETTINGS_KEYS
// is derived from its keys, which is what pickAppSettings() uses to build the persisted
// object — that keeps the persisted payload and the type in permanent sync.
const APP_SETTINGS_KEY_MAP: Record<keyof AppSettings, true> = {
  theme: true,
  shellStyle: true,
  alwaysOnTop: true,
  sidebarCollapsed: true,
  collapsedSidebarGroups: true,
  openedSidebarGroups: true,
  pinnedToolIds: true,
  sidebarWidth: true,
  notesDrawerOpen: true,
  notesDrawerWidth: true,
  defaultIndentSize: true,
  defaultTimezone: true,
  editorFont: true,
  editorFontSize: true,
  editorTheme: true,
  editorKeybindingMode: true,
  historyRetentionPerTool: true,
  formatOnPaste: true,
  checkForUpdatesAutomatically: true,
  downloadUpdatesAutomatically: true,
  notifyWhenUpdateAvailable: true,
}

const APP_SETTINGS_KEYS = Object.keys(APP_SETTINGS_KEY_MAP) as (keyof AppSettings)[]

// Generic single-key assignment is what lets TS accept `target[key] = source[key]` —
// binding K per call keeps the LHS/RHS types linked, unlike indexing with a
// keyof-union inside a loop body (which widens to `never`).
function assignAppSettingsKey<K extends keyof AppSettings>(
  target: AppSettings,
  source: AppSettings,
  key: K
): void {
  target[key] = source[key]
}

function pickAppSettings(state: AppSettings): AppSettings {
  const result = {} as AppSettings
  for (const key of APP_SETTINGS_KEYS) {
    assignAppSettingsKey(result, state, key)
  }
  return result
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
        if (merged.editorKeybindingMode !== 'standard') merged.editorKeybindingMode = 'standard'
        set({ ...merged, initialized: true })
        applyTheme(merged.theme)
      })().catch((err: unknown) => {
        // Clear the cached promise on failure so a transient error (e.g. a
        // locked database at launch) doesn't latch the app in a broken state
        // for the rest of the process lifetime — a later init() call retries.
        initPromise = null
        throw err
      })
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
    const settings = pickAppSettings(state)
    try {
      await setSetting('appSettings', settings)
      return true
    } catch (err) {
      // Revert optimistic update
      set({ [key]: previousValue } as Partial<SettingsStore>)
      if (key === 'theme') {
        applyTheme(previousValue as AppSettings['theme'])
      }
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save setting: ' + msg, 'error')
      return false
    }
  },

  toggleTheme: async () => {
    const current = get().theme
    const ALL: Theme[] = ['system', ...ALL_THEMES]
    const idx = ALL.indexOf(current)
    const nextIdx = idx === -1 || idx === ALL.length - 1 ? 0 : idx + 1
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await get().update('theme', ALL[nextIdx]!) // safe: nextIdx is always a valid index (0 or idx+1 where idx < ALL.length-1)
  },
}))
