import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useSettingsStore } from '../settings.store'
import { getSetting, setSetting } from '@/lib/db'
import { applyTheme } from '@/lib/theme'
import { useUiStore } from '@/stores/ui.store'
import { DEFAULT_SETTINGS, type AppSettings } from '@/types/models'
import { expectInitRejectionRecovers } from './init-rejection-helper'

vi.mock('@/lib/db', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return { ...actual, applyTheme: vi.fn() }
})
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

  it('init() clears the cached promise on rejection so a later call retries', async () => {
    const { useSettingsStore } = await import('../settings.store')
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: false })

    await expectInitRejectionRecovers({
      runInit: () => useSettingsStore.getState().init(),
      arrangeFailure: () => {
        ;(getSetting as any).mockRejectedValueOnce(new Error('db locked'))
      },
      arrangeSuccess: () => {
        ;(getSetting as any).mockResolvedValueOnce({ editorFontSize: 16 })
      },
      rejectMessage: 'db locked',
      assertAfterFailure: () => {
        expect(useSettingsStore.getState().initialized).toBe(false)
      },
      assertAfterSuccess: () => {
        expect(useSettingsStore.getState().initialized).toBe(true)
      },
      getCallCount: () => (getSetting as any).mock.calls.length,
    })
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

    const persisted = await useSettingsStore.getState().update('editorFontSize', 18)

    expect(setSetting).toHaveBeenCalledWith('appSettings', {
      ...DEFAULT_SETTINGS,
      editorFontSize: 18,
    })
    expect(persisted).toBe(true)
  })

  it('update() persists every AppSettings key — no field is silently dropped', async () => {
    ;(setSetting as any).mockResolvedValue(undefined)

    await useSettingsStore.getState().update('editorFontSize', 18)

    const persistedSettings = (setSetting as any).mock.calls[0][1]
    expect(Object.keys(persistedSettings).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort())
  })

  it('every AppSettings key round-trips through update() then init()', async () => {
    ;(setSetting as any).mockResolvedValue(undefined)

    const overrides: Partial<AppSettings> = {
      theme: 'midnight',
      alwaysOnTop: true,
      sidebarCollapsed: true,
      collapsedSidebarGroups: ['code'],
      openedSidebarGroups: ['data'],
      pinnedToolIds: ['json-formatter'],
      notesDrawerOpen: true,
      notesDrawerWidth: 400,
      defaultIndentSize: 4,
      defaultTimezone: 'America/New_York',
      editorFont: 'Fira Code',
      editorFontSize: 20,
      editorTheme: 'cockpit-light',
      historyRetentionPerTool: 100,
      formatOnPaste: true,
      checkForUpdatesAutomatically: false,
      downloadUpdatesAutomatically: true,
      notifyWhenUpdateAvailable: false,
    }

    for (const [key, value] of Object.entries(overrides)) {
      await useSettingsStore.getState().update(key as keyof AppSettings, value as never)
    }

    // Capture what was actually persisted across all update() calls, merged in order.
    const persistedCalls = (setSetting as any).mock.calls as [string, AppSettings][]
    const lastCall = persistedCalls.at(-1)
    if (!lastCall) throw new Error('setSetting was never called')
    const lastPersisted = lastCall[1]

    // Now simulate a fresh init() picking that persisted blob back up.
    ;(getSetting as any).mockResolvedValue(lastPersisted)
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: false })
    await useSettingsStore.getState().init()

    const state = useSettingsStore.getState()
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
      expect(state[key]).toEqual(lastPersisted[key])
    }
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

    const persisted = await useSettingsStore.getState().update('editorFontSize', 18)

    // State should be reverted
    expect(useSettingsStore.getState().editorFontSize).toBe(previousSize)
    expect(mockAddToast).toHaveBeenCalledWith('Failed to save setting: DB Error', 'error')
    expect(persisted).toBe(false)
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

    const expected = [
      'midnight',
      'warm-terminal',
      'neon-brutalist',
      'earth-code',
      'cyber-luxe',
      'soft-focus',
      'tokyo-night',
      'tokyo-night-light',
      'catppuccin-latte',
      'catppuccin-frappe',
      'catppuccin-macchiato',
      'catppuccin-mocha',
      'dracula',
      'monokai',
      'nord',
      'night-owl',
      'github-dark',
      'github-light',
      'solarized-dark',
      'solarized-light',
      'tomorrow-night',
      'oceanic-next',
      'inked',
      'urban-nocturne',
      'amethyst-haze',
      'lapis-velvet',
      'amethyst-mint',
      'fireside',
      'marina',
      'pearl',
      'yacht-club',
      'system', // wraps back
    ]

    useSettingsStore.setState({ theme: 'system' })
    for (const theme of expected) {
      await useSettingsStore.getState().toggleTheme()
      expect(useSettingsStore.getState().theme).toBe(theme)
    }
  })
})
