import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  CheckCircleIcon,
  FileTsIcon,
  FloppyDiskIcon,
  InfoIcon,
  SlidersHorizontalIcon,
  WarningCircleIcon,
  WarningIcon,
  XCircleIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useToolAction } from '@/hooks/useToolAction'
import { CopyButton } from '@/components/shared/CopyButton'
import { Alert } from '@/components/shared/Alert'
import { Button } from '@/components/shared/Button'
import { Select } from '@/components/shared/Input'
import { Toggle } from '@/components/shared/Toggle'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { useUiStore } from '@/stores/ui.store'
import { saveFileDialog } from '@/lib/file-io'
import { TS_PLAYGROUND_SAMPLE } from '@/lib/tool-samples'
import type { Diagnostic } from '@/workers/typescript.api'
import type { TypeScriptWorker } from '@/workers/typescript.worker'
import TypeScriptWorkerFactory from '@/workers/typescript.worker?worker'

type TsPlaygroundState = {
  input: string
  fileName: string | null
  target: string
  module: string
  strict: boolean
  /** Compiler options live behind a disclosure; the choice is persisted. */
  optionsOpen: boolean
  problemsOpen: boolean
}

const TARGETS = ['ES5', 'ES2015', 'ES2020', 'ESNext']
const MODULES = ['ESNext', 'CommonJS', 'None']

const SEVERITY_ICON = {
  error: XCircleIcon,
  warning: WarningIcon,
  suggestion: InfoIcon,
} as const

const SEVERITY_COLOR = {
  error: 'var(--color-error)',
  warning: 'var(--color-warning)',
  suggestion: 'var(--color-info)',
} as const

/** Diagnostics arrive syntactic-first; reading order is by position. */
function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0)
  )
}

/** Suggestions are counted as suggestions: calling one a warning misreports it. */
export function describeProblems(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return 'No problems'
  const parts: string[] = []
  for (const category of ['error', 'warning', 'suggestion'] as const) {
    const count = diagnostics.filter((d) => d.category === category).length
    if (count > 0) parts.push(`${count} ${category}${count === 1 ? '' : 's'}`)
  }
  return parts.join(', ')
}

