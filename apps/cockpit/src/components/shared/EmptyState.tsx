import type { ReactNode } from 'react'

type EmptyStateSize = 'sm' | 'md'

type EmptyStateProps = {
  /** Phosphor icon component, e.g. `ToolboxIcon` — rendered with `weight="light"`. */
  icon?: React.ComponentType<{ size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' }>
  title: string
  description?: string
  /** `md` matches full-pane empties (Workspace's "Select a tool"); `sm` matches inline/compact empties. */
  size?: EmptyStateSize
  action?: ReactNode
  className?: string
}

const SIZE_CONFIG: Record<
  EmptyStateSize,
  { iconSize: number; padding: string; titleClass: string }
> = {
  md: { iconSize: 36, padding: 'p-8', titleClass: 'text-sm' },
  sm: { iconSize: 24, padding: 'p-6', titleClass: 'text-xs' },
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  size = 'md',
  action,
  className = '',
}: EmptyStateProps) {
  const config = SIZE_CONFIG[size]
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-center text-[var(--color-text-muted)] ${config.padding} ${className}`}
    >
      {Icon && <Icon size={config.iconSize} weight="light" />}
      <div>
        {/* Hierarchy comes from title-bright / description-muted. It used to come from
            muted / muted+opacity-60, which composited to ~0.36 alpha and failed WCAG AA on all
            23 themes. Muted on its own passes on all 23 — see DESIGN_SYSTEM.md § Colour. */}
        <p className={`${config.titleClass} text-[var(--color-text)]`}>{title}</p>
        {description && <p className="mt-1 text-xs">{description}</p>}
      </div>
      {action}
    </div>
  )
}
