import type { ReactNode } from 'react'

type AlertVariant = 'error' | 'success' | 'warning' | 'info'

type AlertProps = {
  variant: AlertVariant
  children: ReactNode
  className?: string
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error: 'bg-[var(--color-error)]/10 text-[var(--color-error)] border-l-[var(--color-error)]',
  success: 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-l-[var(--color-success)]',
  warning: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-l-[var(--color-warning)]',
  info: 'bg-[var(--color-info)]/10 text-[var(--color-info)] border-l-[var(--color-info)]',
}

export function Alert({ variant, children, className = '' }: AlertProps) {
  return (
    <div
      role="alert"
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={`rounded border-l-2 px-3 py-2 text-xs ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </div>
  )
}
