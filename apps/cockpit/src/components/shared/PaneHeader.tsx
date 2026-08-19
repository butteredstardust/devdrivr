import type { ReactNode } from 'react'
import { SectionLabel } from './SectionLabel'

type PaneHeaderProps = {
  title: ReactNode
  /** Muted detail beside the title — a line count, a byte size, a language. */
  hint?: ReactNode
  /**
   * Live outcome for this pane specifically (parse state, match count). Announced politely.
   * Static context that never settles belongs in `hint`, which isn't announced.
   */
  status?: ReactNode
  /** Trailing controls — usually a `CopyButton` or a one-icon action. */
  actions?: ReactNode
  className?: string
}

/**
 * The header strip above one pane of a split.
 *
 * This existed as a copy-pasted class string in five tools and as three differently-padded
 * variants in five more. None of the copies had an actions slot, which is why `CopyButton`
 * placement wandered pane to pane — some tools put it in the tool toolbar, some floated it over
 * the pane, some left it out.
 */
export function PaneHeader({ title, hint, status, actions, className = '' }: PaneHeaderProps) {
  return (
    <div
      className={`flex min-h-8 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 ${className}`}
    >
      <SectionLabel className="min-w-0 flex-1" hint={hint}>
        <span className="truncate">{title}</span>
      </SectionLabel>
      {status && (
        <span
          role="status"
          aria-live="polite"
          className="min-w-0 truncate text-2xs text-[var(--color-text-muted)]"
        >
          {status}
        </span>
      )}
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  )
}
