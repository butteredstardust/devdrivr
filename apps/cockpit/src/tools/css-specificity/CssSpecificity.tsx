import { useMemo, useState } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Toolbar, ToolbarGroup, ToolbarSpacer } from '@/components/shared/Toolbar'
import { TextArea } from '@/components/shared/TextArea'
import * as cssTree from 'css-tree'
import { specificityOf } from '@/tools/css-validator/css-helpers'

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
  sourceIndex: number
  parts: SpecPart[]
  hasImportant: boolean
}

function compareSpecificity(left: SpecResult, right: SpecResult): number {
  if (left.hasImportant !== right.hasImportant) return left.hasImportant ? 1 : -1
  return left.a - right.a || left.b - right.b || left.c - right.c
}

// ── Specificity Computation ──────────────────────────────────────────

function computeSpecificity(selector: string): {
  a: number
  b: number
  c: number
  parts: SpecPart[]
} {
  const parts: SpecPart[] = []
  try {
    const ast = cssTree.parse(selector, { context: 'selector' })
    const [a, b, c] = specificityOf(ast)
    cssTree.walk(ast, (node) => {
      if (node.type === 'IdSelector') parts.push({ text: `#${node.name}`, type: 'id' })
      if (node.type === 'ClassSelector') parts.push({ text: `.${node.name}`, type: 'class' })
      if (node.type === 'AttributeSelector') {
        parts.push({ text: cssTree.generate(node), type: 'class' })
      }
      if (node.type === 'PseudoClassSelector') {
        parts.push({ text: `:${node.name}`, type: 'class' })
      }
      if (node.type === 'PseudoElementSelector') {
        parts.push({ text: `::${node.name}`, type: 'element' })
      }
      if (node.type === 'TypeSelector' && node.name !== '*') {
        parts.push({ text: node.name, type: 'element' })
      }
    })
    return { a, b, c, parts }
  } catch {
    return { a: 0, b: 0, c: 0, parts }
  }
}

