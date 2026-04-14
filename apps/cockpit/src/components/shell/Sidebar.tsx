import { useCallback, useMemo } from 'react'
import { TOOL_GROUPS } from '@/app/tool-groups'
import { TOOLS } from '@/app/tool-registry'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { Mascot } from '@/components/shared/Mascot'
import { SidebarGroup } from './SidebarGroup'
import { SidebarFooter } from './SidebarFooter'
import { SidebarRecent } from './SidebarRecent'
import { SidebarPinned } from './SidebarPinned'
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

  // Arrow-key navigation for the expanded tool list.
  // Collects all focusable sidebar items and group headers in DOM order,
  // then moves focus up or down on ArrowUp/ArrowDown.
  const handleNavKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

    const container = e.currentTarget
    // Include group headers (data-sidebar-group) and visible tool items
    // (data-sidebar-item with tabindex != -1 means item is in an expanded group)
    const items = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-sidebar-group], [data-sidebar-item]:not([tabindex="-1"])'
      )
    )
    if (items.length === 0) return

    e.preventDefault()

    const focused = document.activeElement as HTMLElement
    const idx = items.indexOf(focused)

    // Guard: if focus is outside the list (idx === -1) go to first/last item
    // rather than using the raw modular arithmetic which skips items.
    if (e.key === 'ArrowDown') {
      const next = idx === -1 ? items[0] : items[(idx + 1) % items.length]
      next?.focus()
    } else {
      const prev =
        idx === -1 ? items[items.length - 1] : items[(idx - 1 + items.length) % items.length]
      prev?.focus()
    }
  }, [])

  // Arrow-key navigation for the collapsed group icon column
  const handleCollapsedNavKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const container = e.currentTarget
    const items = Array.from(
      container.querySelectorAll<HTMLElement>('[data-sidebar-collapsed-group]')
    )
    if (items.length === 0) return

    e.preventDefault()
    const focused = document.activeElement as HTMLElement
    const idx = items.indexOf(focused)

    // Same idx === -1 guard: focus outside list → jump to first/last
    if (e.key === 'ArrowDown') {
      ;(idx === -1 ? items[0] : items[(idx + 1) % items.length])?.focus()
    } else {
      ;(idx === -1
        ? items[items.length - 1]
        : items[(idx - 1 + items.length) % items.length]
      )?.focus()
    }
  }, [])

  return (
    <aside
      className={`relative flex shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-[1px_0_0_0_var(--color-border),2px_0_8px_-2px_var(--color-shadow)] transition-[width] duration-200 ease-in-out ${sidebarCollapsed ? 'w-10' : 'w-[218px]'}`}
    >
      {/* Collapsed layout */}
      <div
        className={`absolute inset-0 flex flex-col items-center py-2 transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        {/* Expand button — h-8 w-8 for a comfortable click target */}
        <button
          onClick={toggleCollapsed}
          className="mb-1 flex h-8 w-8 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          title="Expand sidebar"
          aria-label="Expand sidebar"
          tabIndex={sidebarCollapsed ? 0 : -1}
        >
          <CaretRightIcon size={12} />
        </button>
        <div
          className="flex flex-1 flex-col items-center gap-0.5"
          onKeyDown={handleCollapsedNavKeyDown}
        >
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
            <h1 className="font-pixel text-sm font-bold tracking-tight text-[var(--color-accent)]">
              [devdrivr]
            </h1>
          </div>
          {/* Collapse button — h-7 w-7 for a larger click target */}
          <button
            onClick={toggleCollapsed}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            tabIndex={sidebarCollapsed ? -1 : 0}
          >
            <CaretLeftIcon size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1" onKeyDown={handleNavKeyDown}>
          <SidebarPinned />
          <SidebarRecent />
          {TOOL_GROUPS.map((group, i) => {
            const tools = TOOLS.filter((t) => t.group === group.id)
            return (
              <SidebarGroup
                key={group.id}
                group={group}
                tools={tools}
                isFirst={i === 0}
                isActiveGroup={group.id === activeGroup}
              />
            )
          })}
        </div>
        <SidebarFooter collapsed={false} />
      </div>
    </aside>
  )
}
