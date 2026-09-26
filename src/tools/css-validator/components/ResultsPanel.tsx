import { useId } from 'react'
import { CaretDownIcon, CaretUpIcon, CheckCircleIcon, InfoIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { ProblemsList } from '@/components/shared/ProblemsList'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import type { CssIssue, SelectorInfo } from '@/tools/css-validator/css-helpers'
import type { Panel } from '@/tools/css-validator/css-validator-types'

// ---------------------------------------------------------------------------
// Problems / selectors
// ---------------------------------------------------------------------------

export function ResultsPanel({
  panel,
  open,
  onPanelChange,
  onToggleOpen,
  issues,
  totalIssues,
  errorCount,
  warningCount,
  isAnalyzing,
  hasAnalyzed,
  hasInput,
  selectors,
  totalSelectors,
  onGoTo,
}: {
  panel: Panel
  open: boolean
  onPanelChange: (next: Panel) => void
  onToggleOpen: () => void
  issues: CssIssue[]
  totalIssues: number
  errorCount: number
  warningCount: number
  isAnalyzing: boolean
  hasAnalyzed: boolean
  hasInput: boolean
  selectors: SelectorInfo[]
  totalSelectors: number
  onGoTo: (line: number, column: number) => void
}) {
  const panelId = useId()
  const Caret = open ? CaretDownIcon : CaretUpIcon

  return (
    <section
      aria-label="Problems and selectors"
      className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <SegmentedControl
          aria-label="Results panel"
          value={panel}
          onChange={onPanelChange}
          options={[
            { value: 'problems' as const, label: `Problems (${totalIssues})` },
            { value: 'selectors' as const, label: `Selectors (${totalSelectors})` },
          ]}
        />
        {panel === 'problems' && totalIssues > 0 && (
          <span className="text-2xs text-[var(--color-text-muted)]">
            {errorCount} error{errorCount === 1 ? '' : 's'} · {warningCount} warning
            {warningCount === 1 ? '' : 's'}
          </span>
        )}
        {isAnalyzing && <span className="text-2xs text-[var(--color-text-muted)]">Checking…</span>}
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
                {...(!hasInput ? { icon: InfoIcon } : hasAnalyzed ? { icon: CheckCircleIcon } : {})}
                title={
                  !hasInput
                    ? 'Nothing to check yet'
                    : hasAnalyzed
                      ? 'No problems found'
                      : 'Checking this stylesheet…'
                }
                description={
                  !hasInput
                    ? 'Problems appear here as you type.'
                    : hasAnalyzed
                      ? 'Every enabled rule passed on this stylesheet.'
                      : 'Every enabled rule is being run against the source.'
                }
              />
            ) : (
              <>
                <ProblemsList
                  items={issues.map((issue, index) => ({
                    id: `${issue.rule}-${issue.line}-${issue.column}-${index}`,
                    message: issue.message,
                    severity: issue.type,
                    line: issue.line,
                    column: issue.column,
                    code: issue.rule,
                  }))}
                  onSelect={(problem) => onGoTo(problem.line ?? 1, problem.column ?? 1)}
                />
                {totalIssues > issues.length && (
                  <p className="px-3 py-1.5 text-2xs text-[var(--color-text-muted)]">
                    {totalIssues - issues.length} more problem
                    {totalIssues - issues.length === 1 ? '' : 's'} not listed — fix these first, or
                    switch a rule off.
                  </p>
                )}
              </>
            )
          ) : selectors.length === 0 ? (
            <EmptyState
              size="sm"
              title="No selectors"
              description="Selectors are listed here most specific first, so the rules hardest to override sit at the top."
            />
          ) : (
            <ul>
              {selectors.map((selector, index) => (
                <li key={`${selector.text}-${selector.line}-${index}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onGoTo(selector.line, selector.column)}
                    className="w-full justify-start gap-2 rounded-none px-3 text-left"
                    title={`Go to line ${selector.line}`}
                  >
                    <span className="shrink-0 font-mono text-2xs text-[var(--color-text-muted)]">
                      {selector.line}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-text)]">
                      {selector.text}
                    </span>
                    <span
                      className={`shrink-0 rounded border px-1 font-mono text-2xs ${
                        selector.specificity[0] > 0
                          ? 'border-[var(--color-warning)] text-[var(--color-warning)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                      }`}
                      title="Specificity: ids, classes, elements"
                    >
                      {selector.specificity.join('-')}
                    </span>
                  </Button>
                </li>
              ))}
              {totalSelectors > selectors.length && (
                <li className="px-3 py-1.5 text-2xs text-[var(--color-text-muted)]">
                  {totalSelectors - selectors.length} less specific selector
                  {totalSelectors - selectors.length === 1 ? '' : 's'} not listed.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
