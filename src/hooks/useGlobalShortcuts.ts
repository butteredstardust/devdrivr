import { useCallback, useMemo } from 'react'
import { useKeyboardShortcut } from './useKeyboardShortcut'
import { useMruTabSwitcher } from './useMruTabSwitcher'
import type { KeyCombo } from '@/lib/keybindings'
import { useUiStore } from '@/stores/ui.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useSettingsStore } from '@/stores/settings.store'
import { dispatchToolAction } from '@/lib/tool-actions'
import { adjacentToolId, openFileForTool, saveFileForTool } from '@/lib/shell-actions'
import { detectPlatform } from '@/lib/platform'
import { toggleNativeWindowFullscreen } from '@/lib/native-window'
import { setAlwaysOnTop } from '@/lib/always-on-top'

// These shortcuts act on the active tool, so they must not fire from inside a dialog.
const TARGETS_TOOL = { targetsTool: true } as const

export function useGlobalShortcuts(): void {
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const setActiveTool = useWorkspaceStore((s) => s.setActiveTool)
  const activeTool = useWorkspaceStore((s) => s.activeTool)
  const addToast = useUiStore((s) => s.addToast)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const update = useSettingsStore((s) => s.update)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const notesDrawerOpen = useSettingsStore((s) => s.notesDrawerOpen)
  const toggleSettingsPanel = useUiStore((s) => s.toggleSettingsPanel)
  const toggleShortcutsModal = useUiStore((s) => s.toggleShortcutsModal)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab)
  const closeTab = useWorkspaceStore((s) => s.closeTab)

  const comboK = useMemo(() => ({ key: 'k', mod: true }) as const, [])
  const comboT = useMemo(() => ({ key: 't', mod: true }) as const, [])
  const comboB = useMemo(() => ({ key: 'b', mod: true }) as const, [])
  const comboShiftN = useMemo(() => ({ key: 'n', mod: true, shift: true }) as const, [])
  const comboShiftT = useMemo(() => ({ key: 't', mod: true, shift: true }) as const, [])
  const comboNext = useMemo(() => ({ key: ']', mod: true }) as const, [])
  const comboPrev = useMemo(() => ({ key: '[', mod: true }) as const, [])
  const comboEnter = useMemo(() => ({ key: 'Enter', mod: true }) as const, [])
  const comboShiftC = useMemo(() => ({ key: 'c', mod: true, shift: true }) as const, [])
  // Digit 1-9 combos for switching workspace tabs, generated rather than hand-listed.
  const digitCombos = useMemo<KeyCombo[]>(
    () => Array.from({ length: 9 }, (_, i) => ({ key: String(i + 1), mod: true })),
    []
  )
  const comboComma = useMemo(() => ({ key: ',', mod: true }) as const, [])
  const comboShiftP = useMemo(() => ({ key: 'p', mod: true, shift: true }) as const, [])
  const comboO = useMemo(() => ({ key: 'o', mod: true }) as const, [])
  const comboS = useMemo(() => ({ key: 's', mod: true }) as const, [])
  const comboSlash = useMemo(() => ({ key: '/', mod: true }) as const, [])
  const comboW = useMemo(() => ({ key: 'w', mod: true }) as const, [])
  const comboFullscreen = useMemo<KeyCombo>(
    () =>
      detectPlatform() === 'mac'
        ? { key: 'f', mod: true, ctrl: true }
        : { key: 'F11', allowInEditable: true },
    []
  )

  const openNewTabPalette = useCallback(() => {
    toggleCommandPalette('new-tab')
  }, [toggleCommandPalette])

  const toggleSidebar = useCallback(async () => {
    await update('sidebarCollapsed', !sidebarCollapsed)
  }, [update, sidebarCollapsed])

  const toggleDrawer = useCallback(async () => {
    await update('notesDrawerOpen', !notesDrawerOpen)
  }, [update, notesDrawerOpen])

  const nextTool = useCallback(() => {
    const next = adjacentToolId(activeTool, 1)
    if (next) setActiveTool(next)
  }, [activeTool, setActiveTool])

  const prevTool = useCallback(() => {
    const prev = adjacentToolId(activeTool, -1)
    if (prev) setActiveTool(prev)
  }, [activeTool, setActiveTool])

  const execute = useCallback(() => dispatchToolAction({ type: 'execute' }), [])
  const copyOutput = useCallback(() => dispatchToolAction({ type: 'copy-output' }), [])

  const switchWorkspaceTabAt = useCallback(
    (index: number) => {
      const tab = tabs[index]
      if (tab) setActiveTab(tab.id)
    },
    [tabs, setActiveTab]
  )

  const closeCurrentTab = useCallback(() => {
    if (activeTabId) closeTab(activeTabId)
  }, [activeTabId, closeTab])

  const toggleFullscreen = useCallback(async () => {
    await toggleNativeWindowFullscreen()
  }, [])

  const openFile = useCallback(() => openFileForTool(activeTool, addToast), [activeTool, addToast])

  const saveFile = useCallback(() => saveFileForTool(activeTool, addToast), [activeTool, addToast])

  const toggleAlwaysOnTop = useCallback(async () => {
    const next = !alwaysOnTop
    try {
      await setAlwaysOnTop(next)
    } catch {
      addToast('Failed to update window pin state', 'error')
    }
  }, [alwaysOnTop, addToast])

  useKeyboardShortcut(comboK, toggleCommandPalette)
  useKeyboardShortcut(comboT, openNewTabPalette)
  useKeyboardShortcut(comboB, toggleSidebar)
  useKeyboardShortcut(comboShiftN, toggleDrawer)
  useKeyboardShortcut(comboShiftT, toggleTheme)
  useKeyboardShortcut(comboNext, nextTool)
  useKeyboardShortcut(comboPrev, prevTool)
  useKeyboardShortcut(comboEnter, execute, TARGETS_TOOL)
  useKeyboardShortcut(comboShiftC, copyOutput, TARGETS_TOOL)
  // Fixed-length loop over a constant-size array (always 9 elements, built by
  // Array.from above) — the number and order of hook calls is stable across
  // renders, so an unconditional loop here is safe despite the rules-of-hooks lint.
  for (let i = 0; i < 9; i++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks, @typescript-eslint/no-non-null-assertion -- fixed-length loop (always 9 entries), safe
    useKeyboardShortcut(digitCombos[i]!, () => switchWorkspaceTabAt(i))
  }
  useKeyboardShortcut(comboW, closeCurrentTab)
  useKeyboardShortcut(comboComma, toggleSettingsPanel)
  useKeyboardShortcut(comboShiftP, toggleAlwaysOnTop)
  useKeyboardShortcut(comboO, openFile, TARGETS_TOOL)
  useKeyboardShortcut(comboS, saveFile, TARGETS_TOOL)
  useKeyboardShortcut(comboSlash, toggleShortcutsModal)
  useKeyboardShortcut(comboFullscreen, toggleFullscreen)
  useMruTabSwitcher()
}
