import { useMemo, useState } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { Button } from '@/components/shared/Button'

// ── Types ────────────────────────────────────────────────────────────

type CssSpecificityState = {
  input: string
}

type SpecPart = {
  text: string
  type: 'id' | 'class' | 'element'
}

type SpecResult = {
  selector: string
  a: number // IDs
  b: number // Classes, attributes, pseudo-classes
  c: number // Elements, pseudo-elements
  score: number
  parts: SpecPart[]
  hasImportant: boolean
}

// ── Specificity Computation ──────────────────────────────────────────

function computeSpecificity(selector: string): { a: number; b: number; c: number; parts: SpecPart[] } {
  let a = 0
  let b = 0
  let c = 0
  const parts: SpecPart[] = []

  // Handle :not() — its contents count but not the pseudo-class itself
  let s = selector.replace(/:not\(([^)]+)\)/g, (_, inner: string) => {
    const innerSpec = computeSpecificity(inner)
    a += innerSpec.a
    b += innerSpec.b
    c += innerSpec.c
    parts.push({ text: `:not(${inner})`, type: innerSpec.a > 0 ? 'id' : innerSpec.b > 0 ? 'class' : 'element' })
    return ''
  })

  // Attribute selectors [...]
  s = s.replace(/\[[^\]]*\]/g, (match) => {
    b++
    parts.push({ text: match, type: 'class' })
    return ''
  })

  // IDs
  const ids = s.match(/#[a-zA-Z_-][\w-]*/g) ?? []
  for (const id of ids) {
    a++
    parts.push({ text: id, type: 'id' })
  }

  // Classes
  const classes = s.match(/\.[a-zA-Z_-][\w-]*/g) ?? []
  for (const cls of classes) {
    b++
    parts.push({ text: cls, type: 'class' })
  }

  // Pseudo-elements (::before, ::after, etc.)
  const pseudoElements = s.match(/::[a-zA-Z][\w-]*/g) ?? []
  for (const pe of pseudoElements) {
    c++
    parts.push({ text: pe, type: 'element' })
  }

  // Pseudo-classes (:hover, :focus, etc.) — but not pseudo-elements
  const pseudoClasses = (s.match(/:[a-zA-Z][\w-]*/g) ?? []).filter((p) => !p.startsWith('::'))
  for (const pc of pseudoClasses) {
    b++
    parts.push({ text: pc, type: 'class' })
  }

  // Remove counted items, count remaining element names
  s = s
    .replace(/#[a-zA-Z_-][\w-]*/g, '')
    .replace(/\.[a-zA-Z_-][\w-]*/g, '')
    .replace(/:+[a-zA-Z][\w-]*/g, '')
  const elements = s.match(/[a-zA-Z][\w-]*/g) ?? []
  for (const el of elements) {
    c++
    parts.push({ text: el, type: 'element' })
  }

  return { a, b, c, parts }
}

// ── Examples ─────────────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'Basic', selectors: 'h1\np\ndiv' },
  { label: 'Classes', selectors: '.card\n.card .title\n.card .title:hover' },
  { label: 'IDs', selectors: '#main\n#main .content p\n#nav ul li.active' },
  { label: 'Complex', selectors: 'div > p:first-child\n.sidebar a:hover::before\n#app [data-role="admin"]' },
  { label: 'Battle', selectors: '.a .b .c\n#x\ndiv div div div div' },
]

// ── Color tokens per type ────────────────────────────────────────────

const TYPE_COLORS = {
  id: { bar: 'var(--color-error)', text: 'var(--color-error)', label: 'IDs (a)' },
  class: { bar: 'var(--color-warning)', text: 'var(--color-warning)', label: 'Classes (b)' },
  element: { bar: 'var(--color-info)', text: 'var(--color-info)', label: 'Elements (c)' },
} as const

// ── Component ────────────────────────────────────────────────────────

