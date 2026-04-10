import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/shared/Button'

type Props = {
  onInsert: (markdown: string) => void
  onClose: () => void
}

function buildTable(rows: number, cols: number): string {
  const header = Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(' | ')
  const separator = Array.from({ length: cols }, () => '-------').join('|')
  const dataRow = Array.from({ length: cols }, () => ' ').join(' | ')
  const headerLine = `| ${header} |`
  const separatorLine = `|${separator}|`
  const dataLines = Array.from({ length: rows }, () => `| ${dataRow} |`)
  return [headerLine, separatorLine, ...dataLines].join('\n')
}

export function TableModal({ onInsert, onClose }: Props) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)

  const preview = useMemo(() => buildTable(rows, cols), [rows, cols])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') onInsert(preview)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, onInsert, preview])

  const clamp = (v: number) => Math.max(1, Math.min(10, v))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-[420px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-mono text-sm text-[var(--color-text)]">Insert Table</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex gap-6">
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[var(--color-text-muted)]">
                Rows (1–10)
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={rows}
                onChange={(e) => setRows(clamp(parseInt(e.target.value) || 1))}
                className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[var(--color-text-muted)]">
                Columns (1–10)
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={cols}
                onChange={(e) => setCols(clamp(parseInt(e.target.value) || 1))}
                className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">Preview</label>
            <pre className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text)]">
              {preview}
            </pre>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => onInsert(preview)}>
            Insert
          </Button>
        </div>
      </div>
    </div>
  )
}
