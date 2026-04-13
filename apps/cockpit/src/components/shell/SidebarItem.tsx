import { type ReactNode, isValidElement } from 'react'
import { useUiStore } from '@/stores/ui.store'

type SidebarItemProps = {
  id: string
  name: string
  icon: string | ReactNode
  tabIndex?: number
}

export function SidebarItem({ id, name, icon, tabIndex }: SidebarItemProps) {
  const activeTool = useUiStore((s) => s.activeTool)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const isActive = activeTool === id

  return (
    <button
      onClick={() => setActiveTool(id)}
      title={name}
      aria-label={name}
      aria-current={isActive ? 'page' : undefined}
      tabIndex={tabIndex}
      data-sidebar-item={id}
      className={`flex h-8 w-full items-center gap-2 rounded-sm border-l-2 px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/60 ${
        isActive
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)] shadow-[inset_3px_0_8px_-4px_var(--color-accent)]'
          : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
      }`}
    >
      {isValidElement(icon) ? (
        <span className="flex w-5 shrink-0 items-center justify-center">{icon}</span>
      ) : (
        <span className="w-5 shrink-0 text-center font-mono text-[10px]">{icon}</span>
      )}
      <span className="truncate">{name}</span>
    </button>
  )
}