export default function CssSpecificity() {
  const [state, updateState] = useToolState<CssSpecificityState>('css-specificity', {
    input: '',
  })
  const [sorted, setSorted] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(true)

  const results = useMemo(() => {
    if (!state.input.trim()) return []
    const lines = state.input
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const res: SpecResult[] = lines.map((selector) => {
      const hasImportant = selector.includes('!important')
      const cleanSelector = selector.replace(/!important/g, '').trim()
      const spec = computeSpecificity(cleanSelector)
      return {
        selector,
        ...spec,
        score: spec.a * 100 + spec.b * 10 + spec.c,
        hasImportant,
      }
    })
    return sorted ? [...res].sort((x, y) => y.score - x.score) : res
  }, [state.input, sorted])

  const maxScore = useMemo(() => Math.max(...results.map((r) => r.score), 1), [results])

  const winnerIdx = useMemo(() => {
    if (results.length < 2) return -1
    let maxS = -1
    let idx = -1
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!
      const effective = r.hasImportant ? r.score + 10000 : r.score
      if (effective > maxS) {
        maxS = effective
        idx = i
      }
    }
    return idx
  }, [results])

  const exportText = useMemo(() => {
    if (results.length === 0) return ''
    const lines = results.map(
      (r) => `${r.selector.padEnd(40)} (${r.a},${r.b},${r.c})  score=${r.score}${r.hasImportant ? ' !important' : ''}`
    )
    return lines.join('\n')
  }, [results])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={() => setSorted(!sorted)}
          className={`rounded border px-3 py-1 text-xs ${
            sorted
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
          }`}
        >
          Sort by specificity
        </button>
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className={`rounded border px-3 py-1 text-xs ${
            showBreakdown
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
          }`}
        >
          Breakdown
        </button>
        {results.length > 0 && (
          <>
            <span className="text-xs text-[var(--color-text-muted)]">{results.length} selector(s)</span>
            <CopyButton text={exportText} label="Export" />
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {EXAMPLES.map((ex) => (
            <Button
              key={ex.label}
              variant="secondary"
              size="sm"
              onClick={() => updateState({ input: ex.selectors })}
            >
              {ex.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1">
        {Object.values(TYPE_COLORS).map((tc) => (
          <div key={tc.label} className="flex items-center gap-1">
            <div className="h-2 w-4 rounded" style={{ backgroundColor: tc.bar }} />
            <span className="text-[10px]" style={{ color: tc.text }}>{tc.label}</span>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Input */}
        <div className="flex w-2/5 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            Selectors (one per line)
          </div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder={'#main .content p\n.sidebar a:hover\ndiv > p:first-child\n#nav ul li.active'}
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>

        {/* Results */}
        <div className="flex w-3/5 flex-col overflow-auto p-4">
          {results.length > 0 ? (
            <div className="flex flex-col gap-3">
              {results.map((r, i) => {
                const isWinner = i === winnerIdx && results.length > 1
                return (
                  <div
                    key={i}
                    className={`rounded border p-3 ${
                      isWinner
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isWinner && (
                          <span className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-bg)]">
                            WINS
                          </span>
                        )}
                        <code className="text-xs text-[var(--color-text)]">{r.selector}</code>
                        {r.hasImportant && (
                          <span className="rounded bg-[var(--color-error)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                            !important
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-xs font-bold text-[var(--color-accent)]">
                        ({r.a}, {r.b}, {r.c})
                      </span>
                    </div>

                    {/* Segmented bar */}
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 flex-1 flex rounded bg-[var(--color-bg)] overflow-hidden">
                        {r.a > 0 && (
                          <div
                            className="h-full"
                            style={{
                              width: `${(r.a * 100 * 100) / maxScore}%`,
                              backgroundColor: TYPE_COLORS.id.bar,
                            }}
                            title={`IDs: ${r.a}`}
                          />
                        )}
                        {r.b > 0 && (
                          <div
                            className="h-full"
                            style={{
                              width: `${(r.b * 10 * 100) / maxScore}%`,
                              backgroundColor: TYPE_COLORS.class.bar,
                            }}
                            title={`Classes: ${r.b}`}
                          />
                        )}
                        {r.c > 0 && (
                          <div
                            className="h-full"
                            style={{
                              width: `${(r.c * 100) / maxScore}%`,
                              backgroundColor: TYPE_COLORS.element.bar,
                            }}
                            title={`Elements: ${r.c}`}
                          />
                        )}
                      </div>
                      <span className="w-8 text-right text-xs text-[var(--color-text-muted)]">{r.score}</span>
                    </div>

                    {/* Breakdown */}
                    {showBreakdown && r.parts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.parts.map((part, j) => {
                          const color =
                            part.type === 'id'
                              ? TYPE_COLORS.id.text
                              : part.type === 'class'
                                ? TYPE_COLORS.class.text
                                : TYPE_COLORS.element.text
                          return (
                            <span
                              key={j}
                              className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
                              style={{
                                color,
                                borderColor: color,
                              }}
                            >
                              {part.text}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-text-muted)]">
              Enter CSS selectors on the left — try one of the examples above
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
