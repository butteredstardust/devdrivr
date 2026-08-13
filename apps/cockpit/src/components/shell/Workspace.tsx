import { Suspense, useCallback, useEffect, useRef } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { getToolById, MONACO_TOOL_IDS } from '@/app/tool-registry'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useFileDropZone } from '@/hooks/useFileDropZone'
import { dispatchToolAction, supportsToolFileAction } from '@/lib/tool-actions'
import { WorkspaceTabStrip } from '@/components/shell/WorkspaceTabStrip'
import { WorkspaceEmptyState } from '@/components/shell/WorkspaceEmptyState'

export function Workspace() {
  const activeTool = useUiStore((s) => s.activeTool)
  const tool = getToolById(activeTool)
  const usesMonaco = MONACO_TOOL_IDS.has(activeTool)
  const supportsFileDrop = supportsToolFileAction(activeTool, 'open-file')
  const addToast = useUiStore((s) => s.addToast)
  const errorBoundaryRef = useRef<ErrorBoundary>(null)

  // Reset error boundary when switching tools (instead of using key= which forces full remount)
  useEffect(() => {
    errorBoundaryRef.current?.reset()
  }, [activeTool])

  const handleFileDrop = useCallback(
    (content: string, filename: string) => {
      if (!supportsToolFileAction(activeTool, 'open-file')) {
        addToast('File drop is not supported by the active tool', 'error')
        return
      }
      dispatchToolAction({ type: 'open-file', content, filename })
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
          <div className="rounded border-2 border-dashed border-[var(--color-accent)] px-8 py-4 font-mono text-sm text-[var(--color-accent)]">
            Drop file here
          </div>
        </div>
      )}
      <WorkspaceTabStrip />
      {!tool ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <WorkspaceEmptyState />
        </div>
      ) : (
        <div
          className={`min-h-0 flex-1 bg-[var(--color-bg)] ${
            usesMonaco ? 'overflow-hidden' : 'overflow-auto'
          }`}
        >
          <ErrorBoundary ref={errorBoundaryRef}>
            <Suspense
              fallback={
                <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--color-bg)]">
                  <div className="animate-spin h-5 w-5 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
                  <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>
                </div>
              }
            >
              {(() => {
                const ToolComponent = tool.component
                return <ToolComponent />
              })()}
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
}
