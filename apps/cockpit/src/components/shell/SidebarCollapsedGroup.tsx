import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ToolDefinition, ToolGroupMeta } from '@/types/tools'
import { useUiStore } from '@/stores/ui.store'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Popover } from '@/components/shared/Popover'

type Props = {
  group: ToolGroupMeta
  tools: ToolDefinition[]
  isActiveGroup: boolean
}

export function SidebarCollapsedGroup({ group, tools, isActiveGroup }: Props) {
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const activeTool = useUiStore((s) => s.activeTool)

  const handleSelect = useCallback(
    (toolId: string) => {
      setActiveTool(toolId)
      setFlyoutOpen(false)
    },
    [setActiveTool]
  )

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
      zIndex: 'var(--z-tooltip)',
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

  // Arrow keys move between the tools, so the list can be operated the way a menu is expected to
  // be. Tab cycling, Escape and focus restoration come from Popover.
  const handleListKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    if (buttons.length === 0) return
    event.preventDefault()
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      event.key === 'ArrowDown'
        ? (current + 1) % buttons.length
        : (current - 1 + buttons.length) % buttons.length
    buttons[current === -1 && event.key === 'ArrowUp' ? buttons.length - 1 : next]?.focus()
  }, [])

  return (
    <>
      <Popover
        open={flyoutOpen}
        onOpenChange={setFlyoutOpen}
        label={`${group.label} tools`}
        placement="side"
        align="start"
        className="min-w-[160px] py-1"
        onSurfaceKeyDown={handleListKeyDown}
        trigger={({ ref, onClick, ...triggerProps }) => (
          /* Larger click target: h-8 w-8 (32px) vs previous h-7 w-7 (28px).
             The accent left border mirrors the expanded tree's active row, so
             collapsing the sidebar changes the density but not the visual
             language — the active thing is marked the same way in both. */
          <button
            ref={(node) => {
              ref(node)
              triggerRef.current = node
            }}
            onClick={onClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`flex h-8 w-8 items-center justify-center rounded-sm border-l-2 transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
              isActiveGroup
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                : flyoutOpen
                  ? 'border-transparent bg-[var(--color-surface-hover)] text-[var(--color-text)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
            }`}
            aria-label={group.label}
            data-sidebar-collapsed-group={group.id}
            {...triggerProps}
          >
            <span className="flex w-5 shrink-0 items-center justify-center">{group.icon}</span>
          </button>
        )}
      >
        <div ref={listRef} onKeyDown={handleListKeyDown} className="overflow-y-auto">
          <SectionLabel as="div" className="px-2.5 pb-1 pt-1">
            {group.label}
          </SectionLabel>
          {tools.map((tool) => {
            const isActive = tool.id === activeTool
            return (
              <button
                key={tool.id}
                onClick={() => handleSelect(tool.id)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
                  isActive
                    ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <span className="flex w-4 shrink-0 items-center justify-center">{tool.icon}</span>
                <span className="truncate">{tool.name}</span>
              </button>
            )
          })}
        </div>
      </Popover>

      {/* Hover tooltip — rendered via portal so it overflows the 40px sidebar */}
      {tooltipVisible &&
        !flyoutOpen &&
        createPortal(
          <div
            style={tooltipStyle}
            className="font-ui animate-pop-in pointer-events-none rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-1 text-xs text-[var(--color-text)] shadow-md"
          >
            {group.label}
          </div>,
          document.body
        )}
    </>
  )
}
