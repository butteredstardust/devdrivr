import type { ReactNode } from 'react'

type FieldProps = {
  label: string
  /**
   * The id of the control this labels. Pass it when the field holds more than one interactive
   * element — a text input next to a button, say — because a wrapping label forwards clicks to
   * whichever labelable descendant comes first, which in that layout is the wrong one.
   *
   * Omit it for the ordinary one-control field and the wrapper becomes the `<label>` itself, so
   * the association is structural and there's no id to keep in sync.
   */
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}

/**
 * Vertical label-above-control field.
 *
 * The audit found this hand-rolled in sixteen files, and in most of them the `<label>` was a bare
 * sibling of the control with no `htmlFor` and nothing wrapped — markup that renders identically
 * and labels nothing at all. Clicking the text did nothing and a screen reader announced the input
 * unnamed. That's the failure this primitive exists to make unrepeatable, which is why the default
 * path needs no id from the caller.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = '',
}: FieldProps) {
  const Wrapper = htmlFor ? 'div' : 'label'

  return (
    <Wrapper className={`flex flex-col gap-1 ${className}`}>
      {/* font-ui, not font-mono: a field name is chrome naming the control, not content. */}
      {htmlFor ? (
        <label htmlFor={htmlFor} className="font-ui text-xs text-[var(--color-text-muted)]">
          {label}
          {required && <span className="text-[var(--color-error)]"> *</span>}
        </label>
      ) : (
        <span className="font-ui text-xs text-[var(--color-text-muted)]">
          {label}
          {required && <span className="text-[var(--color-error)]"> *</span>}
        </span>
      )}
      {children}
      {error ? (
        <span role="alert" className="text-2xs text-[var(--color-error)]">
          {error}
        </span>
      ) : (
        hint && <span className="text-2xs text-[var(--color-text-muted)]">{hint}</span>
      )}
    </Wrapper>
  )
}
