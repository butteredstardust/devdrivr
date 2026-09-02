import { useEffect, useState } from 'react'

type SpinnerSize = 'xs' | 'sm' | 'md'

// Matches the icon-scale sizes already used across the app (CopyButton, tab icons, etc.)
const SIZE_CLASSES: Record<SpinnerSize, string> = {
  xs: 'h-2.5 w-2.5 border-[1.5px]',
  sm: 'h-3 w-3 border-2',
  md: 'h-4 w-4 border-2',
}

type SpinnerProps = {
  size?: SpinnerSize
  className?: string
  /** Accessible label for the status role. Defaults to "Loading". */
  label?: string
}

/**
 * Single shared spinner primitive. Renders a rotating ring using the current
 * text color (`border-current`) so it inherits color from its container.
 * Degrades to a static ring under `prefers-reduced-motion` via the global
 * `.animate-spin` override in `src/index.css` — it never disappears.
 */
export function Spinner({ size = 'sm', className = '', label = 'Loading' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${SIZE_CLASSES[size]} ${className}`}
    />
  )
}

/**
 * Reports `active` as `true` only after it has stayed `true` continuously for
 * `delayMs`. Use this to gate loading indicators so operations that finish
 * quickly never flash a spinner. Reports `false` immediately once `active`
 * goes false.
 */
export function useDelayedLoading(active: boolean, delayMs = 150): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  return visible
}
