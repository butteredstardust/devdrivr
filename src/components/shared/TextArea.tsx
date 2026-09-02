import { forwardRef, type TextareaHTMLAttributes } from 'react'

type TextAreaSize = 'sm' | 'md'

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  size?: TextAreaSize
  monospace?: boolean
}

const SIZE_CLASSES: Record<TextAreaSize, string> = {
  sm: 'px-3 py-2 text-xs leading-5',
  md: 'px-3 py-2 text-sm leading-6',
}

const BASE_CLASSES =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none transition-colors duration-[var(--duration-fast)] focus:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50'

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ size = 'sm', monospace = false, className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      className={`${BASE_CLASSES} ${SIZE_CLASSES[size]} ${monospace ? 'font-mono' : ''} ${className}`}
      {...props}
    />
  )
)

TextArea.displayName = 'TextArea'
