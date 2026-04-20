import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { Select } from '@/components/shared/Input'
import { useWorker } from '@/hooks/useWorker'
import type { RefactoringWorker } from '@/workers/refactoring.worker'
import RefactoringWorkerFactory from '@/workers/refactoring.worker?worker'
import {
  TRANSFORMS,
  CATEGORIES,
  SAFETY_COLORS,
  SAFETY_LABELS,
  LANGUAGES,
  type TransformCategory,
} from './transforms'

type RefactoringState = {
  input: string
  selectedTransforms: string[]
  language: string
}

export default function RefactoringToolkit() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const [state, updateState] = useToolState<RefactoringState>('refactoring-toolkit', {
    input: '',
    selectedTransforms: [],
    language: 'javascript',
  })

  const worker = useWorker<RefactoringWorker>(
    () => new RefactoringWorkerFactory(),
    ['applyTransforms']
  )

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
    if (!state.input.trim() || state.selectedTransforms.length === 0 || !worker) {
      setPreview(null)
      return
    }
    debounceRef.current = setTimeout(() => {
      const parser = state.language === 'typescript' ? 'tsx' : 'babel'
      worker
        .applyTransforms(state.input, state.selectedTransforms, parser)
        .then((result) => setPreview(result))
        .catch((err: Error) => setLastAction(err.message, 'error'))
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input, state.selectedTransforms, state.language, worker, setLastAction])

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
            className={`rounded border px-3 py-1 font-mono text-xs hover:opacity-80 ${
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => updateState({ selectedTransforms: [] })}
          >
            Clear
          </Button>
        )}
        <Select
          value={state.language}
          onChange={(e) => updateState({ language: e.target.value, selectedTransforms: [] })}
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>
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
            const allSelected = catTransforms.every((t) => state.selectedTransforms.includes(t.id))
            return (
              <div key={cat.id} className="mb-4">
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="mb-2 flex w-full items-center gap-2 font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
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
        <div className="min-h-0 flex-1 overflow-hidden">
          {preview !== null && !noChanges ? (
            <DiffEditor
              original={state.input}
              modified={preview}
              language={state.language}
              options={{
                ...monacoOptions,
                readOnly: true,
                renderSideBySide: true,
                enableSplitViewResizing: true,
              }}
            />
          ) : (
            <Editor
              theme={monacoTheme}
              language={state.language}
              value={state.input}
              onChange={(v) => updateState({ input: v ?? '' })}
              options={monacoOptions}
            />
          )}
        </div>
      </div>
    </div>
  )
}
