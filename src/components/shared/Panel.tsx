import type { ReactNode } from 'react'

type PanelProps = {
  children: ReactNode
  title?: string
  actions?: ReactNode
  /** Set false when a child already manages its own padding (e.g. a scrollable list). */
  padded?: boolean
  className?: string
}

// Generic bordered/raised container — groups related content with an
// optional header row (title + actions), used in place of the repeated
// `rounded border border-[var(--color-border)] bg-[var(--color-surface)]`
// wrapper hand-rolled throughout the tools.
export function Panel({ children, title, actions, padded = true, className = '' }: PanelProps) {
  return (
    <div
      className={`rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
          {title && <h3 className="text-xs font-bold text-[var(--color-text)]">{title}</h3>}
          {actions}
        </div>
      )}
      <div className={padded ? 'p-3' : ''}>{children}</div>
    </div>
  )
}