export default function TsPlayground() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  // Merged once: a fresh options object on every keystroke makes
  // @monaco-editor/react re-apply the whole configuration to both editors.
  const editorOptions = useMemo(
    () => ({ ...monacoOptions, wordWrap: 'off' as const }),
    [monacoOptions]
  )
  const outputOptions = useMemo(() => ({ ...editorOptions, readOnly: true }), [editorOptions])

  const [state, updateState] = useToolState<TsPlaygroundState>('ts-playground', {
    input: TS_PLAYGROUND_SAMPLE,
    fileName: null,
    target: 'ESNext',
    module: 'ESNext',
    strict: true,
    optionsOpen: false,
    problemsOpen: true,
  })

  const worker = useWorker<TypeScriptWorker>(() => new TypeScriptWorkerFactory(), ['transpile'])

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [output, setOutput] = useState('')
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [typesChecked, setTypesChecked] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isTranspiling, setIsTranspiling] = useState(false)
  const optionsId = useId()
  const problemsId = useId()

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestRef = useRef(0)
  // Auto-transpile runs on every debounced keystroke; only a compile the user
  // asked for is allowed to toast, otherwise the status bar chatters.
  const announceRef = useRef(false)

  const { input, target, module: moduleKind, strict } = state
  const compilerOptions = useMemo(
    () => ({ target, module: moduleKind, strict }),
    [target, moduleKind, strict]
  )
  const optionsRef = useRef(compilerOptions)
  optionsRef.current = compilerOptions
  const inputRef = useRef(input)
  inputRef.current = input

  const hasCode = input.trim().length > 0

  const runTranspile = useCallback(async () => {
    const source = inputRef.current
    const requestId = ++requestRef.current
    // Claimed up front: a debounced auto-compile landing after ⌘↵ would
    // otherwise clear the flag in its own `finally` and swallow the
    // announcement the user explicitly asked for.
    const announce = announceRef.current
    announceRef.current = false
    if (!worker || !source.trim()) return
    setIsTranspiling(true)
    try {
      const result = await worker.transpile(source, optionsRef.current)
      if (requestId !== requestRef.current) return
      setOutput(result.output)
      setDiagnostics(result.diagnostics)
      setTypesChecked(result.typesChecked)
      setError(null)
      if (announce) {
        const problems = result.diagnostics.length
        setLastAction(
          problems === 0 ? 'Compiled' : describeProblems(result.diagnostics),
          problems === 0 ? 'success' : 'info'
        )
      }
    } catch (e) {
      // Same superseding rule as the success path: a request the user has
      // already moved past must not paint an error over the current result.
      if (requestId !== requestRef.current) return
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      setOutput('')
      setDiagnostics([])
      // A failed compile checked nothing, so the "standard library could not be
      // loaded" warning must not survive from the last successful run.
      setTypesChecked(true)
      if (announce) setLastAction('Compile failed', 'error')
    } finally {
      if (requestId === requestRef.current) setIsTranspiling(false)
    }
  }, [worker, setLastAction])

  // Auto-transpile on input/option change (debounced 500ms).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!worker) return
    if (!input.trim()) {
      requestRef.current += 1
      setOutput('')
      setDiagnostics([])
      setError(null)
      setTypesChecked(true)
      setIsTranspiling(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      void runTranspile()
    }, 500)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [worker, input, compilerOptions, runTranspile])

  const handleCompile = useCallback(() => {
    if (!inputRef.current.trim()) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    announceRef.current = true
    void runTranspile()
  }, [runTranspile])

  useKeyboardShortcut({ key: 'Enter', mod: true }, handleCompile)

  const handleSave = useCallback(() => {
    // Any extension, not just .ts — the picker accepts every text file, and
    // opening notes.md used to offer to save it as notes.md.js.
    const base = state.fileName?.replace(/\.[^.]+$/, '') ?? 'output'
    void saveFileDialog(output, `${base}.js`).then(
      (path) => setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
      (err: unknown) =>
        setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    )
  }, [output, state.fileName, setLastAction])

  const loadExample = useCallback(() => {
    updateState({ input: TS_PLAYGROUND_SAMPLE, fileName: null })
  }, [updateState])

  useToolAction((action) => {
    if (action.type === 'open-file') {
      updateState({ input: action.content, fileName: action.filename })
      setError(null)
      setLastAction(`Opened ${action.filename}`, 'success')
    }
    if (action.type === 'save-file') {
      if (!output) {
        setLastAction('Nothing to save yet', 'info')
        return
      }
      handleSave()
    }
    if (action.type === 'copy-output' && output) {
      void navigator.clipboard.writeText(output).then(
        () => setLastAction('Output copied', 'success'),
        () => setLastAction('Copy failed', 'error')
      )
    }
  })

  const sorted = useMemo(() => sortDiagnostics(diagnostics), [diagnostics])
  const errorCount = sorted.filter((d) => d.category === 'error').length
  const inputLines = input ? input.split('\n').length : 0
  const outputLines = output ? output.split('\n').length : 0
  const settledSummary = !hasCode
    ? 'Nothing to compile yet'
    : error
      ? 'Compile failed'
      : describeProblems(sorted)
  const summary = isTranspiling && hasCode ? 'Compiling…' : settledSummary

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <div className="border-b border-[var(--color-border)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <FileTsIcon
                size={15}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)]"
              />
              <span className="font-ui truncate text-xs font-semibold text-[var(--color-text)]">
                {state.fileName ?? 'Untitled.ts'}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-2xs text-[var(--color-text-muted)]">
                {!isTranspiling && hasCode && !error && sorted.length === 0 && (
                  <CheckCircleIcon
                    size={12}
                    aria-hidden="true"
                    className="text-[var(--color-success)]"
                  />
                )}
                {/* Warning-only compiles get a glyph too, in their own colour. */}
                {!isTranspiling && sorted.length > 0 && (
                  <WarningCircleIcon
                    size={12}
                    aria-hidden="true"
                    style={{
                      color: errorCount > 0 ? 'var(--color-error)' : 'var(--color-warning)',
                    }}
                  />
                )}
                {/* Only the settled result is live: announcing "Compiling…" as
                    well would make every keystroke-triggered run speak twice. */}
                <span role="status" aria-live="polite">
                  {isTranspiling && hasCode ? '' : settledSummary}
                </span>
                {isTranspiling && hasCode && <span aria-hidden="true">Compiling…</span>}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateState({ optionsOpen: !state.optionsOpen })}
                aria-expanded={state.optionsOpen}
                {...(state.optionsOpen ? { 'aria-controls': optionsId } : {})}
                className="gap-1"
              >
                <SlidersHorizontalIcon size={13} aria-hidden="true" />
                Options
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCompile}
                disabled={!hasCode}
                // Deliberately not `loading`: a background auto-compile would
                // then disable the very button that requests an announced one.
                title="Compile now (⌘↵)"
              >
                Compile
                <span className="ml-1 text-2xs opacity-70" aria-hidden="true">
                  ⌘↵
                </span>
              </Button>
              <CopyButton text={output} label="Copy output" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSave}
                disabled={!output}
                title="Save the JavaScript output to a file (⌘S)"
                aria-label="Save output to file"
              >
                <FloppyDiskIcon size={15} aria-hidden="true" />
              </Button>
            </div>
          </div>

          {state.optionsOpen && (
            <div
              id={optionsId}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2"
            >
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                Target
                <Select
                  aria-label="Target"
                  value={state.target}
                  onChange={(e) => updateState({ target: e.target.value })}
                >
                  {TARGETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                Module
                <Select
                  aria-label="Module"
                  value={state.module}
                  onChange={(e) => updateState({ module: e.target.value })}
                >
                  {MODULES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </label>
              <Toggle
                label="Strict"
                checked={state.strict}
                onChange={(checked) => updateState({ strict: checked })}
              />
              <span className="ml-auto text-2xs text-[var(--color-text-muted)]">
                Compiles automatically as you type.
              </span>
            </div>
          )}
        </div>
      }
    >
      {error && (
        <Alert
          variant="error"
          className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          {error}
        </Alert>
      )}
      {!typesChecked && !error && (
        <Alert
          variant="warning"
          className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          The TypeScript standard library could not be loaded — syntax is checked, types are not.
        </Alert>
      )}

      {/* Stacks below 900px: two half-width editors are unusable at 800×600. */}
      <div className="flex min-h-0 flex-1 gap-px overflow-hidden bg-[var(--color-border)] max-[900px]:flex-col">
        <section
          aria-label="TypeScript input"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="font-ui text-xs font-semibold text-[var(--color-text)]">
              TypeScript
            </span>
            <span className="truncate text-2xs text-[var(--color-text-muted)]">input</span>
            <span className="ml-auto shrink-0 text-2xs tabular-nums text-[var(--color-text-muted)]">
              {inputLines} line{inputLines === 1 ? '' : 's'}
            </span>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <Editor
              theme={monacoTheme}
              language="typescript"
              value={input}
              onChange={(v) => updateState({ input: v ?? '' })}
              options={editorOptions}
            />
            {!hasCode && (
              // Click-through so the hint never stands between user and caret;
              // only the button itself takes pointer events.
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-[var(--color-text-muted)]">
                <FileTsIcon size={32} weight="light" aria-hidden="true" />
                <p className="text-sm">Paste or type TypeScript</p>
                <p className="max-w-xs text-xs opacity-60">
                  It compiles as you type and reports type errors below.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadExample}
                  className="pointer-events-auto"
                >
                  Load example
                </Button>
              </div>
            )}
          </div>
        </section>

        <section
          aria-label="JavaScript output"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="font-ui text-xs font-semibold text-[var(--color-text)]">
              JavaScript
            </span>
            <span className="truncate text-2xs text-[var(--color-text-muted)]">
              {state.target} · {state.module}
            </span>
            <span className="ml-auto shrink-0 text-2xs tabular-nums text-[var(--color-text-muted)]">
              {outputLines} line{outputLines === 1 ? '' : 's'}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <Editor
              theme={monacoTheme}
              language="javascript"
              value={output}
              options={outputOptions}
            />
          </div>
        </section>
      </div>

      {/* Problems used to be an unlabelled 80px-tall strip of orange text with
          no counts, no severity and no way to get it out of the way. */}
      <section
        aria-label="Problems"
        className="flex max-h-[40%] shrink-0 flex-col overflow-hidden border-t border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div className="flex items-center gap-2 px-3 py-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => updateState({ problemsOpen: !state.problemsOpen })}
            aria-expanded={state.problemsOpen}
            {...(state.problemsOpen ? { 'aria-controls': problemsId } : {})}
            className="gap-1"
          >
            Problems
            <span className="text-2xs tabular-nums opacity-70">{sorted.length}</span>
          </Button>
          {/* Plain text: the toolbar's status region already announces this
              summary, and a second live region would double every compile.
              (An Alert above still speaks assertively when a compile fails.) */}
          <span className="text-2xs text-[var(--color-text-muted)]">{summary}</span>
        </div>
        {state.problemsOpen && (
          <ul id={problemsId} className="min-h-0 flex-1 overflow-auto px-3 pb-2">
            {sorted.length === 0 ? (
              <li className="py-1 text-xs text-[var(--color-text-muted)]">
                {hasCode ? 'No problems found.' : 'Nothing to compile yet.'}
              </li>
            ) : (
              sorted.map((d, i) => {
                const Icon = SEVERITY_ICON[d.category]
                return (
                  <li
                    key={`${d.code}-${d.line ?? 0}-${d.column ?? 0}-${i}`}
                    className="flex items-start gap-2 py-0.5 text-xs"
                  >
                    <Icon
                      size={13}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0"
                      style={{ color: SEVERITY_COLOR[d.category] }}
                    />
                    {d.line !== undefined && (
                      <span className="shrink-0 tabular-nums text-[var(--color-text-muted)]">
                        {d.line}:{d.column ?? 1}
                      </span>
                    )}
                    <span className="min-w-0 whitespace-pre-wrap text-[var(--color-text)]">
                      {d.message}
                    </span>
                    <span className="ml-auto shrink-0 text-2xs tabular-nums text-[var(--color-text-muted)]">
                      TS{d.code}
                    </span>
                  </li>
                )
              })
            )}
          </ul>
        )}
      </section>
    </ToolLayout>
  )
}
