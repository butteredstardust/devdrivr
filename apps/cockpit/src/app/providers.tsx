import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useHistoryStore } from '@/stores/history.store'
import { useUiStore } from '@/stores/ui.store'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getSetting, setSetting } from '@/lib/db'

export function Providers({ children }: { children: ReactNode }) {
  const init = useSettingsStore((s) => s.init)
  const initialized = useSettingsStore((s) => s.initialized)
  const [error, setError] = useState<string | null>(null)
  const geometryRestored = useRef(false)

  useEffect(() => {
    let cancelled = false
    const cleanups: Array<() => void> = []

    async function bootstrap() {
      const win = getCurrentWindow()

      // Restore window geometry FIRST (before store loads) to minimise visible resize jump.
      // Ref guard runs this once even under StrictMode double-mount.
      if (!geometryRestored.current) {
        geometryRestored.current = true
        try {
          const bounds = await getSetting<{ x: number; y: number; width: number; height: number } | null>('windowBounds', null)
          const sizeValid = bounds && bounds.width >= 800 && bounds.width <= 4000 && bounds.height >= 500 && bounds.height <= 3000
          // Clamp position so the window isn't restored entirely off-screen
          // (e.g. after disconnecting an external monitor)
          const posValid = bounds && bounds.x > -200 && bounds.y > -200 && bounds.x < 4000 && bounds.y < 3000
          if (sizeValid) {
            const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi')
            if (posValid) {
              await win.setPosition(new LogicalPosition(bounds.x, bounds.y))
            }
            await win.setSize(new LogicalSize(bounds.width, bounds.height))
          }
        } catch (err) {
          console.warn('Failed to restore window bounds:', err)
        }
      }

      if (cancelled) return

      // Initialize stores
      await init()
      if (cancelled) return
      await useNotesStore.getState().init()
      await useSnippetsStore.getState().init()
      await useHistoryStore.getState().init()

      // Restore last active tool
      const lastTool = await getSetting<string | null>('activeTool', null)
      if (lastTool) {
        useUiStore.getState().restoreActiveTool(lastTool)
      }

      if (cancelled) return

      // Apply always-on-top after settings are loaded
      const settings = useSettingsStore.getState()
      if (settings.alwaysOnTop) {
        await win.setAlwaysOnTop(true)
      }

      // Save bounds on move/resize (debounced 2s) — convert to logical to match restore
      let saveTimer: ReturnType<typeof setTimeout> | undefined
      function persistBounds() {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(async () => {
          try {
            const factor = await win.scaleFactor()
            const pos = await win.outerPosition()
            const sz = await win.outerSize()
            const logicalPos = pos.toLogical(factor)
            const logicalSz = sz.toLogical(factor)
            await setSetting('windowBounds', { x: logicalPos.x, y: logicalPos.y, width: logicalSz.width, height: logicalSz.height })
          } catch {
            // Window may have been destroyed
          }
        }, 2000)
      }
      const unlistenMoved = await win.onMoved(persistBounds)
      const unlistenResized = await win.onResized(persistBounds)
      cleanups.push(unlistenMoved, unlistenResized, () => clearTimeout(saveTimer))
    }

    bootstrap().catch((err) => {
      console.error('Failed to initialize:', err)
      setError(String(err))
    })

    return () => {
      cancelled = true
      cleanups.forEach((fn) => fn())
    }
  }, [init])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-[var(--color-error)]">Failed to initialize: {error}</div>
      </div>
    )
  }

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="font-pixel text-sm text-[var(--color-accent)]">Loading...</div>
      </div>
    )
  }

  return <>{children}</>
}
