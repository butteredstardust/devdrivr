import { type ReactNode, isValidElement } from 'react'
import { useUiStore } from '@/stores/ui.store'

type SidebarItemProps = {
  id: string
  name: string
  icon: string | ReactNode
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
          ? 'border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-dim)] pl-1.5 text-[var(--color-accent)]'
          : 'border-l-2 border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
      }`}
    >
      {isValidElement(icon) ? (
        <span className="flex w-5 shrink-0 items-center justify-center">{icon}</span>
      ) : (
        <span className="w-5 shrink-0 text-center font-pixel text-[10px]">{icon}</span>
      )}
      <span className="truncate">{name}</span>
    </button>
  )
}
