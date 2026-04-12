import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useSettingsStore } from '../settings.store'
import { getSetting, setSetting } from '@/lib/db'
import { applyTheme } from '@/lib/theme'
import { useUiStore } from '@/stores/ui.store'
import { DEFAULT_SETTINGS } from '@/types/models'

vi.mock('@/lib/db', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))
vi.mock('@/lib/theme', () => ({ applyTheme: vi.fn() }))
vi.mock('@/stores/ui.store', () => ({
  useUiStore: { getState: vi.fn(() => ({ addToast: vi.fn() })) },
}))

beforeEach(() => {
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: false })
  vi.clearAllMocks()
})

describe('settings store initialization', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('starts with DEFAULT_SETTINGS and initialized: false', async () => {
    const { useSettingsStore } = await import('../settings.store')
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: false })
    const state = useSettingsStore.getState()
    expect(state.initialized).toBe(false)
    expect(state.theme).toBe(DEFAULT_SETTINGS.theme)
  })

  it('init() loads from getSetting, merges with DEFAULT_SETTINGS, sets initialized: true, calls applyTheme', async () => {
    const { useSettingsStore } = await import('../settings.store')
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: false })
    ;(getSetting as any).mockResolvedValue({ editorFontSize: 16 })

    await useSettingsStore.getState().init()

    const state = useSettingsStore.getState()
    expect(state.initialized).toBe(true)
    expect(state.editorFontSize).toBe(16)
    expect(state.theme).toBe(DEFAULT_SETTINGS.theme)

    expect(getSetting).toHaveBeenCalledWith('appSettings', {})
    expect(applyTheme).toHaveBeenCalledWith(DEFAULT_SETTINGS.theme)
  })

  it('init() is idempotent — calling it twice only calls getSetting once', async () => {
    const { useSettingsStore } = await import('../settings.store')
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: false })
    ;(getSetting as any).mockResolvedValue({ editorFontSize: 16 })

    const p1 = useSettingsStore.getState().init()
    const p2 = useSettingsStore.getState().init()

    await Promise.all([p1, p2])

    expect(getSetting).toHaveBeenCalledOnce()
  })
})

describe('settings store updates', () => {
  it('update() applies the change to store state immediately (optimistic)', async () => {
    ;(setSetting as any).mockResolvedValue(undefined)

    const promise = useSettingsStore.getState().update('editorFontSize', 18)

    // Check state before promise resolves (optimistic update)
    expect(useSettingsStore.getState().editorFontSize).toBe(18)

    await promise
  })

  it('update() persists full AppSettings object to setSetting', async () => {
    ;(setSetting as any).mockResolvedValue(undefined)

    await useSettingsStore.getState().update('editorFontSize', 18)

    expect(setSetting).toHaveBeenCalledWith('appSettings', {
      theme: DEFAULT_SETTINGS.theme,
      alwaysOnTop: DEFAULT_SETTINGS.alwaysOnTop,
      sidebarCollapsed: DEFAULT_SETTINGS.sidebarCollapsed,
      notesDrawerOpen: DEFAULT_SETTINGS.notesDrawerOpen,
      notesDrawerWidth: DEFAULT_SETTINGS.notesDrawerWidth,
      defaultIndentSize: DEFAULT_SETTINGS.defaultIndentSize,
      defaultTimezone: DEFAULT_SETTINGS.defaultTimezone,
      editorFontSize: 18,
      editorFont: DEFAULT_SETTINGS.editorFont,
      editorTheme: DEFAULT_SETTINGS.editorTheme,
      editorKeybindingMode: DEFAULT_SETTINGS.editorKeybindingMode,
      historyRetentionPerTool: DEFAULT_SETTINGS.historyRetentionPerTool,
      formatOnPaste: DEFAULT_SETTINGS.formatOnPaste,
      checkForUpdatesAutomatically: DEFAULT_SETTINGS.checkForUpdatesAutomatically,
      downloadUpdatesAutomatically: DEFAULT_SETTINGS.downloadUpdatesAutomatically,
      notifyWhenUpdateAvailable: DEFAULT_SETTINGS.notifyWhenUpdateAvailable,
    })
  })

  it("update('theme', value) calls applyTheme with the new theme", async () => {
    ;(setSetting as any).mockResolvedValue(undefined)

    await useSettingsStore.getState().update('theme', 'midnight')

    expect(applyTheme).toHaveBeenCalledWith('midnight')
  })

  it('update() reverts the optimistic change and calls addToast when setSetting throws', async () => {
    const mockAddToast = vi.fn()
    ;(useUiStore.getState as any).mockReturnValue({ addToast: mockAddToast })
    ;(setSetting as any).mockRejectedValue(new Error('DB Error'))

    const previousSize = useSettingsStore.getState().editorFontSize

    await useSettingsStore.getState().update('editorFontSize', 18)

    // State should be reverted
    expect(useSettingsStore.getState().editorFontSize).toBe(previousSize)
    expect(mockAddToast).toHaveBeenCalledWith('Failed to save setting: DB Error', 'error')
  })

  it('update() reverts theme and calls applyTheme with previous theme when setSetting throws', async () => {
    const mockAddToast = vi.fn()
    ;(useUiStore.getState as any).mockReturnValue({ addToast: mockAddToast })
    ;(setSetting as any).mockRejectedValue(new Error('DB Error'))

    const previousTheme = useSettingsStore.getState().theme

    await useSettingsStore.getState().update('theme', 'neon-brutalist')

    // applyTheme should be called with new theme first, then reverted
    expect(applyTheme).toHaveBeenNthCalledWith(1, 'neon-brutalist')
    expect(applyTheme).toHaveBeenNthCalledWith(2, previousTheme)

    expect(useSettingsStore.getState().theme).toBe(previousTheme)
  })

  it('toggleTheme() cycles through all themes in order, wrapping around', async () => {
    ;(setSetting as any).mockResolvedValue(undefined)

    // Set to 'system'
    useSettingsStore.setState({ theme: 'system' })
    await useSettingsStore.getState().toggleTheme()
    expect(useSettingsStore.getState().theme).toBe('midnight')

    await useSettingsStore.getState().toggleTheme()
    expect(useSettingsStore.getState().theme).toBe('warm-terminal')

    await useSettingsStore.getState().toggleTheme()
    expect(useSettingsStore.getState().theme).toBe('neon-brutalist')

    await useSettingsStore.getState().toggleTheme()
    expect(useSettingsStore.getState().theme).toBe('earth-code')

    await useSettingsStore.getState().toggleTheme()
    expect(useSettingsStore.getState().theme).toBe('cyber-luxe')

    await useSettingsStore.getState().toggleTheme()
    expect(useSettingsStore.getState().theme).toBe('soft-focus')

    await useSettingsStore.getState().toggleTheme()
    expect(useSettingsStore.getState().theme).toBe('system')
  })
})
