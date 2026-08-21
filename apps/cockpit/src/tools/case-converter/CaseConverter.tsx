import { useMemo, useCallback, useEffect } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { EmptyState } from '@/components/shared/EmptyState'
import { Field } from '@/components/shared/Field'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TextArea } from '@/components/shared/TextArea'
import { ArrowUpIcon, TextAaIcon } from '@phosphor-icons/react'

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
  const { record } = useToolHistory({ toolId: 'case-converter' })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const cases = useMemo(() => computeCases(state.input), [state.input])
  const detected = useMemo(() => detectCase(state.input), [state.input])
  const words = useMemo(() => (state.input.trim() ? toWords(state.input) : []), [state.input])

  useEffect(() => {
    if (state.input.trim() && cases.length > 0) {
      record({
        input: state.input.slice(0, 200),
        output: `${cases.length} conversions${detected ? ` (${detected})` : ''}`,
        subTab: detected || 'unknown',
        success: true,
      })
    }
  }, [state.input, cases, detected, record])

  const handleUseAsInput = useCallback(
    (value: string, label: string) => {
      updateState({ input: value })
      setLastAction(`Using ${label} as input`, 'info')
    },
    [updateState, setLastAction]
  )

  return (
    <ToolLayout>
      {/* The input lives in the body, not the `toolbar` slot. A toolbar is a row of controls
          acting on the content below it; a multi-line text field is the content. */}
      <Field
        label="Input"
        className="mb-4"
        hint={
          (detected || words.length > 0) && (
            <span className="flex flex-wrap items-center gap-2">
              {detected && <StatusBadge variant="info">{detected}</StatusBadge>}
              {words.length > 0 && (
                <span>
                  {words.length} word{words.length !== 1 ? 's' : ''}: {words.join(' · ')}
                </span>
              )}
            </span>
          )
        }
      >
        <TextArea
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Type or paste text to convert..."
          rows={3}
          size="md"
          className="resize-none"
        />
      </Field>

      {cases.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {cases.map((c) => {
            const isCurrent = c.value === state.input
            return (
              // `border` on its own resolves to `currentColor` under Tailwind v4's preflight
              // (`border: 0 solid`, no colour set), so every non-current card was drawing a
              // full-strength text-coloured outline instead of `--color-border`. The colour is
              // picked by the ternary rather than listed alongside the accent: two arbitrary
              // border-colour utilities in one class list have equal specificity, and which one
              // wins is generation order, not the order they appear in the string.
              <div
                key={c.id}
                className={`flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2 ${
                  isCurrent
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)]/30'
                    : 'border-[var(--color-border)]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                    {c.label}
                    {isCurrent && <StatusBadge variant="info">Current</StatusBadge>}
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
                      <ArrowUpIcon size={12} weight="bold" aria-hidden="true" />
                      Use
                    </Button>
                  )}
                  <CopyButton text={c.value} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={TextAaIcon}
          title="Enter text above to see conversions"
          size="sm"
          className="p-0"
        />
      )}
    </ToolLayout>
  )
}
