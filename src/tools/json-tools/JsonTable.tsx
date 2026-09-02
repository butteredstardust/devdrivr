/** The table rendering of a tabular JSON array, plus the nested tables cells fall back to. */
import { TreeValueButton } from '@/tools/json-tools/JsonTree'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowsDownUpIcon, CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { CopyToClipboard, useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import {
  MAX_NESTED_TABLE_DEPTH,
  isJsonRecord,
  isTabularJsonArray,
  toText,
  unionKeys,
} from '@/tools/json-tools/json-model'

// ---------------------------------------------------------------------------
// Table View
// ---------------------------------------------------------------------------

type SortState = { column: string; direction: 'asc' | 'desc' } | null

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === undefined || a === null) return 1
  if (b === undefined || b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return toText(a).localeCompare(toText(b), undefined, { numeric: true })
}

function SortIndicator({ direction }: { direction: 'asc' | 'desc' | null }) {
  const Icon =
    direction === 'asc' ? CaretUpIcon : direction === 'desc' ? CaretDownIcon : ArrowsDownUpIcon
  return <Icon size={12} aria-hidden="true" className="text-[var(--color-text-muted)]" />
}

export function JsonTable({
  data,
  onCopy,
}: {
  data: Record<string, unknown>[]
  onCopy: CopyToClipboard
}) {
  const [sort, setSort] = useState<SortState>(null)
  // Roving cell cursor: the old table copied on click only, which left the
  // whole grid unreachable from the keyboard.
  const [cursor, setCursor] = useState({ row: 0, column: 0 })
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>())
  const focusPending = useRef(false)

  const columns = useMemo(() => unionKeys(data), [data])

  const rows = useMemo(() => {
    if (!sort) return data
    const sorted = [...data].sort((a, b) => compareValues(a[sort.column], b[sort.column]))
    return sort.direction === 'asc' ? sorted : sorted.reverse()
  }, [data, sort])

  // Sorting or a shrinking document can strand the cursor past the last row;
  // without clamping, the grid would have no cell in the tab order at all.
  const safeCursor = {
    row: Math.min(cursor.row, Math.max(rows.length - 1, 0)),
    column: Math.min(cursor.column, Math.max(columns.length - 1, 0)),
  }

  useEffect(() => {
    if (!focusPending.current) return
    focusPending.current = false
    cellRefs.current.get(`${cursor.row}:${cursor.column}`)?.focus()
  }, [cursor])

  const move = (rowDelta: number, columnDelta: number) => {
    focusPending.current = true
    setCursor(() => ({
      row: Math.min(Math.max(safeCursor.row + rowDelta, 0), rows.length - 1),
      column: Math.min(Math.max(safeCursor.column + columnDelta, 0), columns.length - 1),
    }))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableSectionElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1, 0)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1, 0)
        break
      case 'ArrowRight':
        event.preventDefault()
        move(0, 1)
        break
      case 'ArrowLeft':
        event.preventDefault()
        move(0, -1)
        break
      case 'Home':
        event.preventDefault()
        focusPending.current = true
        setCursor((c) => ({ ...c, column: 0 }))
        break
      case 'End':
        event.preventDefault()
        focusPending.current = true
        setCursor((c) => ({ ...c, column: columns.length - 1 }))
        break
      case 'Enter':
      case ' ': {
        event.preventDefault()
        const column = columns[safeCursor.column]
        const row = rows[safeCursor.row]
        if (column && row) void onCopy(toText(row[column]), { success: `Copied ${column}` })
        break
      }
      default:
        break
    }
  }

  if (data.length === 0)
    return <EmptyState size="sm" title="Empty array" description="No rows to show." />

  if (columns.length === 0)
    return (
      <EmptyState size="sm" title="No columns" description="Every object in this array is empty." />
    )

  return (
    <table className="w-full border-collapse text-xs">
      <caption className="sr-only">
        {rows.length} rows by {columns.length} columns. Use the arrow keys to move between cells and
        Enter to copy the focused cell.
      </caption>
      <thead className="sticky top-0 z-10">
        <tr>
          {columns.map((col) => {
            const active = sort?.column === col
            return (
              <th
                key={col}
                scope="col"
                aria-sort={
                  active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                className="border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-left"
              >
                <Button
                  variant="ghost"
                  size="xs"
                  className="w-full justify-start gap-1 rounded-none font-mono font-bold text-[var(--color-accent)]"
                  onClick={() =>
                    setSort((current) =>
                      current?.column === col && current.direction === 'asc'
                        ? { column: col, direction: 'desc' }
                        : { column: col, direction: 'asc' }
                    )
                  }
                  title={`Sort by ${col}`}
                >
                  {col}
                  <SortIndicator direction={active ? sort.direction : null} />
                </Button>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody onKeyDown={handleKeyDown}>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="hover:bg-[var(--color-surface-hover)]">
            {columns.map((col, columnIndex) => {
              const value = row[col]
              const isCursor = safeCursor.row === rowIndex && safeCursor.column === columnIndex
              return (
                <td
                  key={col}
                  ref={(el) => {
                    const id = `${rowIndex}:${columnIndex}`
                    if (el) cellRefs.current.set(id, el)
                    else cellRefs.current.delete(id)
                  }}
                  tabIndex={isCursor ? 0 : -1}
                  onFocus={() => setCursor({ row: rowIndex, column: columnIndex })}
                  onClick={() => void onCopy(toText(value), { success: `Copied ${col}` })}
                  title="Copy cell"
                  className="cursor-pointer border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  {typeof value === 'object' && value !== null
                    ? JSON.stringify(value)
                    : String(value ?? '')}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Nested Table View
//
// A document that is not a list of records is still tabular: an object is a
// key/value table and an array is an indexed one, with every value recursing.
// The flat grid above stays in charge of record arrays because it owns the
// sorting and the roving cell cursor, neither of which nests.
// ---------------------------------------------------------------------------

const NESTED_TABLE_CLASS = 'w-full border-collapse text-xs font-mono'
const NESTED_CELL_CLASS = 'border border-[var(--color-border)] px-2 py-1 align-top'
const NESTED_HEADER_CLASS = `${NESTED_CELL_CLASS} bg-[var(--color-surface)] text-left font-bold whitespace-nowrap text-[var(--color-accent)]`

export function tableSummary(data: unknown): string | null {
  if (Array.isArray(data)) return `${data.length} row${data.length === 1 ? '' : 's'}`
  if (isJsonRecord(data)) {
    const count = Object.keys(data).length
    return `${count} field${count === 1 ? '' : 's'}`
  }
  return null
}

function JsonLeaf({ value }: { value: unknown }) {
  const copy = useCopyToClipboard()
  const text = toText(value)
  const className =
    value === null
      ? 'text-[var(--color-text-muted)]'
      : typeof value === 'boolean'
        ? 'text-[var(--color-warning)]'
        : typeof value === 'number'
          ? 'text-[var(--color-accent)]'
          : 'text-[var(--color-success)]'

  return (
    <TreeValueButton
      className={className}
      onClick={() => void copy(text, { success: 'Copied value' })}
      label={`Copy value ${text}`}
    >
      {/* An empty string would otherwise render as a cell with no target to click. */}
      {text === '' ? '""' : text}
    </TreeValueButton>
  )
}

function EmptyContainer({ children }: { children: string }) {
  return <span className="text-[var(--color-text-muted)]">{children}</span>
}

/** The tail of a subtree too deep to keep tabulating, still copyable in full. */
function DeepValue({ value }: { value: unknown }) {
  const copy = useCopyToClipboard()
  const text = JSON.stringify(value)

  return (
    <TreeValueButton
      className="text-[var(--color-text-muted)]"
      onClick={() => void copy(text, { success: 'Copied value' })}
      label={`Copy value ${text}`}
    >
      {text}
    </TreeValueButton>
  )
}

export function NestedJsonValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || typeof value !== 'object') return <JsonLeaf value={value} />
  if (depth >= MAX_NESTED_TABLE_DEPTH) return <DeepValue value={value} />

  if (Array.isArray(value)) {
    if (value.length === 0) return <EmptyContainer>[]</EmptyContainer>
    return isTabularJsonArray(value) && unionKeys(value).length > 0 ? (
      <RecordArrayTable rows={value} depth={depth} />
    ) : (
      <IndexedArrayTable items={value} depth={depth} />
    )
  }

  const entries = Object.entries(value)
  if (entries.length === 0) return <EmptyContainer>{'{}'}</EmptyContainer>

  return (
    <table className={NESTED_TABLE_CLASS}>
      <tbody>
        {entries.map(([key, child]) => (
          <tr key={key}>
            <th scope="row" className={NESTED_HEADER_CLASS}>
              {key}
            </th>
            <td className={NESTED_CELL_CLASS}>
              <NestedJsonValue value={child} depth={depth + 1} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RecordArrayTable({ rows, depth }: { rows: Record<string, unknown>[]; depth: number }) {
  const columns = unionKeys(rows)
  return (
    <table className={NESTED_TABLE_CLASS}>
      <thead>
        <tr>
          <th scope="col" className={NESTED_HEADER_CLASS}>
            #
          </th>
          {columns.map((col) => (
            <th key={col} scope="col" className={NESTED_HEADER_CLASS}>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <th scope="row" className={NESTED_HEADER_CLASS}>
              {index}
            </th>
            {columns.map((col) => (
              <td key={col} className={NESTED_CELL_CLASS}>
                {/* A key absent from this record is not the same as one holding null. */}
                {col in row ? (
                  <NestedJsonValue value={row[col]} depth={depth + 1} />
                ) : (
                  <EmptyContainer>—</EmptyContainer>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function IndexedArrayTable({ items, depth }: { items: unknown[]; depth: number }) {
  return (
    <table className={NESTED_TABLE_CLASS}>
      <tbody>
        {items.map((item, index) => (
          <tr key={index}>
            <th scope="row" className={NESTED_HEADER_CLASS}>
              {index}
            </th>
            <td className={NESTED_CELL_CLASS}>
              <NestedJsonValue value={item} depth={depth + 1} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
