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
      className={`flex items-center gap-2 px-4 py-2 ${wrap ? 'flex-wrap' : 'overflow-x-auto'} ${border ? 'border-b border-[var(--color-border)]' : ''} ${className}`}
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
