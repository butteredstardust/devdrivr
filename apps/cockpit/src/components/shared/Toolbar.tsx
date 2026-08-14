import type { ReactNode } from 'react'

type ToolbarProps = {
  children: ReactNode
  className?: string
  /** Bottom border — the common `border-b` toolbar row. Off for toolbars stacked under another bordered row. */
  border?: boolean
}

// Horizontal control bar — codifies the
// `flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2`
// row hand-rolled at the top of most tools (CsvTools, ApiClient, CodeFormatter, ...).
export function Toolbar({ children, className = '', border = true }: ToolbarProps) {
  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 ${border ? 'border-b border-[var(--color-border)]' : ''} ${className}`}
    >
      {children}
    </div>
  )
}
