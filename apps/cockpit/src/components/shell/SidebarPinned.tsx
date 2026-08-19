import { useMemo } from 'react'
import { PushPinIcon } from '@phosphor-icons/react'
import { TOOLS } from '@/app/tool-registry'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { useSettingsStore } from '@/stores/settings.store'
import { SidebarItem } from './SidebarItem'

type SidebarPinnedProps = {
  /** When set (sidebar filter active), only tools in this set are shown. */
  filterToolIds?: Set<string> | null
}

export function SidebarPinned({ filterToolIds = null }: SidebarPinnedProps) {
  const pinnedToolIds = useSettingsStore((s) => s.pinnedToolIds)

  const pinnedTools = useMemo(
    () =>
      pinnedToolIds
        .map((id) => TOOLS.find((tool) => tool.id === id))
        .filter((tool): tool is (typeof TOOLS)[number] => tool != null)
        .filter((tool) => !filterToolIds || filterToolIds.has(tool.id)),
    [pinnedToolIds, filterToolIds]
  )

  if (pinnedTools.length === 0) return null

  return (
    <div className="mb-1">
      <SectionLabel as="h3" className="px-2 py-1">
        <PushPinIcon size={12} className="shrink-0" aria-hidden="true" />
        Pinned
      </SectionLabel>
      <div className="flex flex-col gap-1 px-1">
        {pinnedTools.map((tool) => (
          <SidebarItem key={tool.id} id={tool.id} name={tool.name} icon={tool.icon} tabIndex={0} />
        ))}
      </div>
    </div>
  )
}
