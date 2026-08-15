import type { ReactNode } from 'react'

type ToolLayoutHeader = {
  title: string
  description?: string
  actions?: ReactNode
}

type ToolLayoutProps = {
  /** Optional title/description/actions row. Most tools skip this — the tool name already
   *  lives in the sidebar/tab strip — but it's here for tools whose body needs its own heading. */
  header?: ToolLayoutHeader
  /** Rendered as-is above the body, below the header. Tools own their toolbar's internal
   *  layout (single row, wrapped rows, stacked rows) — ToolLayout only positions the slot. */
  toolbar?: ReactNode
  children: ReactNode
  /** Edge-to-edge body for editor-style tools (split panes, Monaco, canvas). No padding, no
   *  max-w constraint — the tool's children own the full remaining height and width. */
  fullBleed?: boolean
  /** Tailwind `max-w-*` class applied to the body when not full-bleed. Keeps form-style
   *  content (a handful of labelled rows) from stretching into a 1200px-wide bar. */
  maxWidth?: string
  className?: string
}

// Layout contract shared by every tool: an optional header, an optional toolbar, and a body
// that's either padded + width-capped (form-style tools) or edge-to-edge (editor-style tools).
export function ToolLayout({
  header,
  toolbar,
  children,
  fullBleed = false,
  maxWidth = 'max-w-3xl',
  className = '',
}: ToolLayoutProps) {
  return (
    <div className={`flex h-full flex-col ${className}`}>
      {header && (
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-ui text-sm font-semibold text-[var(--color-text)]">
              {header.title}
            </h2>
            {header.description && (
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{header.description}</p>
            )}
          </div>
          {header.actions && (
            <div className="flex shrink-0 items-center gap-2">{header.actions}</div>
          )}
        </div>
      )}
      {toolbar && <div className="shrink-0 bg-[var(--color-surface)]">{toolbar}</div>}
      {fullBleed ? (
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <div className={`mx-auto w-full ${maxWidth}`}>{children}</div>
        </div>
      )}
    </div>
  )
}
