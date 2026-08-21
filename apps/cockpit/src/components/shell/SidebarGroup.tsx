import { useCallback } from 'react'
import type { ToolDefinition, ToolGroupMeta } from '@/types/tools'
import type { MatchRange } from '@/hooks/useFuseSearch'
import { useSettingsStore } from '@/stores/settings.store'
import { useHadOpenedGroupsAtLaunch } from '@/hooks/useOpenedGroupsAtLaunch'
import { CaretRightIcon } from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { SidebarItem } from './SidebarItem'

type SidebarGroupProps = {
  group: ToolGroupMeta
  tools: ToolDefinition[]
  isFirst?: boolean
  isActiveGroup?: boolean
  /** Force-expanded while the sidebar filter has matches in this group. */
  forceExpanded?: boolean
  /** Filter match ranges by tool id, for emphasising the matched characters. */
  matchRanges?: Map<string, MatchRange[]> | undefined
}

export function SidebarGroup({
  group,
  tools,
  isFirst,
  isActiveGroup = false,
  forceExpanded = false,
  matchRanges,
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
    // No rule above the header. Every group used to carry a full-width
    // border-t on top of its own spacing, an uppercase tracked label, a count
    // and a chevron — five separators competing inside a 218px column. The
    // margin already groups these; the muted label does the rest.
    <div className={`mb-1 ${!isFirst ? 'mt-3' : ''}`}>
      <button
        onClick={toggleCollapsed}
        onKeyDown={handleKeyDown}
        aria-expanded={!collapsed}
        data-sidebar-group={group.id}
        className="w-full rounded px-2 py-1 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring-inset)]"
      >
        {/* SectionLabel rather than a bespoke type treatment, so group headers
            and the Pinned/Recent headers above them are one style instead of
            two competing ones in the same column. */}
        <SectionLabel
          as="span"
          hint={<span className="font-mono tabular-nums">{tools.length}</span>}
        >
          <CaretRightIcon
            size={12}
            className={`shrink-0 transition-transform duration-[var(--duration-panel)] ease-[var(--ease-in-out)] ${collapsed ? '' : 'rotate-90'}`}
          />
          <span className="flex-1 text-left">{group.label}</span>
        </SectionLabel>
      </button>

      {/* CSS grid trick: animates height without knowing the exact pixel value */}
      <div
        className={`grid transition-[grid-template-rows] duration-[var(--duration-panel)] ease-[var(--ease-in-out)] ${collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
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
                matchRanges={matchRanges?.get(tool.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
