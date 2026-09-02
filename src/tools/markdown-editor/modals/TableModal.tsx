import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Field } from '@/components/shared/Field'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Dialog } from '@/components/shared/Dialog'
import { Input } from '@/components/shared/Input'
import { useIsInstanceActive } from '@/app/tool-instance'

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
  const isInstanceActive = useIsInstanceActive()
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)

  const preview = useMemo(() => buildTable(rows, cols), [rows, cols])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isInstanceActive) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') onInsert(preview)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isInstanceActive, onClose, onInsert, preview])

  const clamp = (v: number) => Math.max(1, Math.min(10, v))

  return (
    <Dialog
      title="Insert Table"
      onClose={onClose}
      closeLabel="Close insert table dialog"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => onInsert(preview)}>
            Insert
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-6">
          <Field label="Rows (1–10)">
            <Input
              type="number"
              min={1}
              max={10}
              value={rows}
              onChange={(e) => setRows(clamp(parseInt(e.target.value) || 1))}
              size="md"
              className="w-20"
            />
          </Field>
          <Field label="Columns (1–10)">
            <Input
              type="number"
              min={1}
              max={10}
              value={cols}
              onChange={(e) => setCols(clamp(parseInt(e.target.value) || 1))}
              size="md"
              className="w-20"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-1">
          {/* Not a Field: this names a preview, it doesn't label a control. */}
          <SectionLabel>Preview</SectionLabel>
          <pre className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text)]">
            {preview}
          </pre>
        </div>
      </div>
    </Dialog>
  )
}
