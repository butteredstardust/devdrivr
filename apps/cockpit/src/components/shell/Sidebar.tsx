import { useMemo } from 'react'
import { TOOL_GROUPS } from '@/app/tool-groups'
import { TOOLS } from '@/app/tool-registry'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { Mascot } from '@/components/shared/Mascot'
import { SidebarGroup } from './SidebarGroup'
import { SidebarFooter } from './SidebarFooter'
import { SidebarRecent } from './SidebarRecent'
import { SidebarCollapsedGroup } from './SidebarCollapsedGroup'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const update = useSettingsStore((s) => s.update)
  const activeTool = useUiStore((s) => s.activeTool)

  const activeGroup = useMemo(() => {
    const tool = TOOLS.find((t) => t.id === activeTool)
    return tool?.group ?? ''
  }, [activeTool])

  const toggleCollapsed = () => update('sidebarCollapsed', !sidebarCollapsed).catch(() => {})

  return (
    <aside
      className={`relative flex shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-[1px_0_0_0_var(--color-border),2px_0_8px_-2px_var(--color-shadow)] transition-[width] duration-200 ease-in-out ${sidebarCollapsed ? 'w-10' : 'w-[218px]'}`}
    >
      {/* Collapsed layout */}
      <div
        className={`absolute inset-0 flex flex-col items-center py-2 transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <button
          onClick={toggleCollapsed}
          className="mb-2 flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          title="Expand sidebar"
          aria-label="Expand sidebar"
          tabIndex={sidebarCollapsed ? 0 : -1}
        >
          <CaretRightIcon size={12} />
        </button>
        <div className="flex flex-1 flex-col items-center gap-0.5">
          {TOOL_GROUPS.map((group) => {
            const tools = TOOLS.filter((t) => t.group === group.id)
            return (
              <SidebarCollapsedGroup
                key={group.id}
                group={group}
                tools={tools}
                isActiveGroup={group.id === activeGroup}
              />
            )
          })}
        </div>
        <SidebarFooter collapsed />
      </div>

      {/* Expanded layout */}
      <div
        className={`flex h-full flex-col transition-opacity duration-200 ${sidebarCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      >
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-1 overflow-hidden">
            <Mascot className="shrink-0" />
            <h1 className="font-pixel text-sm font-bold text-[var(--color-accent)] tracking-tight">
              [devdrivr]
            </h1>
          </div>
          <button
            onClick={toggleCollapsed}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            tabIndex={sidebarCollapsed ? -1 : 0}
          >
            <CaretLeftIcon size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          <SidebarRecent />
          {TOOL_GROUPS.map((group, i) => {
            const tools = TOOLS.filter((t) => t.group === group.id)
            return <SidebarGroup key={group.id} group={group} tools={tools} isFirst={i === 0} />
          })}
        </div>
        <SidebarFooter collapsed={false} />
      </div>
    </aside>
  )
}
