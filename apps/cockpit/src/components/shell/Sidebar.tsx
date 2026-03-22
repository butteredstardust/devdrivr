import { TOOL_GROUPS } from '@/app/tool-groups'
import { TOOLS } from '@/app/tool-registry'
import { useSettingsStore } from '@/stores/settings.store'
import { SidebarGroup } from './SidebarGroup'
import { SidebarFooter } from './SidebarFooter'

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)

  if (sidebarCollapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-r border-[var(--color-border)] bg-[var(--color-surface)] py-2 shadow-[2px_0_8px_-2px_var(--color-shadow)]">
        <div className="flex flex-1 flex-col items-center">
          {TOOL_GROUPS.map((group) => (
            <div
              key={group.id}
              className="mb-2 flex h-7 w-7 items-center justify-center text-[var(--color-text-muted)]"
              title={group.label}
            >
              {group.icon}
            </div>
          ))}
        </div>
        <SidebarFooter collapsed />
      </aside>
    )
  }

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-[2px_0_8px_-2px_var(--color-shadow)]">
      <div className="px-3 py-3">
        <h1 className="font-pixel text-base font-bold text-[var(--color-accent)]">devdrivr</h1>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {TOOL_GROUPS.map((group) => {
          const tools = TOOLS.filter((t) => t.group === group.id)
          return <SidebarGroup key={group.id} group={group} tools={tools} />
        })}
      </div>
      <SidebarFooter collapsed={false} />
    </aside>
  )
}
