import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ToolDefinition, ToolGroupMeta } from '@/types/tools'
import { useUiStore } from '@/stores/ui.store'

type Props = {
  group: ToolGroupMeta
  tools: ToolDefinition[]
  isActiveGroup: boolean
}

export function SidebarCollapsedGroup({ group, tools, isActiveGroup }: Props) {
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const [flyoutStyle, setFlyoutStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const activeTool = useUiStore((s) => s.activeTool)

  const handleSelect = useCallback(
    (toolId: string) => {
      setActiveTool(toolId)
      setFlyoutOpen(false)
    },
    [setActiveTool]
  )

  // Position the flyout next to the trigger, flipping if near bottom of viewport
  useEffect(() => {
    if (!flyoutOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const flyoutHeight = tools.length * 30 + 28 // estimated: 30px per item + 28px header
    const spaceBelow = window.innerHeight - rect.top
    const flipUp = spaceBelow < flyoutHeight && rect.top > flyoutHeight

    setFlyoutStyle({
      position: 'fixed',
      left: rect.right + 4,
      ...(flipUp ? { bottom: window.innerHeight - rect.bottom } : { top: rect.top }),
      zIndex: 9999,
    })
  }, [flyoutOpen, tools.length])

  // Tooltip positioning — shown on hover when flyout is closed.
  // The unmount cleanup effect below ensures the tooltip is always hidden
  // if the sidebar collapses (and this component loses interactivity or
  // unmounts) while the pointer is still over the button.
  const handleMouseEnter = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setTooltipStyle({
      position: 'fixed',
      left: rect.right + 8,
      top: rect.top + rect.height / 2,
      transform: 'translateY(-50%)',
      zIndex: 9999,
    })
    setTooltipVisible(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setTooltipVisible(false)
  }, [])

  // Hide tooltip on unmount (e.g. sidebar collapses while button is hovered
  // and mouseleave never fires during the opacity transition)
  useEffect(() => {
    return () => setTooltipVisible(false)
  }, [])

  // Close flyout on outside click
  useEffect(() => {
    if (!flyoutOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        flyoutRef.current &&
        !flyoutRef.current.contains(target)
      ) {
        setFlyoutOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [flyoutOpen])

  // Close flyout on Escape
  useEffect(() => {
    if (!flyoutOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFlyoutOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [flyoutOpen])

  return (
    <>
      {/* Larger click target: h-8 w-8 (32px) vs previous h-7 w-7 (28px) */}
      <button
        ref={triggerRef}
        onClick={() => setFlyoutOpen(!flyoutOpen)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`flex h-8 w-8 items-center justify-center rounded transition-colors duration-150 ${
          isActiveGroup
            ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
            : flyoutOpen
              ? 'bg-[var(--color-surface-hover)] text-[var(--color-text)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
        }`}
        aria-label={group.label}
        aria-expanded={flyoutOpen}
        aria-haspopup="true"
        data-sidebar-collapsed-group={group.id}
      >
        <span className="flex w-5 shrink-0 items-center justify-center">{group.icon}</span>
      </button>

      {/* Hover tooltip — rendered via portal so it overflows the 40px sidebar */}
      {tooltipVisible &&
        !flyoutOpen &&
        createPortal(
          <div
            style={tooltipStyle}
            className="pointer-events-none rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-1 font-mono text-[11px] text-[var(--color-text)] shadow-md"
          >
            {group.label}
          </div>,
          document.body
        )}

      {/* Flyout tool list */}
      {flyoutOpen &&
        createPortal(
          <div
            ref={flyoutRef}
            style={flyoutStyle}
            className="min-w-[160px] overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-1 shadow-lg"
          >
            <div className="px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              {group.label}
            </div>
            {tools.map((tool) => {
              const isActive = tool.id === activeTool
              return (
                <button
                  key={tool.id}
                  onClick={() => handleSelect(tool.id)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                  }`}
                >
                  <span className="w-4 shrink-0 text-center font-mono text-[10px]">
                    {typeof tool.icon === 'string' ? tool.icon : '•'}
                  </span>
                  <span className="truncate">{tool.name}</span>
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </>
  )
}
