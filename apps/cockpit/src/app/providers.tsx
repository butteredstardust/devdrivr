import { type ReactNode, useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useHistoryStore } from '@/stores/history.store'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getSetting, setSetting } from '@/lib/db'

export function Providers({ children }: { children: ReactNode }) {
  const init = useSettingsStore((s) => s.init)
  const initialized = useSettingsStore((s) => s.initialized)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function bootstrap() {
      await init()
      await useNotesStore.getState().init()
      await useSnippetsStore.getState().init()
      await useHistoryStore.getState().init()

      // Window state restore
      const win = getCurrentWindow()
      const bounds = await getSetting<{ x: number; y: number; width: number; height: number } | null>('windowBounds', null)
      if (bounds) {
        const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi')
        await win.setPosition(new LogicalPosition(bounds.x, bounds.y))
        await win.setSize(new LogicalSize(bounds.width, bounds.height))
      }
      const settings = useSettingsStore.getState()
      if (settings.alwaysOnTop) {
        await win.setAlwaysOnTop(true)
      }

      // Save bounds on move/resize (debounced 1s)
      let saveTimer: ReturnType<typeof setTimeout> | undefined
      async function persistBounds() {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(async () => {
          const pos = await win.outerPosition()
          const sz = await win.outerSize()
          await setSetting('windowBounds', { x: pos.x, y: pos.y, width: sz.width, height: sz.height })
        }, 1000)
      }
      win.onMoved(persistBounds)
      win.onResized(persistBounds)

      // Register global quick-capture hotkey
      try {
        const { register } = await import('@tauri-apps/plugin-global-shortcut')
        // CommandOrControl is Tauri's standard accelerator — maps to Cmd on macOS, Ctrl on Windows
        await register('CommandOrControl+Shift+Space', async () => {
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
      } catch (err) {
        console.warn('Failed to register global shortcut:', err)
      }
    }

    bootstrap().catch((err) => {
      console.error('Failed to initialize:', err)
      setError(String(err))
    })
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
