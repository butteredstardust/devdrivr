import { useMemo } from 'react'
import { PushPinIcon } from '@phosphor-icons/react'
import { TOOLS } from '@/app/tool-registry'
import { useSettingsStore } from '@/stores/settings.store'
import { SidebarItem } from './SidebarItem'

export function SidebarPinned() {
  const pinnedToolIds = useSettingsStore((s) => s.pinnedToolIds)

  const pinnedTools = useMemo(
    () =>
      pinnedToolIds
        .map((id) => TOOLS.find((tool) => tool.id === id))
        .filter((tool): tool is (typeof TOOLS)[number] => tool != null),
    [pinnedToolIds]
  )

  if (pinnedTools.length === 0) return null

  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 px-2 py-1 text-[var(--color-text-muted)]">
        <PushPinIcon size={10} className="shrink-0" />
        <span className="font-mono text-[11px] font-bold uppercase tracking-normal">[Pinned]</span>
      </div>
      <div className="flex flex-col gap-1 px-1">
        {pinnedTools.map((tool) => (
          <SidebarItem key={tool.id} id={tool.id} name={tool.name} icon={tool.icon} tabIndex={0} />
        ))}
      </div>
    </div>
  )
}
