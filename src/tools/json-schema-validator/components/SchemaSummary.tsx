import { useMemo } from 'react'
import { CheckCircleIcon, ShieldCheckIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { type ValidationReport } from '@/tools/json-schema-validator/json-schema-helpers'

export function SchemaOutline({ schema }: { schema: string }) {
  const outline = useMemo(() => {
    try {
      const root = JSON.parse(schema) as Record<string, unknown>
      const walk = (node: Record<string, unknown>, depth = 0): string[] => {
        if (depth > 3) return []
        const properties = node.properties
        if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return []
        const lines: string[] = []
        for (const [name, child] of Object.entries(properties)) {
          lines.push(`${'  '.repeat(depth)}${name}`)
          if (child && typeof child === 'object' && !Array.isArray(child)) {
            lines.push(...walk(child as Record<string, unknown>, depth + 1))
          }
        }
        return lines
      }
      return walk(root)
    } catch {
      return []
    }
  }, [schema])
  if (outline.length === 0) return null
  return (
    <details className="max-w-48 text-2xs text-[var(--color-text-muted)]">
      <summary className="cursor-pointer">Outline ({outline.length})</summary>
      <pre className="absolute z-20 mt-1 max-h-48 max-w-64 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 font-mono text-left">
        {outline.join('\n')}
      </pre>
    </details>
  )
}

export function StatusIcon({ status }: { status: ValidationReport['status'] }) {
  if (status === 'valid') {
    return (
      <CheckCircleIcon
        size={14}
        aria-hidden="true"
        className="shrink-0 text-[var(--color-success)]"
      />
    )
  }
  if (status === 'empty') {
    return (
      <ShieldCheckIcon
        size={14}
        aria-hidden="true"
        className="shrink-0 text-[var(--color-text-muted)]"
      />
    )
  }
  return (
    <WarningCircleIcon
      size={14}
      aria-hidden="true"
      className="shrink-0 text-[var(--color-error)]"
    />
  )
}
