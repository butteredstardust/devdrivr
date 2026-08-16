import type { ReactNode } from 'react'

type ToolbarProps = {
  children: ReactNode
  className?: string
  /** Bottom border — the common `border-b` toolbar row. Off for toolbars stacked under another bordered row. */
  border?: boolean
  /** Accessible label for a toolbar containing several action groups. */
  'aria-label'?: string
  /** Disable wrapping for horizontally scrollable editor toolbars. */
  wrap?: boolean
}

// Horizontal control bar — codifies the
// `flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2`
// row hand-rolled at the top of most tools (CsvTools, ApiClient, CodeFormatter, ...).
export function Toolbar({
  children,
  className = '',
  border = true,
  wrap = true,
  'aria-label': ariaLabel,
}: ToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={`flex min-h-10 items-center gap-2 bg-[var(--color-surface)] px-4 py-2 ${wrap ? 'flex-wrap' : 'overflow-x-auto'} ${border ? 'border-b border-[var(--color-border)]' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

type ToolbarGroupProps = {
  children: ReactNode
  label?: string
  separated?: boolean
  className?: string
}

export function ToolbarGroup({
  children,
  label,
  separated = false,
  className = '',
}: ToolbarGroupProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex shrink-0 items-center gap-1.5 ${separated ? 'border-l border-[var(--color-border)] pl-2' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function ToolbarSpacer() {
  return <div className="min-w-2 flex-1" aria-hidden="true" />
}

type DocumentToolbarProps = ToolbarProps

/**
 * Compact, wrapping chrome for document-oriented tools. Identity, view controls,
 * and primary actions share one row at normal widths and wrap as groups when the
 * workspace narrows.
 */
export function DocumentToolbar({ children, className = '', ...props }: DocumentToolbarProps) {
  return (
    <Toolbar {...props} className={`gap-x-3 gap-y-2 ${className}`}>
      {children}
    </Toolbar>
  )
}

type DocumentIdentityProps = {
  title: string
  titleTooltip?: string
  titleTestId?: string
  icon?: ReactNode
  stateLabel?: string
  stateChanged?: boolean
  status?: ReactNode
  statusIcon?: ReactNode
  statusTestId?: string
  /**
   * Off for identity lines whose "status" is static context (a file path, say)
   * rather than a result worth announcing. Keep it on for anything that settles.
   */
  statusLive?: boolean
  className?: string
}

/** File identity and live status used at the leading edge of a document toolbar. */
export function DocumentIdentity({
  title,
  titleTooltip,
  titleTestId,
  icon,
  stateLabel,
  stateChanged = false,
  status,
  statusIcon,
  statusTestId,
  statusLive = true,
  className = '',
}: DocumentIdentityProps) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${className}`}>
      {icon}
      <span
        data-testid={titleTestId}
        className="font-ui max-w-56 truncate text-xs font-semibold text-[var(--color-text)]"
        title={titleTooltip ?? title}
      >
        {title}
      </span>
      {stateLabel && (
        <span
          aria-live="polite"
          className={`shrink-0 text-2xs ${stateChanged ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
        >
          {stateLabel}
        </span>
      )}
      {status && (
        <span
          data-testid={statusTestId}
          role={statusLive ? 'status' : undefined}
          aria-live={statusLive ? 'polite' : undefined}
          className="flex min-w-0 items-center gap-1 truncate text-2xs text-[var(--color-text-muted)]"
        >
          {statusIcon}
          <span className="truncate">{status}</span>
        </span>
      )}
    </div>
  )
}
