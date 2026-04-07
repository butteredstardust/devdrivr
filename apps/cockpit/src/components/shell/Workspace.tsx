import { Suspense, useCallback, useEffect, useRef } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { getToolById } from '@/app/tool-registry'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useFileDropZone } from '@/hooks/useFileDropZone'
import { dispatchToolAction } from '@/lib/tool-actions'
import { ToolboxIcon } from '@phosphor-icons/react'
import { WorkspaceTabStrip } from '@/components/shell/WorkspaceTabStrip'

export function Workspace() {
  const activeTool = useUiStore((s) => s.activeTool)
  const tool = getToolById(activeTool)
  const addToast = useUiStore((s) => s.addToast)
  const errorBoundaryRef = useRef<ErrorBoundary>(null)

  // Reset error boundary when switching tools (instead of using key= which forces full remount)
  useEffect(() => {
    errorBoundaryRef.current?.setState({ hasError: false, error: null })
  }, [activeTool])

  const handleFileDrop = useCallback(
    (content: string, filename: string) => {
      dispatchToolAction({ type: 'open-file', content, filename })
      addToast(`Loaded ${filename}`, 'success')
    },
    [addToast]
  )
  const { isDragging } = useFileDropZone(handleFileDrop)

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--color-bg)]">
      {isDragging && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--color-bg)]/80 backdrop-blur-sm">
          <div className="rounded border-2 border-dashed border-[var(--color-accent)] px-8 py-4 font-mono text-sm text-[var(--color-accent)]">
            Drop file here
          </div>
        </div>
      )}
      <WorkspaceTabStrip />
      {!tool ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
          <ToolboxIcon size={36} weight="light" />
          <div className="text-center">
            <p className="text-sm">Select a tool to get started</p>
            <p className="mt-1 text-xs opacity-60">Use the sidebar or press ⌘K</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-[var(--color-bg)]">
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
