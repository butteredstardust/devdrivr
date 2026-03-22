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
        className="flex w-full items-center gap-2 px-2 py-1 text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <CaretRight
          size={10}
          className={`shrink-0 transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
        />
        <span className="font-pixel">{group.label}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-0.5 px-1">
          {tools.map((tool) => (
            <SidebarItem key={tool.id} id={tool.id} name={tool.name} icon={tool.icon} />
          ))}
        </div>
      )}
    </div>
  )
}
