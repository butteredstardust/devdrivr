import { useMemo, useState, useCallback } from 'react'
import { Button } from '@/components/shared/Button'
import { useUiStore } from '@/stores/ui.store'
import {
  inferColumnType,
  calculateNumberStats,
  calculateStringStats,
  type ColumnType,
} from './utils'

interface CsvAnalyzeProps {
  data: Record<string, unknown>[]
  onSchemaGenerated?: (schema: string) => void
}

export default function CsvAnalyze({ data, onSchemaGenerated }: CsvAnalyzeProps) {
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [expandedPanel, setExpandedPanel] = useState<'stats' | 'quality' | 'schema'>('stats')

  const columnStats = useMemo(() => {
    const keys = Object.keys(data[0] ?? {})
    const result: Record<string, { type: ColumnType; stats: unknown }> = {}

    for (const key of keys) {
      const values = data.map((row) => row[key])
      const type = inferColumnType(values)

      let stats: unknown
      if (type === 'number') {
        stats = calculateNumberStats(values)
      } else {
        stats = calculateStringStats(values)
      }

      result[key] = { type, stats }
    }

    return result
  }, [data])

  const generateTypeScript = useCallback(() => {
    const keys = Object.keys(data[0] ?? {})
    const lines: string[] = ['interface CsvRow {']

    for (const key of keys) {
      const type = columnStats[key]?.type
      let tsType = 'string'
      if (type === 'number') tsType = 'number'
      else if (type === 'date') tsType = 'Date'

      const nullCount = data.filter(
        (row) => row[key] === null || row[key] === undefined || row[key] === ''
      ).length
      const optional = nullCount > 0 ? ' | null' : ''

      lines.push(`  ${key}: ${tsType}${optional};`)
    }

    lines.push('}')
    const result = lines.join('\n')

    onSchemaGenerated?.(result)
    navigator.clipboard.writeText(result)
    setLastAction('Generated TypeScript interface', 'success')
  }, [data, columnStats, onSchemaGenerated, setLastAction])

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      {/* Column Statistics */}
      <div className="mb-4">
        <button
          className="flex w-full items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          onClick={() => setExpandedPanel(expandedPanel === 'stats' ? 'quality' : 'stats')}
        >
          <span className="text-sm font-bold">Column Statistics</span>
          <span>{expandedPanel === 'stats' ? '\u25BC' : '\u25B6'}</span>
        </button>
        {expandedPanel === 'stats' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {Object.entries(columnStats).map(([key, { type, stats }]) => (
              <div
                key={key}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
              >
                <div className="font-mono text-sm font-bold text-[var(--color-accent)]">{key}</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">{type}</div>
                {type === 'number' && stats != null && (
                  <div className="text-[10px] text-[var(--color-text-muted)]">
                    Min: {String((stats as { min: number }).min)} · Max:{' '}
                    {String((stats as { max: number }).max)}
                  </div>
                )}
                {(type === 'string' || type === 'mixed') && stats != null && (
                  <div className="text-[10px] text-[var(--color-text-muted)]">
                    Unique: {String((stats as { unique: number }).unique)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Schema Generation */}
      <div className="mb-4">
        <button
          className="flex w-full items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          onClick={() => setExpandedPanel(expandedPanel === 'schema' ? 'stats' : 'schema')}
        >
          <span className="text-sm font-bold">Schema Generation</span>
          <span>{expandedPanel === 'schema' ? '\u25BC' : '\u25B6'}</span>
        </button>
        {expandedPanel === 'schema' && (
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" size="sm" onClick={generateTypeScript}>
              TypeScript
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
