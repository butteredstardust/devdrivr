import { useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type CaseConverterState = {
  input: string
}

type CaseResult = {
  label: string
  value: string
}

function toWords(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_./]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function computeCases(input: string): CaseResult[] {
  if (!input.trim()) return []
  const words = toWords(input)
  const lower = words.map((w) => w.toLowerCase())

  return [
    { label: 'UPPERCASE', value: input.toUpperCase() },
    { label: 'lowercase', value: input.toLowerCase() },
    { label: 'Title Case', value: lower.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') },
    { label: 'Sentence case', value: lower.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ') },
    { label: 'camelCase', value: lower.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('') },
    { label: 'PascalCase', value: lower.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('') },
    { label: 'snake_case', value: lower.join('_') },
    { label: 'SCREAMING_SNAKE_CASE', value: lower.join('_').toUpperCase() },
    { label: 'kebab-case', value: lower.join('-') },
    { label: 'dot.case', value: lower.join('.') },
    { label: 'path/case', value: lower.join('/') },
    { label: 'CONSTANT_CASE', value: lower.join('_').toUpperCase() },
  ]
}

export default function CaseConverter() {
  const [state, updateState] = useToolState<CaseConverterState>('case-converter', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const cases = useMemo(() => computeCases(state.input), [state.input])

  // setLastAction used for future extensibility (e.g. clear action)
  void setLastAction

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] p-4">
        <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">Input</h2>
        <textarea
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Type or paste text to convert..."
          rows={3}
          className="w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <div className="flex-1 overflow-auto p-4">
        {cases.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {cases.map((c) => (
              <div
                key={c.label}
                className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-[var(--color-text-muted)]">{c.label}</div>
                  <div className="truncate font-mono text-sm text-[var(--color-text)]">{c.value}</div>
                </div>
                <CopyButton text={c.value} className="ml-2 shrink-0" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">Enter text above to see conversions</div>
        )}
      </div>
    </div>
  )
}
