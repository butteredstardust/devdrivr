import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { usePromptTemplatesStore } from '@/stores/prompt-templates.store'
import { useHistoryStore } from '@/stores/history.store'
import { useApiStore } from '@/stores/api.store'
import { useMcpStore } from '@/stores/mcp.store'
import { useUiStore } from '@/stores/ui.store'
import { useUpdaterStore } from '@/stores/updater.store'
import { availableMonitors, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window'
import { logicalWorkAreas, resolveRestorePosition } from '@/lib/window-bounds'
import { listen } from '@tauri-apps/api/event'
import { getSetting, setSetting } from '@/lib/db'
import type { McpDataChangedEvent } from '@/types/models'
import type { WorkspaceTab } from '@/types/tools'
import { getToolById } from '@/app/tool-registry'
import { Alert } from '@/components/shared/Alert'
import { Button } from '@/components/shared/Button'
import { Spinner } from '@/components/shared/Spinner'
import { getNativeWindowState } from '@/lib/native-window'

export function Providers({ children }: { children: ReactNode }) {
  const init = useSettingsStore((s) => s.init)
  const [bootstrapReady, setBootstrapReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const geometryRestored = useRef(false)

  useEffect(() => {
    let cancelled = false
    const cleanups: Array<() => void> = []

    async function bootstrap() {
      const win = getCurrentWindow()
      setBootstrapReady(false)

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
          if (sizeValid) {
            const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi')
            // Which coordinates are reachable depends on the displays attached right now, so the
            // saved position is checked against live work areas rather than fixed limits. The
            // primary monitor goes first because it is where a stranded window is recentred.
            const [primary, monitors] = await Promise.all([
              primaryMonitor().catch(() => null),
              availableMonitors().catch(() => []),
            ])
            const areas = logicalWorkAreas([...(primary ? [primary] : []), ...monitors])
            const saved = {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
            }
            const position = resolveRestorePosition(saved, areas)
            if (position) {
              await win.setPosition(new LogicalPosition(position.x, position.y))
            } else if (areas.length > 0 || (bounds.x > -200 && bounds.y > -200)) {
              // No monitors reported (nothing to validate against) — fall back to the coarse
              // sanity check rather than restoring a position that is obviously nonsense.
              await win.setPosition(new LogicalPosition(bounds.x, bounds.y))
            }
            await win.setSize(new LogicalSize(bounds.width, bounds.height))
          }
        } catch (err) {
          console.warn('Failed to restore window bounds:', err)
        }
      }

      if (cancelled) return

      // Geometry persistence is a core window concern and must not wait for optional data/MCP
      // bootstrap. Otherwise an already-visible window can move while no listeners are attached.
      let saveTimer: ReturnType<typeof setTimeout> | undefined
      function persistBounds() {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(async () => {
          try {
            // Fullscreen display bounds are transient. Persisting them would replace the user's
            // windowed restore geometry and reopen the next launch at the size of the monitor.
            if ((await getNativeWindowState()).isFullscreen) return
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
      if (cancelled) {
        unlistenMoved()
        clearTimeout(saveTimer)
        return
      }
      const unlistenResized = await win.onResized(persistBounds)
      if (cancelled) {
        unlistenMoved()
        unlistenResized()
        clearTimeout(saveTimer)
        return
      }
      cleanups.push(unlistenMoved, unlistenResized, () => clearTimeout(saveTimer))

      // Initialize stores
      await init()
      if (cancelled) return
      await useNotesStore.getState().init()
      await useSnippetsStore.getState().init()
      await usePromptTemplatesStore.getState().init()
      await useHistoryStore.getState().init()

      const unlistenMcpChanged = await listen<McpDataChangedEvent>('mcp:data-changed', (event) => {
        const { resource } = event.payload
        if (resource === 'notes') void useNotesStore.getState().refresh()
        if (resource === 'snippets') void useSnippetsStore.getState().refresh()
        if (resource === 'promptTemplates') void usePromptTemplatesStore.getState().refresh()
        if (resource === 'apiRequests' || resource === 'apiCollections') {
          void useApiStore.getState().refresh()
        }
      })
      // Register (or, if unmount already happened while we were awaiting
      // `listen()`, immediately tear down) right at the moment the listener
      // is created — pushing to `cleanups` after the effect's own cleanup
      // function has already run would leak the listener forever.
      if (cancelled) {
        unlistenMcpChanged()
        return
      }
      cleanups.push(unlistenMcpChanged)

      await useMcpStore.getState().init()

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

      if (cancelled) return
      setBootstrapReady(true)

      // Auto-check for updates (non-blocking). checkForUpdate() self-guards with a 1h cooldown
      // persisted to SQLite, so it's safe to call on every launch.
      if (settings.checkForUpdatesAutomatically) {
        const { checkForUpdate } = useUpdaterStore.getState()
        checkForUpdate()
          .then(() => {
            const { updateInfo, downloadUpdate } = useUpdaterStore.getState()
            const { downloadUpdatesAutomatically } = useSettingsStore.getState()
            if (updateInfo && downloadUpdatesAutomatically) {
              // Staged in the background; the banner then offers a restart rather than
              // installing under the user mid-session.
              downloadUpdate().catch(() => {})
            }
          })
          .catch(() => {})
      }
    }

    bootstrap()
      .then(() => setError(null))
      .catch((err) => {
        console.error('Failed to initialize:', err)
        setError(String(err))
      })

    return () => {
      cancelled = true
      cleanups.forEach((fn) => fn())
    }
  }, [init, retryCount])

  const handleRetry = () => {
    setError(null)
    setBootstrapReady(false)
    setRetryCount((count) => count + 1)
  }

  // Warm up heavy modules during browser idle time after app init.
  // Fallback to setTimeout if requestIdleCallback is not available (e.g., Tauri WebView).
  useEffect(() => {
    if (!bootstrapReady) return
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
  }, [bootstrapReady])

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        {/* This is the whole app failing to come up — Alert carries role="alert", so a screen
            reader hears it rather than landing on a silent, empty-looking window. */}
        <Alert variant="error">Failed to initialize: {error}</Alert>
        <Button variant="secondary" onClick={handleRetry}>
          Retry
        </Button>
      </div>
    )
  }

  if (!bootstrapReady) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[var(--color-accent)]">
        <Spinner size="sm" label="Starting cockpit" />
        <span className="text-sm">Loading...</span>
      </div>
    )
  }

  return <>{children}</>
}
