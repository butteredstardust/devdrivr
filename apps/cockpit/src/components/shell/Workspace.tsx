import { Suspense, useCallback, useMemo } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { getToolById, MONACO_TOOL_IDS } from '@/app/tool-registry'
import { ToolInstanceContext, type ToolInstance } from '@/app/tool-instance'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Spinner } from '@/components/shared/Spinner'
import { useFileDropZone } from '@/hooks/useFileDropZone'
import { dispatchToolAction, supportsToolFileAction } from '@/lib/tool-actions'
import { WorkspaceTabStrip } from '@/components/shell/WorkspaceTabStrip'
import { WorkspaceEmptyState } from '@/components/shell/WorkspaceEmptyState'
import type { WorkspaceTab } from '@/types/tools'

/**
 * How many tabs stay mounted, the active one included.
 *
 * Switching tabs used to unmount the tool, which reset every ref it held —
 * editor undo history, scroll position, in-flight requests — and forced tools
 * to persist things that are really just component state. Keeping recent tabs
 * mounted fixes that, but a mounted tool keeps its workers and editors alive,
 * so the number is deliberately small: enough for the back-and-forth between
 * two or three tools that switching is actually for.
 */
export const KEEP_ALIVE_LIMIT = 4

function ToolPane({ tab, isActive }: { tab: WorkspaceTab; isActive: boolean }) {
  const tool = getToolById(tab.toolId)
  const instance = useMemo<ToolInstance>(
    () => ({
      tabId: tab.id,
      toolId: tab.toolId,
      stateKey: tab.stateKey ?? tab.toolId,
      isActive,
    }),
    [tab.id, tab.toolId, tab.stateKey, isActive]
  )

  if (!tool) return null
  const ToolComponent = tool.component

  return (
    <div
      // `hidden` is display:none, so a backgrounded tool costs no layout or
      // paint and drops out of the tab order, while its React tree — and
      // everything hanging off it — stays alive.
      className={
        isActive
          ? `min-h-0 flex-1 bg-[var(--color-bg)] ${
              MONACO_TOOL_IDS.has(tab.toolId) ? 'overflow-hidden' : 'overflow-auto'
            }`
          : 'hidden'
      }
      id={`tabpanel-${tab.id}`}
      role="tabpanel"
      aria-labelledby={`tab-${tab.id}`}
    >
      <ToolInstanceContext.Provider value={instance}>
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--color-bg)] text-[var(--color-accent)]">
                <Spinner size="md" label="Loading tool" />
                <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>
              </div>
            }
          >
            <ToolComponent />
          </Suspense>
        </ErrorBoundary>
      </ToolInstanceContext.Provider>
    </div>
  )
}

export function Workspace() {
  const tabs = useUiStore((s) => s.tabs)
  const activeTabId = useUiStore((s) => s.activeTabId)
  const tabMru = useUiStore((s) => s.tabMru)
  const activeTool = useUiStore((s) => s.activeTool)
  const addToast = useUiStore((s) => s.addToast)

  const supportsFileDrop = supportsToolFileAction(activeTool, 'open-file')

  // The most recently used tabs, plus the active one in case it somehow is not
  // among them. Order follows `tabs` so the DOM does not reshuffle on switch.
  const mountedTabs = useMemo(() => {
    const keep = new Set(tabMru.slice(0, KEEP_ALIVE_LIMIT))
    if (activeTabId) keep.add(activeTabId)
    return tabs.filter((tab) => keep.has(tab.id))
  }, [tabs, tabMru, activeTabId])

  const hasActivePane = mountedTabs.some((tab) => tab.id === activeTabId && getToolById(tab.toolId))

  const handleFileDrop = useCallback(
    (content: string, filename: string, path: string) => {
      if (!supportsToolFileAction(activeTool, 'open-file')) {
        addToast('File drop is not supported by the active tool', 'error')
        return
      }
      // The path travels with the drop so the first ⌘S overwrites the dropped
      // file instead of reopening a Save As dialog for a file we already know.
      dispatchToolAction({ type: 'open-file', content, filename, path })
      addToast(`Loaded ${filename}`, 'success')
    },
    [activeTool, addToast]
  )
  const handleFileDropError = useCallback(
    (message: string) => {
      addToast(message, 'error')
    },
    [addToast]
  )
  const { isDragging } = useFileDropZone(handleFileDrop, handleFileDropError, supportsFileDrop)

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--color-bg)]">
      {isDragging && (
        <div className="absolute inset-0 z-[var(--z-scrim)] flex items-center justify-center bg-[var(--color-bg)]/80 backdrop-blur-sm">
          <div className="rounded border-2 border-dashed border-[var(--color-accent)] px-8 py-4 text-sm text-[var(--color-accent)]">
            Drop file here
          </div>
        </div>
      )}
      <WorkspaceTabStrip />
      {/* No tabs, or an active tab pointing at a tool that no longer exists. */}
      {!hasActivePane && (
        <div className="flex flex-1 flex-col items-center justify-center">
          <WorkspaceEmptyState />
        </div>
      )}
      {mountedTabs.map((tab) => (
        <ToolPane key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
      ))}
    </div>
  )
}
