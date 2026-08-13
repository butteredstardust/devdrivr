import { forwardRef, type SelectHTMLAttributes } from 'react'

type SelectSize = 'sm' | 'md'

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  size?: SelectSize
}

const SIZE_CLASSES: Record<SelectSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1.5 text-sm',
}

const BASE_CLASSES =
  'rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring)] transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none'

// A native <select> is the accessible choice here — it gets OS-native keyboard
// navigation, screen-reader support, and mobile pickers for free. Styling is
// limited to colors/spacing (all token-driven); the browser still owns the
// popup/listbox rendering, which is what we want.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ size = 'sm', className = '', ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`${BASE_CLASSES} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      />
    )
  }
)
Select.displayName = 'Select'
