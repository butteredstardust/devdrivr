import { useMemo } from 'react'
import { ClockCounterClockwise } from '@phosphor-icons/react'
import { TOOLS } from '@/app/tool-registry'
import { useUiStore } from '@/stores/ui.store'
import { SidebarItem } from './SidebarItem'

export function SidebarRecent() {
  const recentToolIds = useUiStore((s) => s.recentToolIds)
  const activeTool = useUiStore((s) => s.activeTool)

  const recentTools = useMemo(
    () =>
      recentToolIds
        .filter((id) => id !== activeTool)
        .map((id) => TOOLS.find((t) => t.id === id))
        .filter((t): t is (typeof TOOLS)[number] => t != null)
        .slice(0, 3),
    [recentToolIds, activeTool]
  )

  if (recentTools.length === 0) return null

  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
        <ClockCounterClockwise size={10} className="shrink-0" />
        <span className="font-pixel">Recent</span>
      </div>
      <div className="flex flex-col gap-1 px-1">
        {recentTools.map((tool) => (
          <SidebarItem key={tool.id} id={tool.id} name={tool.name} icon={tool.icon} />
        ))}
      </div>
    </div>
  )
}
