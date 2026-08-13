import type { ReactNode } from 'react'

type FieldProps = {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}

// Vertical label-above-control wrapper — matches the `<label>` + control
// pattern already hand-rolled across tools/modals (e.g. SaveRequestModal's
// "Request Name" field, AuthTab's field rows).
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = '',
}: FieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="font-mono text-xs text-[var(--color-text-muted)]">
        {label}
        {required && <span className="text-[var(--color-error)]"> *</span>}
      </label>
      {children}
      {error ? (
        <span role="alert" className="text-[10px] text-[var(--color-error)]">
          {error}
        </span>
      ) : (
        hint && <span className="text-[10px] text-[var(--color-text-muted)]">{hint}</span>
      )}
    </div>
  )
}
