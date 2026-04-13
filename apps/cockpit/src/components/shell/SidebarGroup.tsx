import { useCallback, useState } from 'react'
import type { ToolDefinition, ToolGroupMeta } from '@/types/tools'
import { CaretRightIcon } from '@phosphor-icons/react'
import { SidebarItem } from './SidebarItem'

type SidebarGroupProps = {
  group: ToolGroupMeta
  tools: ToolDefinition[]
  isFirst?: boolean
}

export function SidebarGroup({ group, tools, isFirst }: SidebarGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  // ArrowRight expands, ArrowLeft collapses — matches standard tree-nav convention
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight' && collapsed) {
        e.stopPropagation()
        setCollapsed(false)
      } else if (e.key === 'ArrowLeft' && !collapsed) {
        e.stopPropagation()
        setCollapsed(true)
      }
    },
    [collapsed]
  )

  return (
    <div className={`mb-1 ${!isFirst ? 'mt-2 border-t border-[var(--color-border)] pt-2' : ''}`}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        onKeyDown={handleKeyDown}
        aria-expanded={!collapsed}
        data-sidebar-group={group.id}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/60"
      >
        {/* Chevron: size 12 (was 10), rotate-90 when expanded with smooth ease-in-out */}
        <CaretRightIcon
          size={12}
          className={`shrink-0 transition-transform duration-200 ease-in-out ${collapsed ? '' : 'rotate-90'}`}
        />
        <span className="font-mono text-xs tracking-normal">[{group.label}]</span>
        <span className="ml-auto font-mono text-[10px] font-normal tabular-nums text-[var(--color-text-muted)] opacity-60">
          {tools.length}
        </span>
      </button>

      {/* CSS grid trick: animates height without knowing the exact pixel value */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-1 px-1 pb-0.5 pt-0.5">
            {tools.map((tool) => (
              <SidebarItem
                key={tool.id}
                id={tool.id}
                name={tool.name}
                icon={tool.icon}
                tabIndex={collapsed ? -1 : 0}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
