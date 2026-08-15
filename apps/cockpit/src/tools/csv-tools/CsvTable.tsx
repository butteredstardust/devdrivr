import { useEffect, useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { CaretDownIcon, CaretUpIcon, CaretUpDownIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import type { CsvRow } from './csv-helpers'

type CsvTableProps = {
  columns: string[]
  rows: CsvRow[]
}

/**
 * Every row used to be rendered, so a 50k-row export froze the pane for
 * seconds. The table is a preview; the source pane is where the whole file
 * lives.
 */
const ROW_LIMIT = 500

function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

export default function CsvTable({ columns, rows }: CsvTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [filter, setFilter] = useState('')

  // A sort key or filter from a previous file would silently reorder — or
  // hide — the new one's rows, so a changed column set resets both. The
  // separator matters: `['ab','c']` must not key the same as `['a','bc']`.
  const columnKey = columns.join(' ')
  useEffect(() => {
    setSorting([])
    setFilter('')
  }, [columnKey])

  const tableColumns = useMemo(() => {
    const helper = createColumnHelper<CsvRow>()
    return columns.map((name) =>
      // `accessorFn` rather than `accessor(name)`: a header like `user.id`
      // would otherwise be read as a deep path into the row object.
      helper.accessor((row) => row[name], {
        id: name,
        header: name,
        cell: (info) => {
          const text = cellText(info.getValue())
          return (
            <span className="block max-w-[24rem] truncate" title={text}>
              {text}
            </span>
          )
        },
      })
    )
  }, [columns])

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const matched = table.getRowModel().rows
  const visible = matched.slice(0, ROW_LIMIT)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter rows…"
          aria-label="Filter rows"
          className="w-48"
        />
        <span role="status" aria-live="polite" className="text-2xs text-[var(--color-text-muted)]">
          {filter.trim()
            ? `${matched.length} of ${rows.length} rows match`
            : `${rows.length} row${rows.length === 1 ? '' : 's'} · ${columns.length} column${columns.length === 1 ? '' : 's'}`}
          {matched.length > ROW_LIMIT && ` · showing first ${ROW_LIMIT}`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                <th
                  scope="col"
                  className="border-b border-r border-[var(--color-border)] px-2 py-1.5 text-right font-ui text-2xs font-normal text-[var(--color-text-muted)]"
                >
                  #
                </th>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      // Sorting was a click handler on the cell, so it was
                      // unreachable by keyboard and invisible to screen readers.
                      aria-sort={
                        sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
                      }
                      className="border-b border-r border-[var(--color-border)] p-0 text-left"
                    >
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={header.column.getToggleSortingHandler()}
                        title={`Sort by ${header.column.id}`}
                        className="w-full justify-between gap-1 rounded-none px-3 py-2 font-mono font-bold text-[var(--color-accent)]"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' ? (
                          <CaretUpIcon size={11} aria-hidden="true" />
                        ) : sorted === 'desc' ? (
                          <CaretDownIcon size={11} aria-hidden="true" />
                        ) : (
                          <CaretUpDownIcon size={11} aria-hidden="true" className="opacity-40" />
                        )}
                      </Button>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="hover:bg-[var(--color-surface-hover)]">
                <td className="border-b border-r border-[var(--color-border)] px-2 py-1.5 text-right text-2xs text-[var(--color-text-muted)] tabular-nums">
                  {row.index + 1}
                </td>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="border-b border-r border-[var(--color-border)] px-3 py-1.5"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {matched.length === 0 && (
          <p className="p-6 text-center text-xs text-[var(--color-text-muted)]">
            No rows match “{filter}”.
          </p>
        )}
      </div>
    </div>
  )
}
