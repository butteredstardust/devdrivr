import { useId } from 'react'
import {
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  InfoIcon,
  ListBulletsIcon,
} from '@phosphor-icons/react'
import { Alert } from '@/components/shared/Alert'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { ProblemsList } from '@/components/shared/ProblemsList'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import type { HtmlIssue } from '@/tools/html-validator/html-helpers'
import type { Panel } from '@/tools/html-validator/html-validator-types'

// ---------------------------------------------------------------------------
// Problems / outline
// ---------------------------------------------------------------------------

export function ResultsPanel({
  panel,
  open,
  onPanelChange,
  onToggleOpen,
  issues,
  errorCount,
  warningCount,
  isValidating,
  hasValidated,
  hasInput,
  headings,
  outlineIssues,
  onGoToIssue,
  onGoToHeading,
}: {
  panel: Panel
  open: boolean
  onPanelChange: (next: Panel) => void
  onToggleOpen: () => void
  issues: HtmlIssue[]
  errorCount: number
  warningCount: number
  isValidating: boolean
  hasValidated: boolean
  hasInput: boolean
  headings: { level: number; text: string; line?: number; column?: number }[]
  outlineIssues: { message: string; headingIndex: number }[]
  onGoToIssue: (issue: HtmlIssue) => void
  onGoToHeading: (heading: { level: number; text: string; line?: number; column?: number }) => void
}) {
  const panelId = useId()
  const Caret = open ? CaretDownIcon : CaretUpIcon

  return (
    <section
      aria-label="Problems and outline"
      className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <SegmentedControl
          aria-label="Results panel"
          value={panel}
          onChange={onPanelChange}
          options={[
            { value: 'problems' as const, label: `Problems (${issues.length})` },
            { value: 'outline' as const, label: `Outline (${headings.length})` },
          ]}
        />
        {panel === 'problems' && issues.length > 0 && (
          <span className="text-2xs text-[var(--color-text-muted)]">
            {errorCount} error{errorCount === 1 ? '' : 's'} · {warningCount} warning
            {warningCount === 1 ? '' : 's'}
          </span>
        )}
        {isValidating && <span className="text-2xs text-[var(--color-text-muted)]">Checking…</span>}
        <Button
          variant="ghost"
          size="xs"
          onClick={onToggleOpen}
          aria-expanded={open}
          {...(open ? { 'aria-controls': panelId } : {})}
          className="ml-auto gap-1"
        >
          <Caret size={12} aria-hidden="true" />
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>

      {open && (
        <div id={panelId} className="max-h-48 overflow-auto border-t border-[var(--color-border)]">
          {panel === 'problems' ? (
            issues.length === 0 ? (
              // Before the first run reports, an empty list is not a clean bill
              // of health — saying "No problems" there would be a guess.
              <EmptyState
                size="sm"
                {...(!hasInput
                  ? { icon: InfoIcon }
                  : hasValidated
                    ? { icon: CheckCircleIcon }
                    : {})}
                title={
                  !hasInput
                    ? 'Nothing to check yet'
                    : hasValidated
                      ? 'No problems found'
                      : 'Checking this document…'
                }
                description={
                  !hasInput
                    ? 'Problems appear here as you type.'
                    : hasValidated
                      ? 'Every enabled rule passed on this document.'
                      : 'Every enabled rule is being run against the source.'
                }
              />
            ) : (
              <ProblemsList
                items={issues.map((issue, index) => ({
                  id: `${issue.rule}-${issue.line}-${issue.col}-${index}`,
                  message: issue.message,
                  severity: issue.type,
                  line: issue.line,
                  column: issue.col,
                  code: issue.rule,
                }))}
                onSelect={(problem) =>
                  onGoToIssue({
                    type: problem.severity === 'error' ? 'error' : 'warning',
                    rule: problem.code ?? 'validator',
                    message: problem.message,
                    line: problem.line ?? 1,
                    col: problem.column ?? 1,
                  })
                }
              />
            )
          ) : headings.length === 0 ? (
            <EmptyState
              size="sm"
              icon={ListBulletsIcon}
              title="No headings"
              description="Headings from h1 to h6 are listed here in document order."
            />
          ) : (
            <div className="p-3">
              {outlineIssues.length > 0 && (
                <Alert variant="warning" className="mb-2 text-2xs">
                  <ul>
                    {outlineIssues.map((problem) => (
                      <li key={problem.message}>
                        <Button
                          variant="ghost"
                          size="xs"
                          type="button"
                          onClick={() => {
                            const heading = headings[problem.headingIndex]
                            if (heading) onGoToHeading(heading)
                          }}
                          className="text-left hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                        >
                          {problem.message}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}
              <ul className="flex flex-col gap-0.5">
                {headings.map((heading, index) => (
                  <li
                    key={`${heading.level}-${index}`}
                    style={{ paddingLeft: (heading.level - 1) * 16 }}
                  >
                    <Button
                      variant="ghost"
                      size="xs"
                      type="button"
                      onClick={() => onGoToHeading(heading)}
                      title={`Go to line ${heading.line ?? 1}, column ${heading.column ?? 1}`}
                      className="w-full truncate rounded text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                    >
                      <span className="mr-1.5 font-mono text-2xs text-[var(--color-accent)]">
                        h{heading.level}
                      </span>
                      {heading.text || (
                        <span className="text-[var(--color-text-muted)]">(empty heading)</span>
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
