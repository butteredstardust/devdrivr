import { useId } from 'react'

type ToggleProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  /**
   * Names the switch from text rendered elsewhere — a `SettingsRow` label, say. A switch is a
   * `<button role="switch">`, which is not a labelable element, so an enclosing `<label>` gives
   * it no name; without one of these it is announced as an unnamed button.
   */
  'aria-labelledby'?: string
  'aria-label'?: string
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  'aria-labelledby': ariaLabelledBy,
  'aria-label': ariaLabel,
}: ToggleProps) {
  const id = useId()

  return (
    <div className="flex items-center gap-2">
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-[var(--duration-panel)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
          checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full bg-[var(--color-surface-raised)] shadow-sm transition-transform duration-[var(--duration-panel)] ${
            checked ? 'translate-x-[14px]' : 'translate-x-0'
          }`}
        />
      </button>
      {label && (
        <label htmlFor={id} className="cursor-pointer text-xs text-[var(--color-text)]">
          {label}
        </label>
      )}
    </div>
  )
}
