import { TOOL_GROUPS } from '@/types/tools'
import { TOOLS } from '@/app/tool-registry'
import { useSettingsStore } from '@/stores/settings.store'
import { SidebarGroup } from './SidebarGroup'

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)

  if (sidebarCollapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-r border-[var(--color-border)] bg-[var(--color-surface)] py-2">
        {TOOL_GROUPS.map((group) => (
          <div
            key={group.id}
            className="mb-2 flex h-7 w-7 items-center justify-center font-pixel text-[10px] text-[var(--color-text-muted)]"
            title={group.label}
          >
            {group.icon}
          </div>
        ))}
      </aside>
    )
  }

  return (
    <aside className="flex w-52 shrink-0 flex-col overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] py-2">
      <div className="mb-3 px-3">
        <h1 className="font-pixel text-sm text-[var(--color-accent)]">devdrivr</h1>
      </div>
      {TOOL_GROUPS.map((group) => {
        const tools = TOOLS.filter((t) => t.group === group.id)
        return <SidebarGroup key={group.id} group={group} tools={tools} />
      })}
    </aside>
  )
}
