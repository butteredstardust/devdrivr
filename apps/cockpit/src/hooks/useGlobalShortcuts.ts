import { useCallback, useMemo } from 'react'
import { useKeyboardShortcut } from './useKeyboardShortcut'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { TOOLS } from '@/app/tool-registry'
import { dispatchToolAction } from '@/lib/tool-actions'
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
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)

  const comboK = useMemo(() => ({ key: 'k', mod: true } as const), [])
  const comboB = useMemo(() => ({ key: 'b', mod: true } as const), [])
  const comboShiftN = useMemo(() => ({ key: 'n', mod: true, shift: true } as const), [])
  const comboShiftT = useMemo(() => ({ key: 't', mod: true, shift: true } as const), [])
  const comboNext = useMemo(() => ({ key: ']', mod: true } as const), [])
  const comboPrev = useMemo(() => ({ key: '[', mod: true } as const), [])
  const comboEnter = useMemo(() => ({ key: 'Enter', mod: true } as const), [])
  const comboShiftC = useMemo(() => ({ key: 'c', mod: true, shift: true } as const), [])
  const combo1 = useMemo(() => ({ key: '1', mod: true } as const), [])
  const combo2 = useMemo(() => ({ key: '2', mod: true } as const), [])
  const combo3 = useMemo(() => ({ key: '3', mod: true } as const), [])
  const comboComma = useMemo(() => ({ key: ',', mod: true } as const), [])
  const comboShiftP = useMemo(() => ({ key: 'p', mod: true, shift: true } as const), [])
  const comboO = useMemo(() => ({ key: 'o', mod: true } as const), [])
  const comboS = useMemo(() => ({ key: 's', mod: true } as const), [])

  const toggleSidebar = useCallback(
    () => update('sidebarCollapsed', !sidebarCollapsed),
    [update, sidebarCollapsed]
  )

  const toggleDrawer = useCallback(
    () => update('notesDrawerOpen', !notesDrawerOpen),
    [update, notesDrawerOpen]
  )

  const nextTool = useCallback(() => {
    const idx = TOOLS.findIndex((t) => t.id === activeTool)
    const next = TOOLS[(idx + 1) % TOOLS.length]
    if (next) setActiveTool(next.id)
  }, [activeTool, setActiveTool])

  const prevTool = useCallback(() => {
    const idx = TOOLS.findIndex((t) => t.id === activeTool)
    const prev = TOOLS[(idx - 1 + TOOLS.length) % TOOLS.length]
    if (prev) setActiveTool(prev.id)
  }, [activeTool, setActiveTool])

  const execute = useCallback(() => dispatchToolAction({ type: 'execute' }), [])
  const copyOutput = useCallback(() => dispatchToolAction({ type: 'copy-output' }), [])
  const switchTab1 = useCallback(() => dispatchToolAction({ type: 'switch-tab', tab: 0 }), [])
  const switchTab2 = useCallback(() => dispatchToolAction({ type: 'switch-tab', tab: 1 }), [])
  const switchTab3 = useCallback(() => dispatchToolAction({ type: 'switch-tab', tab: 2 }), [])

  const openFile = useCallback(async () => {
    const result = await openFileDialog()
    if (result) {
      dispatchToolAction({ type: 'open-file', content: result.content, filename: result.filename })
      addToast(`Opened ${result.filename}`, 'success')
    }
  }, [addToast])

  const saveFile = useCallback(() => {
    dispatchToolAction({ type: 'save-file' })
  }, [])

  const toggleAlwaysOnTop = useCallback(() => {
    const win = getCurrentWindow()
    const next = !alwaysOnTop
    win.setAlwaysOnTop(next)
    update('alwaysOnTop', next)
  }, [alwaysOnTop, update])

  useKeyboardShortcut(comboK, toggleCommandPalette)
  useKeyboardShortcut(comboB, toggleSidebar)
  useKeyboardShortcut(comboShiftN, toggleDrawer)
  useKeyboardShortcut(comboShiftT, toggleTheme)
  useKeyboardShortcut(comboNext, nextTool)
  useKeyboardShortcut(comboPrev, prevTool)
  useKeyboardShortcut(comboEnter, execute)
  useKeyboardShortcut(comboShiftC, copyOutput)
  useKeyboardShortcut(combo1, switchTab1)
  useKeyboardShortcut(combo2, switchTab2)
  useKeyboardShortcut(combo3, switchTab3)
  useKeyboardShortcut(comboComma, toggleSettingsPanel)
  useKeyboardShortcut(comboShiftP, toggleAlwaysOnTop)
  useKeyboardShortcut(comboO, openFile)
  useKeyboardShortcut(comboS, saveFile)
}
