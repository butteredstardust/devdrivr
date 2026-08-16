import { forwardRef, type InputHTMLAttributes } from 'react'

// Select now lives in its own primitive file — re-exported here so the many
// existing `import { Input, Select } from '@/components/shared/Input'` call
// sites keep working unchanged.
export { Select, type SelectProps } from './Select'

type InputSize = 'sm' | 'md'

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  size?: InputSize
}

const SIZE_CLASSES: Record<InputSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1.5 text-sm',
}

const BASE_CLASSES =
  'rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring)] transition-colors duration-150 disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ size = 'sm', className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`${BASE_CLASSES} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'
