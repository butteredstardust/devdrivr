import { useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type RefactoringState = {
  input: string
  selectedTransforms: string[]
}

type Transform = {
  id: string
  name: string
  description: string
  apply: (code: string) => string
}

const TRANSFORMS: Transform[] = [
  {
    id: 'var-to-let-const',
    name: 'var → let/const',
    description: 'Convert var declarations to let or const',
    apply: (code) => code.replace(/\bvar\s+/g, 'const '),
  },
  {
    id: 'remove-console',
    name: 'Remove console.*',
    description: 'Remove console.log, console.debug, console.warn statements',
    apply: (code) =>
      code.replace(/^\s*console\.(log|debug|warn|info|error)\(.*?\);?\s*$/gm, ''),
  },
  {
    id: 'optional-chaining',
    name: 'Optional chaining',
    description: 'Convert a && a.b to a?.b patterns',
    apply: (code) => code.replace(/(\w+)\s*&&\s*\1\.(\w+)/g, '$1?.$2'),
  },
  {
    id: 'template-literals',
    name: 'Template literals',
    description: 'Convert string concatenation to template literals',
    apply: (code) => {
      // Simple case: "str" + var + "str"
      return code.replace(
        /(['"])([^'"]*)\1\s*\+\s*(\w+)\s*\+\s*(['"])([^'"]*)\4/g,
        '`$2${$3}$5`'
      )
    },
  },
  {
    id: 'arrow-functions',
    name: 'Arrow functions',
    description: 'Convert function expressions to arrow functions',
    apply: (code) => code.replace(/function\s*\(([^)]*)\)\s*\{/g, '($1) => {'),
  },
  {
    id: 'trailing-commas',
    name: 'Add trailing commas',
    description: 'Add trailing commas to multi-line arrays and objects',
    apply: (code) => code.replace(/([^\s,])\n(\s*[}\]])/g, '$1,\n$2'),
  },
]

export default function RefactoringToolkit() {
  useMonacoTheme()
  const [state, updateState] = useToolState<RefactoringState>('refactoring-toolkit', {
    input: '',
    selectedTransforms: [],
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [preview, setPreview] = useState<string | null>(null)

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

  const handlePreview = useCallback(() => {
    if (!state.input.trim() || state.selectedTransforms.length === 0) return
    let result = state.input
    for (const id of state.selectedTransforms) {
      const transform = TRANSFORMS.find((t) => t.id === id)
      if (transform) result = transform.apply(result)
    }
    setPreview(result)
    setLastAction('Preview generated', 'info')
  }, [state.input, state.selectedTransforms, setLastAction])

  const handleApply = useCallback(() => {
    if (preview === null) return
    updateState({ input: preview })
    setPreview(null)
    setLastAction('Transforms applied', 'success')
  }, [preview, updateState, setLastAction])

  const handleDiscard = useCallback(() => {
    setPreview(null)
    setLastAction('Preview discarded', 'info')
  }, [setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={handlePreview}
          disabled={state.selectedTransforms.length === 0}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-50"
        >
          Preview
        </button>
        {preview !== null && (
          <>
            <button
              onClick={handleApply}
              className="rounded border border-[var(--color-success)] px-3 py-1 text-xs text-[var(--color-success)] hover:bg-[var(--color-accent-dim)]"
            >
              Apply
            </button>
            <button
              onClick={handleDiscard}
              className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
            >
              Discard
            </button>
          </>
        )}
        <div className="ml-auto">
          <CopyButton text={preview ?? state.input} />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Transforms sidebar */}
        <div className="w-60 shrink-0 overflow-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <h3 className="mb-3 font-pixel text-xs text-[var(--color-text-muted)]">Transforms</h3>
          {TRANSFORMS.map((t) => (
            <label
              key={t.id}
              className="mb-2 flex cursor-pointer items-start gap-2 rounded p-2 text-xs hover:bg-[var(--color-surface-hover)]"
            >
              <input
                type="checkbox"
                checked={state.selectedTransforms.includes(t.id)}
                onChange={() => toggleTransform(t.id)}
                className="mt-0.5 accent-[var(--color-accent)]"
              />
              <div>
                <div className="font-bold text-[var(--color-text)]">{t.name}</div>
                <div className="text-[var(--color-text-muted)]">{t.description}</div>
              </div>
            </label>
          ))}
        </div>

        {/* Editor area */}
        <div className="flex flex-1 overflow-hidden">
          {preview !== null ? (
            <>
              <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
                <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
                  Original
                </div>
                <div className="flex-1">
                  <Editor
                    language="javascript"
                    value={state.input}
                    options={{ ...EDITOR_OPTIONS, readOnly: true }}
                  />
                </div>
              </div>
              <div className="flex w-1/2 flex-col">
                <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-accent)]">
                  Preview
                </div>
                <div className="flex-1">
                  <Editor
                    language="javascript"
                    value={preview}
                    options={{ ...EDITOR_OPTIONS, readOnly: true }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1">
              <Editor
                language="javascript"
                value={state.input}
                onChange={(v) => updateState({ input: v ?? '' })}
                options={EDITOR_OPTIONS}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