// ── Examples ─────────────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'Basic', selectors: 'h1\np\ndiv' },
  { label: 'Classes', selectors: '.card\n.card .title\n.card .title:hover' },
  { label: 'IDs', selectors: '#main\n#main .content p\n#nav ul li.active' },
  {
    label: 'Complex',
    selectors: 'div > p:first-child\n.sidebar a:hover::before\n#app [data-role="admin"]',
  },
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
    const res: SpecResult[] = lines.map((selector, sourceIndex) => {
      const hasImportant = selector.includes('!important')
      const cleanSelector = selector.replace(/!important/g, '').trim()
      const spec = computeSpecificity(cleanSelector)
      return {
        selector,
        ...spec,
        sourceIndex,
        hasImportant,
      }
    })
    return sorted ? [...res].sort((x, y) => compareSpecificity(y, x)) : res
  }, [state.input, sorted])

  const maxParts = useMemo(
    () => ({
      a: Math.max(...results.map((result) => result.a), 1),
      b: Math.max(...results.map((result) => result.b), 1),
      c: Math.max(...results.map((result) => result.c), 1),
    }),
    [results]
  )

  const winner = useMemo(() => {
    if (results.length < 2) return -1
    let best = results[0]
    for (const result of results.slice(1)) {
      const comparison = best ? compareSpecificity(result, best) : 1
      if (comparison > 0 || (comparison === 0 && result.sourceIndex > (best?.sourceIndex ?? -1))) {
        best = result
      }
    }
    return best?.sourceIndex ?? -1
  }, [results])

  const winningResult = results.find((result) => result.sourceIndex === winner)
  const tiedSources = useMemo(
    () =>
      new Set(
        winningResult
          ? results
              .filter((result) => compareSpecificity(result, winningResult) === 0)
              .map((result) => result.sourceIndex)
          : []
      ),
    [results, winningResult]
  )

  const exportText = useMemo(() => {
    if (results.length === 0) return ''
    const lines = results.map(
      (r) => `${r.selector.padEnd(40)} (${r.a},${r.b},${r.c})${r.hasImportant ? ' !important' : ''}`
    )
    return lines.join('\n')
  }, [results])

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <>
          <Toolbar aria-label="Specificity view options">
            <ToolbarGroup label="View">
              <Button
                variant={sorted ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSorted(!sorted)}
              >
                Sort by specificity
              </Button>
              <Button
                variant={showBreakdown ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowBreakdown(!showBreakdown)}
              >
                Breakdown
              </Button>
            </ToolbarGroup>
            {results.length > 0 && (
              <ToolbarGroup label="Results" separated>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {results.length} selector(s)
                </span>
                <CopyButton text={exportText} label="Export" />
              </ToolbarGroup>
            )}
            <ToolbarSpacer />
            <ToolbarGroup label="Examples">
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
            </ToolbarGroup>
          </Toolbar>

          {/* Legend */}
          <div className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1">
            {Object.values(TYPE_COLORS).map((tc) => (
              <div key={tc.label} className="flex items-center gap-1">
                <div className="h-2 w-4 rounded" style={{ backgroundColor: tc.bar }} />
                <span className="text-2xs" style={{ color: tc.text }}>
                  {tc.label}
                </span>
              </div>
            ))}
          </div>
        </>
      }
    >
      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Input */}
        <div className="flex w-2/5 flex-col border-r border-[var(--color-border)]">
          <PaneHeader title="Selectors" hint="one per line" />
          <TextArea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder={
              '#main .content p\n.sidebar a:hover\ndiv > p:first-child\n#nav ul li.active'
            }
            monospace
            size="md"
            className="flex-1 resize-none rounded-none border-0 bg-[var(--color-bg)] p-4 focus:border-0"
          />
        </div>

        {/* Results */}
        <div className="flex w-3/5 flex-col overflow-auto p-4">
          {results.length > 0 ? (
            <div className="flex flex-col gap-3">
              {results.map((r, i) => {
                const isWinner = r.sourceIndex === winner && results.length > 1
                const isTied = tiedSources.size > 1 && tiedSources.has(r.sourceIndex)
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
                          <span className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-2xs font-bold text-[var(--color-bg)]">
                            {isTied ? 'WINS · LATER RULE' : 'WINS'}
                          </span>
                        )}
                        {isTied && !isWinner && (
                          <span className="rounded border border-[var(--color-accent)] px-1.5 py-0.5 text-2xs font-bold text-[var(--color-accent)]">
                            TIED
                          </span>
                        )}
                        <code className="text-xs text-[var(--color-text)]">{r.selector}</code>
                        {r.hasImportant && (
                          <span className="rounded bg-[var(--color-error)] px-1.5 py-0.5 text-2xs font-bold text-white">
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
                      <div className="flex h-2.5 flex-1 gap-1 overflow-hidden rounded bg-[var(--color-bg)]">
                        {(['a', 'b', 'c'] as const).map((part) => (
                          <div key={part} className="h-full flex-1">
                            <div
                              className="h-full"
                              style={{
                                width: `${(r[part] * 100) / maxParts[part]}%`,
                                backgroundColor:
                                  part === 'a'
                                    ? TYPE_COLORS.id.bar
                                    : part === 'b'
                                      ? TYPE_COLORS.class.bar
                                      : TYPE_COLORS.element.bar,
                              }}
                              title={`${part === 'a' ? 'IDs' : part === 'b' ? 'Classes' : 'Elements'}: ${r[part]}`}
                            />
                          </div>
                        ))}
                      </div>
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
                              className="rounded border px-1.5 py-0.5 font-mono text-2xs"
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
            <EmptyState title="Enter CSS selectors on the left — try one of the examples above" />
          )}
        </div>
      </div>
    </ToolLayout>
  )
}
