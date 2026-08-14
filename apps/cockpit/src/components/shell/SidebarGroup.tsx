import { useCallback } from 'react'
import type { ToolDefinition, ToolGroupMeta } from '@/types/tools'
import { useSettingsStore } from '@/stores/settings.store'
import { useHadOpenedGroupsAtLaunch } from '@/hooks/useOpenedGroupsAtLaunch'
import { CaretRightIcon } from '@phosphor-icons/react'
import { SidebarItem } from './SidebarItem'

type SidebarGroupProps = {
  group: ToolGroupMeta
  tools: ToolDefinition[]
  isFirst?: boolean
  isActiveGroup?: boolean
  /** Force-expanded while the sidebar filter has matches in this group. */
  forceExpanded?: boolean
}

export function SidebarGroup({
  group,
  tools,
  isFirst,
  isActiveGroup = false,
  forceExpanded = false,
}: SidebarGroupProps) {
  const collapsedSidebarGroups = useSettingsStore((s) => s.collapsedSidebarGroups)
  const openedSidebarGroups = useSettingsStore((s) => s.openedSidebarGroups)
  const update = useSettingsStore((s) => s.update)
  const explicitlyCollapsed = collapsedSidebarGroups.includes(group.id)
  // Once the user has opened any group at least once, groups they've never
  // touched default to collapsed — but only after that first touch, so a
  // brand-new install (openedSidebarGroups still empty) still shows every
  // group expanded rather than looking broken/empty.
  //
  // The "has the user opened anything yet" gate is frozen at launch, so a
  // first-run sidebar doesn't collapse itself the moment the first tool is
  // clicked. Membership stays live, so expanding a group still works instantly.
  const hadOpenedGroupsAtLaunch = useHadOpenedGroupsAtLaunch()
  const recordedAsOpened = openedSidebarGroups.includes(group.id)
  const defaultCollapsed = hadOpenedGroupsAtLaunch && !recordedAsOpened
  const persistentlyCollapsed = explicitlyCollapsed || defaultCollapsed
  const collapsed = persistentlyCollapsed && !isActiveGroup && !forceExpanded

  const collapseGroup = useCallback(() => {
    if (!explicitlyCollapsed) {
      void update('collapsedSidebarGroups', [...collapsedSidebarGroups, group.id])
    }
  }, [collapsedSidebarGroups, group.id, explicitlyCollapsed, update])

  const expandGroup = useCallback(() => {
    if (explicitlyCollapsed) {
      void update(
        'collapsedSidebarGroups',
        collapsedSidebarGroups.filter((id) => id !== group.id)
      )
    }
    // Expanding — explicitly or via the default-collapse fallback — counts
    // as "opened" so it stays expanded by default from here on.
    if (!recordedAsOpened) {
      void update('openedSidebarGroups', [...openedSidebarGroups, group.id])
    }
  }, [
    collapsedSidebarGroups,
    group.id,
    explicitlyCollapsed,
    recordedAsOpened,
    openedSidebarGroups,
    update,
  ])

  const toggleCollapsed = useCallback(() => {
    if (collapsed) {
      expandGroup()
    } else if (persistentlyCollapsed && isActiveGroup) {
      expandGroup()
    } else {
      collapseGroup()
    }
  }, [collapseGroup, collapsed, expandGroup, isActiveGroup, persistentlyCollapsed])

  // ArrowRight expands, ArrowLeft collapses — matches standard tree-nav convention
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight' && collapsed) {
        e.stopPropagation()
        expandGroup()
      } else if (e.key === 'ArrowLeft' && !collapsed) {
        e.stopPropagation()
        collapseGroup()
      }
    },
    [collapseGroup, collapsed, expandGroup]
  )

  return (
    <div className={`mb-1 ${!isFirst ? 'mt-2 border-t border-[var(--color-border)] pt-2' : ''}`}>
      <button
        onClick={toggleCollapsed}
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
        <span className="text-xs tracking-normal">[{group.label}]</span>
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
