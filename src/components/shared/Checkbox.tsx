import { forwardRef, useEffect, useRef, type InputHTMLAttributes } from 'react'
import { CheckIcon, MinusIcon } from '@phosphor-icons/react'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  /** Renders the mixed state. Also sets `input.indeterminate`, which has no HTML attribute. */
  indeterminate?: boolean
}

/**
 * The multi-select control. `Toggle` is a `role="switch"` — it means "this setting is on",
 * takes effect immediately, and is 32px wide; a checkbox means "this item is part of a set"
 * and has to sit in a dense list row. Six call sites had reached for a raw
 * `<input type="checkbox" className="accent-[var(--color-accent)]">` instead, and no two
 * agreed on the vertical nudge that follows (`mt-0.5`, `mt-1`, nothing), because
 * `accent-color` styles the OS checkbox and leaves its box metrics unknowable.
 *
 * So the native input stays for semantics, keyboard and form behaviour, but is made
 * transparent and stretched over the box we draw, which is sized in the same tokens as
 * every other control. `peer` + `peer-checked`/`peer-focus-visible` do the state styling
 * with no JS.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ indeterminate = false, className = '', disabled, ...props }, forwardedRef) => {
    const localRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      if (localRef.current) localRef.current.indeterminate = indeterminate
    }, [indeterminate])

    return (
      <span
        className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center ${className}`}
      >
        <input
          ref={(node) => {
            localRef.current = node
            if (typeof forwardedRef === 'function') forwardedRef(node)
            else if (forwardedRef) forwardedRef.current = node
          }}
          type="checkbox"
          disabled={disabled}
          aria-checked={indeterminate ? 'mixed' : undefined}
          className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-[var(--radius-sm)] disabled:cursor-not-allowed"
          {...props}
        />
        <span
          aria-hidden="true"
          /* The glyph's visibility rides on `color`, not `opacity`, because `peer-*`
             variants only match siblings of the peer — this span is one, the icon
             inside it is not. Transparent text hides the icon; `peer-checked` and
             `peer-indeterminate` paint it. */
          className={`pointer-events-none flex h-full w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-transparent transition-colors duration-[var(--duration-fast)] peer-checked:border-[var(--color-accent)] peer-checked:bg-[var(--color-accent)] peer-checked:text-[var(--color-bg)] peer-indeterminate:border-[var(--color-accent)] peer-indeterminate:bg-[var(--color-accent)] peer-indeterminate:text-[var(--color-bg)] peer-focus-visible:shadow-[var(--focus-ring)] ${
            disabled ? 'opacity-50' : ''
          }`}
        >
          {indeterminate ? (
            <MinusIcon size={12} weight="bold" />
          ) : (
            <CheckIcon size={12} weight="bold" />
          )}
        </span>
      </span>
    )
  }
)

Checkbox.displayName = 'Checkbox'
