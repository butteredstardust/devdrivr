import { useCallback, type MouseEvent } from 'react'
import { detectPlatform } from '@/lib/platform'
import { useUiStore } from '@/stores/ui.store'

/**
 * Opens a tool from any sidebar surface, so the modifier rules live in one place.
 *
 * Three components open tools: the expanded row, the collapsed rail, and the group flyout. A copy
 * of this logic in each one drifts apart.
 *
 * A plain click returns to the tool's open tab. A modifier click or a middle click opens another
 * instance, which is the gesture every browser already teaches.
 */
export function useOpenTool(): (toolId: string, event: MouseEvent) => void {
  const openTabInstance = useUiStore((s) => s.openTabInstance)
  const setActiveTool = useUiStore((s) => s.setActiveTool)

  return useCallback(
    (toolId: string, event: MouseEvent) => {
      // macOS reads ctrl-click as a request for a context menu. Accepting ctrl there would open a
      // tab behind that menu, so each platform gets its own modifier.
      const platform = detectPlatform()
      const modifierPressed = platform === 'mac' ? event.metaKey : event.ctrlKey

      if (event.button === 1 || modifierPressed) {
        openTabInstance(toolId)
        return
      }

      setActiveTool(toolId)
    },
    [openTabInstance, setActiveTool]
  )
}

export function useOpenInstanceCount(toolId: string): number {
  // Return a primitive so unrelated tab updates cannot create an unstable selector result.
  return useUiStore((s) => s.tabs.filter((tab) => tab.toolId === toolId).length)
}
