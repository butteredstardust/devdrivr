import type { ReactElement } from 'react'
import { PushPinIcon } from '@phosphor-icons/react'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'

type SidebarItemProps = {
  id: string
  name: string
  icon: ReactElement
  tabIndex?: number
}

export function SidebarItem({ id, name, icon, tabIndex }: SidebarItemProps) {
  const activeTool = useUiStore((s) => s.activeTool)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const pinnedToolIds = useSettingsStore((s) => s.pinnedToolIds)
  const update = useSettingsStore((s) => s.update)
  const isActive = activeTool === id
  const isPinned = pinnedToolIds.includes(id)

  const togglePinned = () => {
    const next = isPinned ? pinnedToolIds.filter((toolId) => toolId !== id) : [id, ...pinnedToolIds]
    void update('pinnedToolIds', next)
  }

  return (
    <div className="group flex h-8 w-full items-center gap-1">
      <button
        onClick={() => setActiveTool(id)}
        title={name}
        aria-label={name}
        aria-current={isActive ? 'page' : undefined}
        tabIndex={tabIndex}
        data-sidebar-item={id}
        className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm border-l-2 px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/60 ${
          isActive
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)] shadow-[inset_3px_0_8px_-4px_var(--color-accent)]'
            : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
        }`}
      >
        <span className="flex w-5 shrink-0 items-center justify-center">{icon}</span>
        <span className="truncate">{name}</span>
      </button>
      <button
        onClick={togglePinned}
        title={isPinned ? 'Unpin from favorites' : 'Pin to favorites'}
        aria-label={isPinned ? `Unpin ${name}` : `Pin ${name}`}
        aria-pressed={isPinned}
        tabIndex={tabIndex}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/60 ${
          isPinned ? 'text-[var(--color-accent)] opacity-100' : 'opacity-60 group-hover:opacity-100'
        }`}
      >
        <PushPinIcon size={13} weight={isPinned ? 'fill' : 'regular'} />
      </button>
    </div>
  )
}
