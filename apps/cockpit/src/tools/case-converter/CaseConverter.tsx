import { useMemo, useCallback } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'

type CaseConverterState = {
  input: string
}

type CaseResult = {
  id: string
  label: string
  value: string
}

// ── Logic ──────────────────────────────────────────────────────────

function toWords(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_./]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function detectCase(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (trimmed === trimmed.toUpperCase() && trimmed.includes('_')) return 'SCREAMING_SNAKE'
  if (trimmed === trimmed.toUpperCase()) return 'UPPERCASE'
  if (trimmed === trimmed.toLowerCase() && trimmed.includes('_')) return 'snake_case'
  if (trimmed === trimmed.toLowerCase() && trimmed.includes('-')) return 'kebab-case'
  if (trimmed === trimmed.toLowerCase() && trimmed.includes('.')) return 'dot.case'
  if (trimmed === trimmed.toLowerCase()) return 'lowercase'
  if (/^[a-z][a-zA-Z0-9]*$/.test(trimmed)) return 'camelCase'
  if (/^[A-Z][a-zA-Z0-9]*$/.test(trimmed)) return 'PascalCase'
  if (/^[A-Z][a-z]/.test(trimmed) && trimmed.includes(' ')) return 'Title/Sentence'
  return null
}

function computeCases(input: string): CaseResult[] {
  if (!input.trim()) return []
  const words = toWords(input)
  const lower = words.map((w) => w.toLowerCase())

  return [
    { id: 'upper', label: 'UPPERCASE', value: input.toUpperCase() },
    { id: 'lower', label: 'lowercase', value: input.toLowerCase() },
    {
      id: 'title',
      label: 'Title Case',
      value: lower.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    },
    {
      id: 'sentence',
      label: 'Sentence case',
      value: lower.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' '),
    },
    {
      id: 'camel',
      label: 'camelCase',
      value: lower.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(''),
    },
    {
      id: 'pascal',
      label: 'PascalCase',
      value: lower.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(''),
    },
    { id: 'snake', label: 'snake_case', value: lower.join('_') },
    { id: 'screaming', label: 'SCREAMING_SNAKE', value: lower.join('_').toUpperCase() },
    { id: 'kebab', label: 'kebab-case', value: lower.join('-') },
    { id: 'dot', label: 'dot.case', value: lower.join('.') },
    { id: 'path', label: 'path/case', value: lower.join('/') },
  ]
}

// ── Component ──────────────────────────────────────────────────────

export default function CaseConverter() {
  const [state, updateState] = useToolState<CaseConverterState>('case-converter', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const cases = useMemo(() => computeCases(state.input), [state.input])
  const detected = useMemo(() => detectCase(state.input), [state.input])
  const words = useMemo(() => (state.input.trim() ? toWords(state.input) : []), [state.input])

  const handleUseAsInput = useCallback(
    (value: string, label: string) => {
      updateState({ input: value })
      setLastAction(`Using ${label} as input`, 'info')
    },
    [updateState, setLastAction]
  )

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center gap-3">
          <span className="font-pixel text-xs text-[var(--color-text-muted)]">Input</span>
          {detected && (
            <span className="rounded-full bg-[var(--color-accent-dim)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-accent)]">
              {detected}
            </span>
          )}
          {words.length > 0 && (
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {words.length} word{words.length !== 1 ? 's' : ''}: {words.join(' · ')}
            </span>
          )}
        </div>
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
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {cases.map((c) => {
              const isCurrent = c.value === state.input
              return (
                <div
                  key={c.id}
                  className={`flex items-center justify-between rounded border px-3 py-2 ${
                    isCurrent
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)]/30'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                      {c.label}
                      {isCurrent && (
                        <span className="text-[10px] font-bold text-[var(--color-accent)]">
                          current
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-sm text-[var(--color-text)]">
                      {c.value}
                    </div>
                  </div>
                  <div className="ml-2 flex shrink-0 gap-1">
                    {!isCurrent && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleUseAsInput(c.value, c.label)}
                        title="Use as input"
                      >
                        ↑ Use
                      </Button>
                    )}
                    <CopyButton text={c.value} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">
            Enter text above to see conversions
          </div>
        )}
      </div>
    </div>
  )
}
