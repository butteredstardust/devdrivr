import { useCallback, useMemo } from 'react'
import { useKeyboardShortcut } from './useKeyboardShortcut'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { TOOLS } from '@/app/tool-registry'

export function useGlobalShortcuts(): void {
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const activeTool = useUiStore((s) => s.activeTool)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const update = useSettingsStore((s) => s.update)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const notesDrawerOpen = useSettingsStore((s) => s.notesDrawerOpen)

  const comboK = useMemo(() => ({ key: 'k', mod: true } as const), [])
  const comboB = useMemo(() => ({ key: 'b', mod: true } as const), [])
  const comboShiftN = useMemo(() => ({ key: 'n', mod: true, shift: true } as const), [])
  const comboShiftT = useMemo(() => ({ key: 't', mod: true, shift: true } as const), [])
  const comboNext = useMemo(() => ({ key: ']', mod: true } as const), [])
  const comboPrev = useMemo(() => ({ key: '[', mod: true } as const), [])

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

  useKeyboardShortcut(comboK, toggleCommandPalette)
  useKeyboardShortcut(comboB, toggleSidebar)
  useKeyboardShortcut(comboShiftN, toggleDrawer)
  useKeyboardShortcut(comboShiftT, toggleTheme)
  useKeyboardShortcut(comboNext, nextTool)
  useKeyboardShortcut(comboPrev, prevTool)
}
