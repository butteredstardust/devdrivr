import { useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { CopyButton } from '@/components/shared/CopyButton'

interface CsvTableProps {
  data: Record<string, unknown>[]
}

export default function CsvTable({ data }: CsvTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const stats = useMemo(() => {
    const cols = Object.keys(data[0] ?? {}).length
    const rows = data.length
    return { cols, rows }
  }, [data])

  const columns = useMemo(() => {
    const helper = createColumnHelper<Record<string, unknown>>()
    const keys = Object.keys(data[0] ?? {})

    return keys.map((key) =>
      helper.accessor(key, {
        header: key,
        cell: (info) => {
          const value = info.getValue()
          const displayValue = value === null || value === undefined ? '' : String(value)

          return (
            <span className="block truncate" title={displayValue}>
              {displayValue}
            </span>
          )
        },
      })
    )
  }, [data])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <span className="text-[10px] text-[var(--color-text-muted)]">
          {stats.cols} cols · {stats.rows} rows
        </span>
        <CopyButton text={JSON.stringify(data, null, 2)} />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-[var(--color-surface)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="cursor-pointer border-b border-r border-[var(--color-border)] px-3 py-2 text-left font-mono font-bold text-[var(--color-accent)] hover:bg-[var(--color-surface-hover)]"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() && (
                      <span className="ml-1">
                        {header.column.getIsSorted() === 'asc' ? '\u2191' : '\u2193'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-[var(--color-surface-hover)]">
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
      </div>
    </div>
  )
}
