import { useState } from 'react'
import type { ToolDefinition, ToolGroupMeta } from '@/types/tools'
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
        className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <span className={`text-[8px] transition-transform ${collapsed ? '' : 'rotate-90'}`}>▶</span>
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
