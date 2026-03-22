import { type ReactNode, useEffect, useState } from 'react'
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

  useEffect(() => {
    let cancelled = false
    const cleanups: Array<() => void> = []

    async function bootstrap() {
      await init()
      if (cancelled) return
      await useNotesStore.getState().init()
      await useSnippetsStore.getState().init()
      await useHistoryStore.getState().init()

      // Restore last active tool
      const lastTool = await getSetting<string | null>('activeTool', null)
      if (lastTool) {
        useUiStore.getState().setActiveTool(lastTool)
      }

      if (cancelled) return

      // Window state restore — use logical coordinates to avoid physical/logical mismatch on Retina
      const win = getCurrentWindow()
      const bounds = await getSetting<{ x: number; y: number; width: number; height: number } | null>('windowBounds', null)
      if (bounds && bounds.width >= 800 && bounds.width <= 4000 && bounds.height >= 500 && bounds.height <= 3000) {
        const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi')
        await win.setPosition(new LogicalPosition(bounds.x, bounds.y))
        await win.setSize(new LogicalSize(bounds.width, bounds.height))
      }
      const settings = useSettingsStore.getState()
      if (settings.alwaysOnTop) {
        await win.setAlwaysOnTop(true)
      }

      if (cancelled) return

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

      // Register global quick-capture hotkey
      try {
        const { register, unregister } = await import('@tauri-apps/plugin-global-shortcut')
        const shortcut = 'CommandOrControl+Shift+Space'
        // Unregister first in case StrictMode re-runs the effect
        try { await unregister(shortcut) } catch { /* not registered */ }
        await register(shortcut, async () => {
          const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
          const label = 'quick-capture'
          const existing = await WebviewWindow.getByLabel(label)
          if (existing) {
            await existing.setFocus()
            return
          }
          new WebviewWindow(label, {
            url: '/?quick-capture=1',
            title: 'Quick Capture',
            width: 400,
            height: 200,
            alwaysOnTop: true,
            decorations: true,
            center: true,
            resizable: true,
          })
        })
        cleanups.push(() => { unregister(shortcut).catch(() => {}) })
      } catch (err) {
        console.warn('Failed to register global shortcut:', err)
      }
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
