import { useId, useMemo, useState, type ReactNode } from 'react'
import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { countDuplicateRows, type ColumnSummary, type CsvRow } from './csv-helpers'

export type SchemaLanguage = 'typescript' | 'sql'

type CsvAnalyzeProps = {
  columns: string[]
  rows: CsvRow[]
  summaries: ColumnSummary[]
  schema: string
  schemaLanguage: SchemaLanguage
  onSchemaLanguageChange: (language: SchemaLanguage) => void
}

const SCHEMA_OPTIONS = [
  { value: 'typescript' as const, label: 'TypeScript' },
  { value: 'sql' as const, label: 'SQL' },
]

const TYPE_COLORS: Record<ColumnSummary['type'], string> = {
  number: 'text-[var(--color-accent)]',
  boolean: 'text-[var(--color-accent)]',
  date: 'text-[var(--color-accent)]',
  string: 'text-[var(--color-text-muted)]',
  mixed: 'text-[var(--color-warning)]',
  empty: 'text-[var(--color-text-muted)]',
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/**
 * A disclosure, not a tab: the old accordion tracked a single open panel in one
 * piece of state with three values and only two panels, so opening "Column
 * statistics" while it was open collapsed everything.
 */
function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  return (
    <section className="mb-4">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full justify-between gap-2 py-2 font-semibold"
      >
        {title}
        {open ? (
          <CaretDownIcon size={12} aria-hidden="true" />
        ) : (
          <CaretRightIcon size={12} aria-hidden="true" />
        )}
      </Button>
      {/* Rendered even when closed, with `hidden`: an `aria-controls` that
          points at nothing is a broken reference to a screen reader. */}
      <div id={panelId} hidden={!open} className="mt-2">
        {children}
      </div>
    </section>
  )
}

export default function CsvAnalyze({
  columns,
  rows,
  summaries,
  schema,
  schemaLanguage,
  onSchemaLanguageChange,
}: CsvAnalyzeProps) {
  const duplicates = useMemo(() => countDuplicateRows(columns, rows), [columns, rows])
  const blankCells = summaries.reduce((total, summary) => total + summary.blanks, 0)
  const mixedColumns = summaries.filter((summary) => summary.type === 'mixed')
  const emptyColumns = summaries.filter((summary) => summary.type === 'empty')

  return (
    <div className="h-full min-h-0 overflow-auto p-4">
      <Disclosure title="Column statistics" defaultOpen>
        <div className="grid gap-2 min-[560px]:grid-cols-2">
          {summaries.map((summary) => (
            <div
              key={summary.name}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-xs font-bold text-[var(--color-text)]">
                  {summary.name}
                </span>
                <span className={`text-2xs ${TYPE_COLORS[summary.type]}`}>{summary.type}</span>
              </div>
              <dl className="mt-1 grid grid-cols-2 gap-x-2 text-2xs text-[var(--color-text-muted)]">
                <div className="flex gap-1">
                  <dt>Unique</dt>
                  <dd className="tabular-nums">{summary.unique}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Blank</dt>
                  <dd
                    className={`tabular-nums ${summary.blanks > 0 ? 'text-[var(--color-warning)]' : ''}`}
                  >
                    {summary.blanks} ({summary.blankPercent.toFixed(0)}%)
                  </dd>
                </div>
                {summary.numeric && (
                  <>
                    <div className="flex gap-1">
                      <dt>Min</dt>
                      <dd className="tabular-nums">{round(summary.numeric.min)}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Max</dt>
                      <dd className="tabular-nums">{round(summary.numeric.max)}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Mean</dt>
                      <dd className="tabular-nums">{round(summary.numeric.mean)}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Median</dt>
                      <dd className="tabular-nums">{round(summary.numeric.median)}</dd>
                    </div>
                  </>
                )}
                {summary.text && (
                  <>
                    <div className="flex gap-1">
                      <dt>Longest</dt>
                      <dd className="tabular-nums">{summary.text.longest}</dd>
                    </div>
                    {summary.text.mode && (
                      <div className="flex min-w-0 gap-1">
                        <dt>Most common</dt>
                        <dd className="truncate" title={summary.text.mode}>
                          {summary.text.mode}
                        </dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            </div>
          ))}
        </div>
      </Disclosure>

      <Disclosure title="Data quality">
        <ul className="space-y-1 text-xs text-[var(--color-text-muted)]">
          <li>
            {rows.length} row{rows.length === 1 ? '' : 's'} across {columns.length} column
            {columns.length === 1 ? '' : 's'}
          </li>
          <li className={blankCells > 0 ? 'text-[var(--color-warning)]' : undefined}>
            {blankCells} blank cell{blankCells === 1 ? '' : 's'}
          </li>
          <li className={duplicates > 0 ? 'text-[var(--color-warning)]' : undefined}>
            {duplicates} duplicate row{duplicates === 1 ? '' : 's'}
          </li>
          {mixedColumns.length > 0 && (
            <li className="text-[var(--color-warning)]">
              Mixed types in {mixedColumns.map((summary) => summary.name).join(', ')}
            </li>
          )}
          {emptyColumns.length > 0 && (
            <li className="text-[var(--color-warning)]">
              Entirely empty: {emptyColumns.map((summary) => summary.name).join(', ')}
            </li>
          )}
        </ul>
      </Disclosure>

      <Disclosure title="Generated schema">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label="Schema language"
            value={schemaLanguage}
            onChange={onSchemaLanguageChange}
            options={SCHEMA_OPTIONS}
          />
          <CopyButton text={schema} label="Copy schema" className="ml-auto" />
        </div>
        {/* Shown, not silently copied — the old version put the interface on the
            clipboard and never displayed it. */}
        <pre className="overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-2xs text-[var(--color-text)]">
          {schema}
        </pre>
      </Disclosure>
    </div>
  )
}
