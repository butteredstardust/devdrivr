import type { ElementType, ReactNode } from 'react'

type SectionLabelProps = {
  children: ReactNode
  /**
   * Document structure, chosen independently of the visual — which is identical either way.
   *
   * The audit found `<h2>` used for pane labels that aren't headings and `<span>` used for
   * genuine section headings, because the two decisions were welded together by copy-paste.
   * Pick `span` for a label that names a region of the current view, and a heading level for
   * something that belongs in the document outline.
   */
  as?: Extract<ElementType, 'span' | 'div' | 'h2' | 'h3' | 'h4'>
  /** Trailing muted detail on the same line — a count, a size, a state. Not uppercased. */
  hint?: ReactNode
  className?: string
}

/**
 * The small uppercase label that names a region.
 *
 * Before this existed there were seven idioms for it, varying on font (`font-ui` vs `font-mono`),
 * weight (`medium`/`semibold`/`bold`) and tracking (`wide`/`wider`/`widest`) with no rule
 * distinguishing them — which is most of why the tools read as different apps. It's `font-ui`
 * because a label naming a monospace region is chrome, not content.
 */
export function SectionLabel({
  children,
  as: Tag = 'span',
  hint,
  className = '',
}: SectionLabelProps) {
  return (
    <Tag
      className={`font-ui flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] ${className}`}
    >
      {children}
      {hint && <span className="font-normal normal-case tracking-normal opacity-80">{hint}</span>}
    </Tag>
  )
}
