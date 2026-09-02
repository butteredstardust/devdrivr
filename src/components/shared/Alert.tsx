import type { ComponentType, ReactNode } from 'react'
import { CheckCircleIcon, InfoIcon, WarningCircleIcon, XCircleIcon } from '@phosphor-icons/react'

type AlertVariant = 'error' | 'success' | 'warning' | 'info'

type AlertProps = {
  variant: AlertVariant
  children: ReactNode
  className?: string
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error: 'bg-[var(--color-error)]/10 text-[var(--color-error)] border-l-[var(--color-error)]',
  success:
    'bg-[var(--color-success)]/10 text-[var(--color-success)] border-l-[var(--color-success)]',
  warning:
    'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-l-[var(--color-warning)]',
  info: 'bg-[var(--color-info)]/10 text-[var(--color-info)] border-l-[var(--color-info)]',
}

const VARIANT_ICONS = {
  error: XCircleIcon,
  success: CheckCircleIcon,
  warning: WarningCircleIcon,
  info: InfoIcon,
} satisfies Record<AlertVariant, ComponentType<{ size?: number; weight?: 'fill' }>>

export function Alert({ variant, children, className = '' }: AlertProps) {
  const Icon = VARIANT_ICONS[variant]
  return (
    <div
      role="alert"
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={`flex items-start gap-2 rounded-[var(--radius-md)] border-l-2 px-3 py-2 text-xs ${VARIANT_CLASSES[variant]} ${className}`}
    >
      <Icon size={14} weight="fill" aria-hidden="true" className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
