import { Suspense } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { getToolById } from '@/app/tool-registry'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

export function Workspace() {
  const activeTool = useUiStore((s) => s.activeTool)
  const tool = getToolById(activeTool)

  if (!tool) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
        No tool selected
      </div>
    )
  }

  const ToolComponent = tool.component

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
        <span className="font-pixel text-xs text-[var(--color-accent)]">{tool.name}</span>
      </div>
      <div className="flex-1 overflow-auto">
        <ErrorBoundary key={activeTool}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
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
