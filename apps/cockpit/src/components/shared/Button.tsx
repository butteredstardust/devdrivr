import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'
type ButtonSize = 'xs' | 'sm' | 'md'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner in place of the label without changing the button's rendered width. */
  loading?: boolean
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-accent)] text-[var(--color-bg)] hover:brightness-110 active:brightness-90',
  secondary:
    'border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]',
  ghost:
    'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]',
  danger:
    'border border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)]/10 active:bg-[var(--color-error)]/20',
  // Icon-only footprint — square padding via ICON_SIZE_CLASSES, no text sizing.
  icon: 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'px-1.5 py-0.5 text-xs',
  sm: 'px-2 py-1 text-xs',
  md: 'px-4 py-2 text-xs',
}

// icon variant ignores horizontal text padding — square footprint sized off the same scale
const ICON_SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'p-1',
  sm: 'p-1.5',
  md: 'p-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      disabled,
      title,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const sizeClasses = variant === 'icon' ? ICON_SIZE_CLASSES[size] : SIZE_CLASSES[size]
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        title={title ?? (variant === 'icon' ? props['aria-label'] : undefined)}
        className={`font-ui relative inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${VARIANT_CLASSES[variant]} ${sizeClasses} ${className}`}
        {...props}
      >
        {loading ? (
          <>
            {/* Children stay in the layout (just hidden) so loading never changes button width. */}
            <span className="invisible inline-flex items-center justify-center gap-1.5">
              {children}
            </span>
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <Spinner size="sm" />
            </span>
          </>
        ) : (
          children
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
