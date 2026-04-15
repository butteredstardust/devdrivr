import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { usePromptTemplatesStore } from '@/stores/prompt-templates.store'
import { useHistoryStore } from '@/stores/history.store'
import { useUiStore } from '@/stores/ui.store'
import { useUpdaterStore, autoDownloadUpdate } from '@/stores/updater.store'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getSetting, setSetting } from '@/lib/db'
import type { WorkspaceTab } from '@/types/tools'
import { getToolById } from '@/app/tool-registry'

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
          const bounds = await getSetting<{
            x: number
            y: number
            width: number
            height: number
          } | null>('windowBounds', null)
          const sizeValid =
            bounds &&
            bounds.width >= 800 &&
            bounds.width <= 4000 &&
            bounds.height >= 500 &&
            bounds.height <= 3000
          // Clamp position so the window isn't restored entirely off-screen
          // (e.g. after disconnecting an external monitor)
          const posValid =
            bounds && bounds.x > -200 && bounds.y > -200 && bounds.x < 4000 && bounds.y < 3000
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
      await usePromptTemplatesStore.getState().init()
      await useHistoryStore.getState().init()

      // Restore workspace tabs (with backward-compat fallback for legacy activeTool key)
      const savedTabs = await getSetting<WorkspaceTab[] | null>('openTabs', null)
      const savedActiveTabId = await getSetting<string | null>('activeTabId', null)

      if (savedTabs && savedTabs.length > 0) {
        // Filter out any tabs whose tool no longer exists in the registry
        const validTabs = savedTabs.filter((t) => getToolById(t.toolId) !== undefined)
        if (validTabs.length > 0) {
          const activeIdValid =
            savedActiveTabId !== null && validTabs.some((t) => t.id === savedActiveTabId)
          const resolvedActiveId = activeIdValid ? savedActiveTabId : (validTabs[0]?.id ?? null)
          useUiStore.getState().restoreTabs(validTabs, resolvedActiveId)
        }
      } else {
        // Backward compat: migrate legacy single-tool session
        const lastTool = await getSetting<string | null>('activeTool', null)
        if (lastTool && getToolById(lastTool) !== undefined) {
          useUiStore.getState().restoreActiveTool(lastTool)
        }
      }

      if (cancelled) return

      // Apply always-on-top after settings are loaded
      const settings = useSettingsStore.getState()
      if (settings.alwaysOnTop) {
        await win.setAlwaysOnTop(true)
      }

      // Auto-check for updates (non-blocking). checkForUpdate() self-guards with a 1h cooldown
      // persisted to SQLite, so it's safe to call on every launch.
      if (settings.checkForUpdatesAutomatically) {
        const { checkForUpdate } = useUpdaterStore.getState()
        checkForUpdate()
          .then(() => {
            const updateInfo = useUpdaterStore.getState().updateInfo
            const { downloadUpdatesAutomatically } = useSettingsStore.getState()
            if (updateInfo && downloadUpdatesAutomatically) {
              autoDownloadUpdate(updateInfo).catch(() => {})
            }
          })
          .catch(() => {})
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
            await setSetting('windowBounds', {
              x: logicalPos.x,
              y: logicalPos.y,
              width: logicalSz.width,
              height: logicalSz.height,
            })
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

  // Warm up heavy modules during browser idle time after app init.
  // Fallback to setTimeout if requestIdleCallback is not available (e.g., Tauri WebView).
  useEffect(() => {
    if (!initialized) return
    const preload = () => {
      void import('fuse.js')
      void import('@/tools/json-tools/JsonTools')
      void import('@/tools/regex-tester/RegexTester')
      void import('@/tools/markdown-editor/MarkdownEditor')
    }

    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(preload)
      return () => cancelIdleCallback(id)
    } else {
      const id = setTimeout(preload, 2000)
      return () => clearTimeout(id)
    }
  }, [initialized])

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
        <div className="font-mono text-sm text-[var(--color-accent)]">Loading...</div>
      </div>
    )
  }

  return <>{children}</>
}
