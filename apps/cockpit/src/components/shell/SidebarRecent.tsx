import { useMemo } from 'react'
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react'
import { TOOLS } from '@/app/tool-registry'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import type { MatchRange } from '@/hooks/useFuseSearch'
import { SidebarItem } from './SidebarItem'

type SidebarRecentProps = {
  /** When set (sidebar filter active), only tools in this set are shown. */
  filterToolIds?: Set<string> | null
  /** Match ranges per tool id, so a recent row highlights like its group row. */
  matchRanges?: Map<string, MatchRange[]> | null
}

export function SidebarRecent({ filterToolIds = null, matchRanges = null }: SidebarRecentProps) {
  const recentToolIds = useUiStore((s) => s.recentToolIds)
  const activeTool = useUiStore((s) => s.activeTool)
  const pinnedToolIds = useSettingsStore((s) => s.pinnedToolIds)

  const recentTools = useMemo(
    () =>
      recentToolIds
        .filter((id) => id !== activeTool)
        .filter((id) => !pinnedToolIds.includes(id))
        .map((id) => TOOLS.find((t) => t.id === id))
        .filter((t): t is (typeof TOOLS)[number] => t != null)
        .filter((t) => !filterToolIds || filterToolIds.has(t.id))
        .slice(0, 3),
    [recentToolIds, activeTool, pinnedToolIds, filterToolIds]
  )

  if (recentTools.length === 0) return null

  return (
    <div className="mb-1">
      <SectionLabel as="h3" className="px-2 py-1">
        <ClockCounterClockwiseIcon size={12} className="shrink-0" aria-hidden="true" />
        Recent
      </SectionLabel>
      {/* tabIndex={0} makes recent items explicit participants in keyboard nav */}
      <div className="flex flex-col gap-1 px-1">
        {recentTools.map((tool) => (
          <SidebarItem
            key={tool.id}
            id={tool.id}
            name={tool.name}
            icon={tool.icon}
            tabIndex={0}
            matchRanges={matchRanges?.get(tool.id)}
          />
        ))}
      </div>
    </div>
  )
}
