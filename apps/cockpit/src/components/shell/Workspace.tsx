import { Suspense, useCallback, useEffect, useRef } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { getToolById } from '@/app/tool-registry'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useFileDropZone } from '@/hooks/useFileDropZone'
import { dispatchToolAction } from '@/lib/tool-actions'

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

  if (!tool) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-bg)] text-[var(--color-text-muted)]">
        No tool selected
      </div>
    )
  }

  const ToolComponent = tool.component

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--color-bg)]">
      {isDragging && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--color-bg)]/80 backdrop-blur-sm">
          <div className="rounded border-2 border-dashed border-[var(--color-accent)] px-8 py-4 font-pixel text-sm text-[var(--color-accent)]">
            Drop file here
          </div>
        </div>
      )}
      <div className="flex h-10 shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
        <span className="font-pixel text-xs text-[var(--color-accent)]">{tool.name}</span>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--color-bg)]">
        <ErrorBoundary ref={errorBoundaryRef}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                Loading...
              </div>
            }
          >
            <ToolComponent />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  )
}
