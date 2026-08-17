import { forwardRef, type InputHTMLAttributes } from 'react'

type InlineInputVariant = 'title' | 'heading' | 'code' | 'plain'

export type InlineInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  variant?: InlineInputVariant
}

// Chrome-less field that reads as the text it edits until you focus it. Used for
// document titles and pattern bars, where the boxed `Input` would put a second
// border inside a row that already has one.
//
// It exists because five call sites (snippet title, request name, environment
// name, regex pattern, regex replacement) had each hand-rolled the same idea
// with a different class string — and two of them shipped without any focus
// indicator, so keyboard users could not see where they were.
const VARIANT_CLASSES: Record<InlineInputVariant, string> = {
  /** Document title sitting above a metadata line — snippet title, request name. */
  title: 'text-sm font-semibold',
  /** Larger single heading that titles a whole pane — environment name. */
  heading: 'text-base font-bold',
  /** Code the user is composing rather than prose — regex pattern, replacement. */
  code: 'font-mono text-sm',
  /** Ordinary text at the ambient size, sitting inside a control that draws its own box — the
   *  tag entry at the end of a chip row. */
  plain: 'text-xs',
}

// The focus ring is the whole point of the shared component: it's the one thing
// the hand-rolled versions kept dropping, and it's the only affordance a
// borderless field has.
const BASE_CLASSES =
  'min-w-0 rounded-[var(--radius-sm)] bg-transparent text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50'

export const InlineInput = forwardRef<HTMLInputElement, InlineInputProps>(
  ({ variant = 'title', className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`}
        {...props}
      />
    )
  }
)
InlineInput.displayName = 'InlineInput'
