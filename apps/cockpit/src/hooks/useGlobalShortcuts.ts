import { useCallback, useMemo } from 'react'
import { useKeyboardShortcut } from './useKeyboardShortcut'
import type { KeyCombo } from '@/lib/keybindings'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { TOOLS } from '@/app/tool-registry'
import { dispatchToolAction, supportsToolFileAction } from '@/lib/tool-actions'
import { openFileDialog } from '@/lib/file-io'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function useGlobalShortcuts(): void {
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const activeTool = useUiStore((s) => s.activeTool)
  const addToast = useUiStore((s) => s.addToast)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const update = useSettingsStore((s) => s.update)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const notesDrawerOpen = useSettingsStore((s) => s.notesDrawerOpen)
  const toggleSettingsPanel = useUiStore((s) => s.toggleSettingsPanel)
  const toggleShortcutsModal = useUiStore((s) => s.toggleShortcutsModal)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const tabs = useUiStore((s) => s.tabs)
  const activeTabId = useUiStore((s) => s.activeTabId)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const closeTab = useUiStore((s) => s.closeTab)

  const comboK = useMemo(() => ({ key: 'k', mod: true }) as const, [])
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

  const toggleSidebar = useCallback(async () => {
    await update('sidebarCollapsed', !sidebarCollapsed)
  }, [update, sidebarCollapsed])

  const toggleDrawer = useCallback(async () => {
    await update('notesDrawerOpen', !notesDrawerOpen)
  }, [update, notesDrawerOpen])

  const nextTool = useCallback(() => {
    if (!activeTool) return
    const idx = TOOLS.findIndex((t) => t.id === activeTool)
    const next = TOOLS[(idx + 1) % TOOLS.length]
    if (next) setActiveTool(next.id)
  }, [activeTool, setActiveTool])

  const prevTool = useCallback(() => {
    if (!activeTool) return
    const idx = TOOLS.findIndex((t) => t.id === activeTool)
    const prev = TOOLS[(idx - 1 + TOOLS.length) % TOOLS.length]
    if (prev) setActiveTool(prev.id)
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

  const openFile = useCallback(async () => {
    if (!supportsToolFileAction(activeTool, 'open-file')) {
      addToast('Open File is not supported by the active tool', 'error')
      return
    }
    try {
      const result = await openFileDialog()
      if (result) {
        dispatchToolAction({
          type: 'open-file',
          content: result.content,
          filename: result.filename,
        })
        addToast(`Opened ${result.filename}`, 'success')
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [activeTool, addToast])

  const saveFile = useCallback(() => {
    if (!supportsToolFileAction(activeTool, 'save-file')) {
      addToast('Save Output is not supported by the active tool', 'error')
      return
    }
    dispatchToolAction({ type: 'save-file' })
  }, [activeTool, addToast])

  const toggleAlwaysOnTop = useCallback(async () => {
    const win = getCurrentWindow()
    const next = !alwaysOnTop
    try {
      await win.setAlwaysOnTop(next)
    } catch {
      addToast('Failed to update window pin state', 'error')
      return
    }

    const persisted = await update('alwaysOnTop', next)
    if (!persisted) {
      try {
        await win.setAlwaysOnTop(alwaysOnTop)
      } catch {
        // Best-effort rollback; the settings store already reports the persistence failure.
      }
    }
  }, [alwaysOnTop, update, addToast])

  useKeyboardShortcut(comboK, toggleCommandPalette)
  useKeyboardShortcut(comboB, toggleSidebar)
  useKeyboardShortcut(comboShiftN, toggleDrawer)
  useKeyboardShortcut(comboShiftT, toggleTheme)
  useKeyboardShortcut(comboNext, nextTool)
  useKeyboardShortcut(comboPrev, prevTool)
  useKeyboardShortcut(comboEnter, execute)
  useKeyboardShortcut(comboShiftC, copyOutput)
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
  useKeyboardShortcut(comboO, openFile)
  useKeyboardShortcut(comboS, saveFile)
  useKeyboardShortcut(comboSlash, toggleShortcutsModal)
}
