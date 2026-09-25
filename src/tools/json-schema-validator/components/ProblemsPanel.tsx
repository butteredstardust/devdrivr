import { useId } from 'react'
import { Button } from '@/components/shared/Button'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { MAX_ISSUES, type ValidationIssue } from '@/tools/json-schema-validator/json-schema-helpers'

export function ProblemsPanel({
  issues,
  total,
  open,
  onToggle,
  onSelect,
}: {
  issues: ValidationIssue[]
  total: number
  open: boolean
  onToggle: () => void
  onSelect: (issue: ValidationIssue) => void
}) {
  const listId = useId()
  return (
    <section
      aria-label="Problems"
      className="flex max-h-52 min-h-0 shrink-0 flex-col border-t border-[var(--color-border)]"
    >
      <PaneHeader
        title="Problems"
        // `hint`, not `status`: the tool's own summary bar already announces the count, and a
        // second live region saying the same number means a screen reader reads it twice.
        hint={
          <>
            <span className="text-[var(--color-error)]">{total}</span>
            {total > MAX_ISSUES && <> · showing the first {MAX_ISSUES}</>}
          </>
        }
        actions={
          <Button
            variant="ghost"
            size="xs"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={listId}
          >
            {open ? 'Hide' : 'Show'}
          </Button>
        }
      />
      {open && (
        <ul id={listId} className="min-h-0 flex-1 overflow-auto py-1">
          {issues.map((issue, i) => (
            <li key={`${issue.pointer}-${issue.keyword}-${i}`}>
              {/* eslint-disable-next-line no-restricted-syntax -- a full-width list row rather than a control: it must fill the panel and keep the monospace pointer aligned, which every Button variant would override. */}
              <button
                type="button"
                onClick={() => onSelect(issue)}
                title="Jump to this path in the data"
                className="flex w-full items-start gap-2 px-3 py-0.5 text-left text-xs hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <span className="shrink-0 rounded bg-[var(--color-surface)] px-1 text-2xs text-[var(--color-text-muted)]">
                  {issue.keyword}
                </span>
                <code className="shrink-0 text-[var(--color-accent)]">{issue.label}</code>
                <span className="text-[var(--color-error)]">{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
