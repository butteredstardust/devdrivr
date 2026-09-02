import type { ReactNode } from 'react'

type ToolLayoutProps = {
  /** Rendered as-is above the body. Tools own their toolbar's internal
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

/**
 * Layout contract shared by every tool: an optional toolbar and a body that's either padded +
 * width-capped (form-style tools) or edge-to-edge (editor-style tools).
 *
 * There is deliberately no title slot. The tab strip names the tool, and the one family that
 * legitimately shows a heading of its own — the library tools — names a *collection*, not the
 * tool, which is `MasterDetailLayout`'s job. A `header` prop existed here for a while and reached
 * zero consumers, while two tools hand-rolled the sidebar heading it couldn't express.
 */
export function ToolLayout({
  toolbar,
  children,
  fullBleed = false,
  maxWidth = 'max-w-3xl',
  className = '',
}: ToolLayoutProps) {
  return (
    <div className={`flex h-full flex-col ${className}`}>
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
