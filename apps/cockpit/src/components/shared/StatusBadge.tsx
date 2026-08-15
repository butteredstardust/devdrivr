import type { ReactNode } from 'react'

type StatusBadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error'

type StatusBadgeProps = {
  variant?: StatusBadgeVariant
  children: ReactNode
  className?: string
}

const VARIANT_CLASSES: Record<StatusBadgeVariant, string> = {
  neutral: 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]',
  info: 'bg-[var(--color-info)]/15 text-[var(--color-info)]',
  success: 'bg-[var(--color-success)]/15 text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]',
  error: 'bg-[var(--color-error)]/15 text-[var(--color-error)]',
}

export function StatusBadge({ variant = 'neutral', children, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
