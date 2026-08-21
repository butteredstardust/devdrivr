import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ToolDefinition } from '@/types/tools'
import { useUiStore } from '@/stores/ui.store'

type Props = {
  tool: ToolDefinition
}

/**
 * A single pinned tool in the collapsed rail.
 *
 * The rail otherwise lists tool *groups*, which cost two clicks to reach a tool —
 * open the flyout, then pick. A pin is a statement that this is a tool you return
 * to, so in the rail it gets its own button and opens on the first click. The
 * tooltip is the same portal-rendered one `SidebarCollapsedGroup` uses, for the
 * same reason: the rail is 40px wide and a tooltip inside it would be clipped.
 */
export function SidebarCollapsedTool({ tool }: Props) {
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const activeTool = useUiStore((s) => s.activeTool)

  const isActive = tool.id === activeTool

  const handleMouseEnter = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setTooltipStyle({
      position: 'fixed',
      left: rect.right + 8,
      top: rect.top + rect.height / 2,
      transform: 'translateY(-50%)',
      zIndex: 'var(--z-tooltip)',
    })
    setTooltipVisible(true)
  }, [])

  const handleMouseLeave = useCallback(() => setTooltipVisible(false), [])

  // The pointer can still be over the button when the sidebar expands and this
  // unmounts, in which case mouseleave never fires and the tooltip is orphaned.
  useEffect(() => {
    return () => setTooltipVisible(false)
  }, [])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setActiveTool(tool.id)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`flex h-8 w-8 items-center justify-center rounded-sm border-l-2 transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
          isActive
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
            : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
        }`}
        aria-label={`${tool.name} (pinned)`}
        aria-current={isActive ? 'true' : undefined}
        data-sidebar-collapsed-tool={tool.id}
      >
        <span className="flex w-5 shrink-0 items-center justify-center">{tool.icon}</span>
      </button>

      {tooltipVisible &&
        createPortal(
          <div
            style={tooltipStyle}
            className="font-ui animate-pop-in pointer-events-none rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-1 text-xs text-[var(--color-text)] shadow-md"
          >
            {tool.name}
          </div>,
          document.body
        )}
    </>
  )
}
