import { ArrowRightIcon, InfoIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react'

export type ProblemSeverity = 'error' | 'warning' | 'info'

export type ProblemItem = {
  id: string
  message: string
  severity?: ProblemSeverity
  line?: number
  column?: number
  code?: string
}

export function ProblemsList({
  items,
  onSelect,
  emptyMessage = 'No problems found.',
  className = '',
}: {
  items: ProblemItem[]
  onSelect?: (item: ProblemItem) => void
  emptyMessage?: string
  className?: string
}) {
  if (items.length === 0) {
    return (
      <p className={`px-3 py-2 text-xs text-[var(--color-text-muted)] ${className}`}>
        {emptyMessage}
      </p>
    )
  }

  return (
    <ul className={className}>
      {items.map((item) => {
        const Icon =
          item.severity === 'error'
            ? WarningCircleIcon
            : item.severity === 'info'
              ? InfoIcon
              : WarningIcon
        const color =
          item.severity === 'error'
            ? 'var(--color-error)'
            : item.severity === 'info'
              ? 'var(--color-info)'
              : 'var(--color-warning)'
        const content = (
          <>
            <Icon size={14} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color }} />
            {item.line !== undefined && (
              <span className="shrink-0 font-mono text-2xs tabular-nums text-[var(--color-text-muted)]">
                {item.line}:{item.column ?? 1}
              </span>
            )}
            <span className="min-w-0 flex-1 whitespace-pre-wrap text-xs text-[var(--color-text)]">
              {item.message}
            </span>
            {item.code && (
              <span className="shrink-0 rounded border border-[var(--color-border)] px-1 text-2xs text-[var(--color-text-muted)]">
                {item.code}
              </span>
            )}
            {onSelect && item.line !== undefined && (
              <ArrowRightIcon
                size={12}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-[var(--color-text-muted)]"
              />
            )}
          </>
        )

        return (
          <li key={item.id}>
            {onSelect && item.line !== undefined ? (
              <button
                type="button"
                onClick={() => onSelect(item)}
                title={`Go to line ${item.line}, column ${item.column ?? 1}`}
                className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-start gap-2 px-3 py-1.5">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
