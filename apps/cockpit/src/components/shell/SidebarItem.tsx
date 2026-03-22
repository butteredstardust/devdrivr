import type { ReactNode } from 'react'
import { useUiStore } from '@/stores/ui.store'

type SidebarItemProps = {
  id: string
  name: string
  icon: ReactNode
}

export function SidebarItem({ id, name, icon }: SidebarItemProps) {
  const activeTool = useUiStore((s) => s.activeTool)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const isActive = activeTool === id

  return (
    <button
      onClick={() => setActiveTool(id)}
      title={name}
      className={`flex h-9 w-full items-center gap-2 rounded-sm px-2 text-xs transition-colors ${
        isActive
          ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
      }`}
    >
      <span className="w-5 shrink-0 text-center font-pixel text-[10px]">{icon}</span>
      <span className="truncate">{name}</span>
    </button>
  )
}
