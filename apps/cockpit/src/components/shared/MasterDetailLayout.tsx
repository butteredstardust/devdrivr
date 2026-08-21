import type { ReactNode } from 'react'
import { Button } from './Button'
import { SidebarSimpleIcon } from '@phosphor-icons/react'

type MasterDetailLayoutProps = {
  /** Library/list side. Rendered inside an `<aside>` — don't add your own. */
  sidebar: ReactNode
  /** Sidebar heading. Library tools legitimately show their own title; the tab strip names the
   *  tool, this names the collection inside it. */
  title: string
  /** Muted subtitle under the title — usually a count. */
  subtitle?: ReactNode
  /** Primary action for the collection, e.g. a "New" button. */
  sidebarActions?: ReactNode
  children: ReactNode
  /** Controlled collapse. Omit both to render a permanently visible sidebar. */
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
  className?: string
}

/**
 * Sidebar-plus-detail shell for library-style tools (snippets, prompt templates, saved requests).
 *
 * Those three tools each hand-rolled this and arrived somewhere different: two bypassed
 * `ToolLayout` entirely with their own `<h1>`, the third nested a sidebar beside a `fullBleed`
 * body. Same shape, three implementations, three sets of breakpoints.
 *
 * The sidebar is a fixed-width column rather than a `SplitPane` on purpose — a list of names has
 * a right width, and making it draggable adds a decision without adding a capability.
 */
export function MasterDetailLayout({
  sidebar,
  title,
  subtitle,
  sidebarActions,
  children,
  sidebarOpen = true,
  onToggleSidebar,
  className = '',
}: MasterDetailLayoutProps) {
  return (
    <div className={`flex h-full min-h-0 bg-[var(--color-bg)] ${className}`}>
      <aside
        aria-label={title}
        // The collapsed state below hides the pane from the eye and the mouse but not from the
        // tab order or the accessibility tree, so its list and header would still be announced
        // and tabbable while the pane reads as closed. `inert` covers all three.
        inert={!sidebarOpen}
        // Narrows below 1000px, the density breakpoint — see DESIGN_SYSTEM.md § Breakpoints. This
        // comment used to claim 1100px matched SnippetsManager; it did not, SnippetsManager has
        // always used 1000px, and that mismatch is where the drift came from.
        // It's a viewport query rather than a container query because the workspace isn't a
        // `@container` — worth revisiting if one is ever introduced, since the app sidebar and
        // notes drawer both steal width this query can't see.
        className={`flex min-h-0 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width,opacity] duration-200 ease-in-out ${
          sidebarOpen
            ? 'w-64 opacity-100 max-[1000px]:w-52'
            : 'pointer-events-none w-0 overflow-hidden border-r-0 opacity-0'
        }`}
      >
        <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-ui truncate text-sm font-semibold text-[var(--color-text)]">
              {title}
            </h2>
            {subtitle && (
              <p className="truncate text-2xs text-[var(--color-text-muted)]">{subtitle}</p>
            )}
          </div>
          {sidebarActions}
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {onToggleSidebar && (
          <div className="flex shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1">
            <Button
              variant="icon"
              size="sm"
              onClick={onToggleSidebar}
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? `Hide ${title}` : `Show ${title}`}
              className={sidebarOpen ? 'text-[var(--color-accent)]' : undefined}
            >
              <SidebarSimpleIcon size={14} aria-hidden="true" />
            </Button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
