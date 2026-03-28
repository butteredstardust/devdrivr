import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type TransformCategory = 'modernize' | 'safety' | 'cleanup'
type SafetyLevel = 'safe' | 'caution' | 'destructive'

type Transform = {
  id: string
  name: string
  description: string
  category: TransformCategory
  safety: SafetyLevel
  languages: string[]
  apply: (code: string) => string
}

const CATEGORIES: { id: TransformCategory; label: string }[] = [
  { id: 'modernize', label: 'Modernize' },
  { id: 'safety', label: 'Type Safety' },
  { id: 'cleanup', label: 'Cleanup' },
]

const SAFETY_COLORS: Record<SafetyLevel, string> = {
  safe: 'var(--color-success)',
  caution: 'var(--color-warning)',
  destructive: 'var(--color-error)',
}

const SAFETY_LABELS: Record<SafetyLevel, string> = {
  safe: 'Safe — no semantic changes',
  caution: 'Caution — verify behaviour after applying',
  destructive: 'Destructive — removes code',
}

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
]

const TRANSFORMS: Transform[] = [
  // ── Modernize ──────────────────────────────────────────────
  {
    id: 'var-to-const',
    name: 'var → const',
    description: 'Convert var declarations to const',
    category: 'modernize',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (code) => code.replace(/\bvar\s+/g, 'const '),
  },
  {
    id: 'arrow-functions',
    name: 'Arrow functions',
    description: 'Convert function expressions to arrow functions',
    category: 'modernize',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (code) => code.replace(/function\s*\(([^)]*)\)\s*\{/g, '($1) => {'),
  },
  {
    id: 'template-literals',
    name: 'Template literals',
    description: 'Convert string concatenation to template literals',
    category: 'modernize',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (code) =>
      code.replace(
        /(['"])([^'"]*)\1\s*\+\s*(\w+)\s*\+\s*(['"])([^'"]*)\4/g,
        '`$2${$3}$5`'
      ),
  },
  {
    id: 'optional-chaining',
    name: 'Optional chaining',
    description: 'Convert a && a.b patterns to a?.b',
    category: 'modernize',
    safety: 'caution',
    languages: ['javascript', 'typescript'],
    apply: (code) => code.replace(/(\w+)\s*&&\s*\1\.(\w+)/g, '$1?.$2'),
  },
  {
    id: 'require-to-import',
    name: 'require → import',
    description: 'Convert CommonJS require() to ES module import',
    category: 'modernize',
    safety: 'caution',
    languages: ['javascript', 'typescript'],
    apply: (code) =>
      code.replace(
        /(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g,
        "import $1 from '$2'"
      ),
  },
  {
    id: 'spread-operator',
    name: 'Object.assign → spread',
    description: 'Convert Object.assign({}, x) to { ...x }',
    category: 'modernize',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (code) =>
      code.replace(/Object\.assign\(\s*\{\s*\}\s*,\s*(\w+)\s*\)/g, '{ ...$1 }'),
  },
  // ── Type Safety ────────────────────────────────────────────
  {
    id: 'strict-equality',
    name: '== → ===',
    description: 'Convert loose equality to strict equality',
    category: 'safety',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (code) => {
      let result = code.replace(/([^!=])={2}(?!=)/g, '$1===')
      result = result.replace(/!=(?!=)/g, '!==')
      return result
    },
  },
  {
    id: 'nullish-coalescing',
    name: '|| → ?? (nullish)',
    description: 'Convert || to ?? when RHS is a literal default',
    category: 'safety',
    safety: 'caution',
    languages: ['javascript', 'typescript'],
    apply: (code) =>
      code.replace(/(\w+)\s*\|\|\s*(['"`]|\d|true|false|\[|\{)/g, '$1 ?? $2'),
  },
  // ── Cleanup ────────────────────────────────────────────────
  {
    id: 'remove-console',
    name: 'Remove console.*',
    description: 'Remove console.log/debug/warn/info/error statements',
    category: 'cleanup',
    safety: 'destructive',
    languages: ['javascript', 'typescript'],
    apply: (code) =>
      code.replace(/^\s*console\.(log|debug|warn|info|error)\(.*?\);?\s*$/gm, ''),
  },
  {
    id: 'remove-debugger',
    name: 'Remove debugger',
    description: 'Remove debugger statements',
    category: 'cleanup',
    safety: 'destructive',
    languages: ['javascript', 'typescript'],
    apply: (code) => code.replace(/^\s*debugger;?\s*$/gm, ''),
  },
  {
    id: 'trailing-commas',
    name: 'Add trailing commas',
    description: 'Add trailing commas to multi-line arrays and objects',
    category: 'cleanup',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (code) => code.replace(/([^\s,])\n(\s*[}\]])/g, '$1,\n$2'),
  },
]

type RefactoringState = {
  input: string
  selectedTransforms: string[]
  language: string
}

export default function RefactoringToolkit() {
  useMonacoTheme()
  const [state, updateState] = useToolState<RefactoringState>('refactoring-toolkit', {
    input: '',
    selectedTransforms: [],
    language: 'javascript',
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [preview, setPreview] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Filter transforms by selected language
  const availableTransforms = useMemo(
    () => TRANSFORMS.filter((t) => t.languages.includes(state.language)),
    [state.language]
  )

  // Auto-preview: debounce 300ms when input or selected transforms change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!state.input.trim() || state.selectedTransforms.length === 0) {
      setPreview(null)
      return
    }
    debounceRef.current = setTimeout(() => {
      let result = state.input
      for (const id of state.selectedTransforms) {
        const transform = availableTransforms.find((t) => t.id === id)
        if (transform) result = transform.apply(result)
      }
      setPreview(result)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input, state.selectedTransforms, availableTransforms])

  const handleApply = useCallback(() => {
    if (preview === null || preview === state.input) return
    updateState({ input: preview, selectedTransforms: [] })
    setPreview(null)
    setLastAction('Transforms applied', 'success')
  }, [preview, state.input, updateState, setLastAction])

  const toggleTransform = useCallback(
    (id: string) => {
      updateState({
        selectedTransforms: state.selectedTransforms.includes(id)
          ? state.selectedTransforms.filter((t) => t !== id)
          : [...state.selectedTransforms, id],
      })
    },
    [state.selectedTransforms, updateState]
  )

  const toggleCategory = useCallback(
    (categoryId: TransformCategory) => {
      const ids = availableTransforms.filter((t) => t.category === categoryId).map((t) => t.id)
      const allSelected = ids.every((id) => state.selectedTransforms.includes(id))
      if (allSelected) {
        updateState({
          selectedTransforms: state.selectedTransforms.filter((id) => !ids.includes(id)),
        })
      } else {
        const merged = new Set([...state.selectedTransforms, ...ids])
        updateState({ selectedTransforms: [...merged] })
      }
    },
    [availableTransforms, state.selectedTransforms, updateState]
  )

  const selectedCount = state.selectedTransforms.length
  const hasDestructive = state.selectedTransforms.some((id) => {
    const t = TRANSFORMS.find((tr) => tr.id === id)
    return t?.safety === 'destructive'
  })
  const noChanges = preview !== null && preview === state.input

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        {preview !== null && !noChanges && (
          <button
            onClick={handleApply}
            className={`rounded border px-3 py-1 font-pixel text-xs hover:opacity-80 ${
              hasDestructive
                ? 'border-[var(--color-warning)] text-[var(--color-warning)]'
                : 'border-[var(--color-success)] text-[var(--color-success)]'
            }`}
          >
            {hasDestructive ? 'Apply (destructive)' : 'Apply'}
          </button>
        )}
        {noChanges && (
          <span className="text-xs text-[var(--color-text-muted)]">No changes to apply</span>
        )}
        {selectedCount > 0 && (
          <button
            onClick={() => updateState({ selectedTransforms: [] })}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
          >
            Clear
          </button>
        )}
        <select
          value={state.language}
          onChange={(e) => updateState({ language: e.target.value, selectedTransforms: [] })}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        {selectedCount > 0 && (
          <span className="text-xs text-[var(--color-text-muted)]">
            {selectedCount} transform{selectedCount !== 1 ? 's' : ''}
          </span>
        )}
        <div className="ml-auto">
          <CopyButton text={preview ?? state.input} />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Transforms sidebar */}
        <div className="w-64 shrink-0 overflow-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          {CATEGORIES.map((cat) => {
            const catTransforms = availableTransforms.filter((t) => t.category === cat.id)
            if (catTransforms.length === 0) return null
            const allSelected = catTransforms.every((t) =>
              state.selectedTransforms.includes(t.id)
            )
            return (
              <div key={cat.id} className="mb-4">
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="mb-2 flex w-full items-center gap-2 font-pixel text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    readOnly
                    className="accent-[var(--color-accent)]"
                  />
                  {cat.label}
                </button>
                {catTransforms.map((t) => (
                  <label
                    key={t.id}
                    className="mb-1 flex cursor-pointer items-start gap-2 rounded p-1.5 text-xs hover:bg-[var(--color-surface-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={state.selectedTransforms.includes(t.id)}
                      onChange={() => toggleTransform(t.id)}
                      className="mt-0.5 accent-[var(--color-accent)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[var(--color-text)]">{t.name}</span>
                        <span
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: SAFETY_COLORS[t.safety] }}
                          title={SAFETY_LABELS[t.safety]}
                        />
                      </div>
                      <div className="text-[var(--color-text-muted)]">{t.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            )
          })}
        </div>

        {/* Editor area */}
        <div className="flex-1 overflow-hidden">
          {preview !== null && !noChanges ? (
            <DiffEditor
              original={state.input}
              modified={preview}
              language={state.language}
              options={{
                ...EDITOR_OPTIONS,
                readOnly: true,
                renderSideBySide: true,
                enableSplitViewResizing: true,
              }}
            />
          ) : (
            <Editor
              language={state.language}
              value={state.input}
              onChange={(v) => updateState({ input: v ?? '' })}
              options={EDITOR_OPTIONS}
            />
          )}
        </div>
      </div>
    </div>
  )
}
