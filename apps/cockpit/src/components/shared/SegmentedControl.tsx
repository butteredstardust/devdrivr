import { useRef, type ReactNode } from 'react'

export type SegmentedControlOption<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
}

type SegmentedControlSize = 'sm' | 'md'

type SegmentedControlProps<T extends string> = {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: SegmentedControlSize
  className?: string
  /** Required — segments are icon/short-label buttons with no visible group heading. */
  'aria-label': string
}

const SIZE_CLASSES: Record<SegmentedControlSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-xs',
}

// Single-select mode toggle (Match/Replace, Edit/Split/Preview, Formats/Shades/Harmony/CSS Var).
//
// role="radiogroup" + role="radio" rather than tablist/tab/tabpanel: these
// segments switch a *view mode*, not independently-addressable document
// sections with their own tabpanel — there's exactly one mutually exclusive
// choice at a time, which is what a native macOS/iOS segmented control also
// exposes to accessibility trees as (a radio group). Using tablist here would
// obligate every call site to wire aria-controls to a matching tabpanel,
// which none of the three migrated call sites' content structure supports.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  className = '',
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>())

  const selectAndFocus = (index: number) => {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    buttonRefs.current.get(option.value)?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        selectAndFocus((index + 1) % options.length)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        selectAndFocus((index - 1 + options.length) % options.length)
        break
      case 'Home':
        event.preventDefault()
        selectAndFocus(0)
        break
      case 'End':
        event.preventDefault()
        selectAndFocus(options.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-0.5 ${className}`}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el) buttonRefs.current.set(option.value, el)
              else buttonRefs.current.delete(option.value)
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`font-ui inline-flex items-center gap-1 rounded-[var(--radius-sm)] transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${SIZE_CLASSES[size]} ${
              selected
                ? 'bg-[var(--color-accent)] font-bold text-[var(--color-bg)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
