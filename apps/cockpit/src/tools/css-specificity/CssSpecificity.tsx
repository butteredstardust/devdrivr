import { useMemo, useState } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useUiStore } from '@/stores/ui.store'

type CssSpecificityState = {
  input: string
}

type SpecResult = {
  selector: string
  a: number  // IDs
  b: number  // Classes, attributes, pseudo-classes
  c: number  // Elements, pseudo-elements
  score: number
}

function computeSpecificity(selector: string): { a: number; b: number; c: number } {
  let a = 0, b = 0, c = 0
  // Remove :not() content but count its contents
  let s = selector.replace(/:not\(([^)]+)\)/g, (_, inner: string) => {
    const inner_spec = computeSpecificity(inner)
    a += inner_spec.a; b += inner_spec.b; c += inner_spec.c
    return ''
  })
  // Remove strings and attribute values
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return '' })
  // IDs
  a += (s.match(/#[a-zA-Z_-][\w-]*/g) ?? []).length
  // Classes, pseudo-classes (but not pseudo-elements)
  b += (s.match(/\.[a-zA-Z_-][\w-]*/g) ?? []).length
  b += (s.match(/:[a-zA-Z][\w-]*(?!\()/g) ?? []).filter((p) => !p.startsWith('::')).length
  // Elements and pseudo-elements
  c += (s.match(/::[a-zA-Z][\w-]*/g) ?? []).length
  // Remove already-counted items, then count remaining element names
  s = s.replace(/#[a-zA-Z_-][\w-]*/g, '').replace(/\.[a-zA-Z_-][\w-]*/g, '').replace(/:+[a-zA-Z][\w-]*/g, '')
  c += (s.match(/[a-zA-Z][\w-]*/g) ?? []).length

  return { a, b, c }
}

export default function CssSpecificity() {
  const [state, updateState] = useToolState<CssSpecificityState>('css-specificity', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [sorted, setSorted] = useState(false)

  const results = useMemo(() => {
    if (!state.input.trim()) return []
    const lines = state.input.split('\n').map((l) => l.trim()).filter(Boolean)
    const res: SpecResult[] = lines.map((selector) => {
      const spec = computeSpecificity(selector)
      return {
        selector,
        ...spec,
        score: spec.a * 100 + spec.b * 10 + spec.c,
      }
    })
    return sorted ? [...res].sort((x, y) => y.score - x.score) : res
  }, [state.input, sorted])

  const maxScore = useMemo(() => Math.max(...results.map((r) => r.score), 1), [results])

  // suppress unused warning — setLastAction is part of the established pattern
  void setLastAction

  return (
    <div className="flex h-full flex-col">
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
        {results.length > 0 && (
          <span className="text-xs text-[var(--color-text-muted)]">{results.length} selector(s)</span>
        )}
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            Selectors (one per line)
          </div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder={"#main .content p\n.sidebar a:hover\ndiv > p:first-child\n#nav ul li.active"}
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>
        <div className="flex w-1/2 flex-col overflow-auto p-4">
          {results.length > 0 ? (
            <div className="flex flex-col gap-3">
              {results.map((r, i) => (
                <div key={i} className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <code className="text-xs text-[var(--color-text)]">{r.selector}</code>
                    <span className="font-mono text-xs font-bold text-[var(--color-accent)]">
                      ({r.a}, {r.b}, {r.c})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded bg-[var(--color-bg)]">
                      <div
                        className="h-2 rounded bg-[var(--color-accent)]"
                        style={{ width: `${(r.score / maxScore) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-[var(--color-text-muted)]">{r.score}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-text-muted)]">Enter CSS selectors on the left</div>
          )}
        </div>
      </div>
    </div>
  )
}
