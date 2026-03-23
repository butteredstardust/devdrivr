import { useState } from 'react'
import type { ToolDefinition, ToolGroupMeta } from '@/types/tools'
import { CaretRight } from '@phosphor-icons/react'
import { SidebarItem } from './SidebarItem'

type SidebarGroupProps = {
  group: ToolGroupMeta
  tools: ToolDefinition[]
}

export function SidebarGroup({ group, tools }: SidebarGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
      >
        <CaretRight
          size={10}
          className={`shrink-0 transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
        />
        <span className="font-pixel text-[10px] tracking-normal">[{group.label}]</span>
        <span className="ml-auto font-mono text-[10px] font-normal tabular-nums text-[var(--color-text-muted)] opacity-60">
          {tools.length}
        </span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1 px-1">
          {tools.map((tool) => (
            <SidebarItem key={tool.id} id={tool.id} name={tool.name} icon={tool.icon} />
          ))}
        </div>
      )}
    </div>
  )
}
