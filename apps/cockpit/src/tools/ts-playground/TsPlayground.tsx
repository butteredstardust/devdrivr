import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  CheckCircleIcon,
  FileTsIcon,
  FloppyDiskIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonaco } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useToolAction } from '@/hooks/useToolAction'
import { CopyButton } from '@/components/shared/CopyButton'
import { Kbd } from '@/components/shared/Kbd'
import { Alert } from '@/components/shared/Alert'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { Button } from '@/components/shared/Button'
import { Select } from '@/components/shared/Input'
import { Toggle } from '@/components/shared/Toggle'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { SettingsPopover, SettingsRow, SettingsSection } from '@/components/shared/SettingsPopover'
import { useUiStore } from '@/stores/ui.store'
import { saveFileDialog } from '@/lib/file-io'
import { TS_PLAYGROUND_SAMPLE } from '@/lib/tool-samples'
import type { Diagnostic } from '@/workers/typescript.api'
import type { TypeScriptWorker } from '@/workers/typescript.worker'
import TypeScriptWorkerFactory from '@/workers/typescript.worker?worker'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatShortcut } from '@/lib/shortcut-label'
import { ProblemsList, type ProblemItem } from '@/components/shared/ProblemsList'
import { sendToTool } from '@/lib/tool-handoff'

type TsPlaygroundState = {
  input: string
  fileName: string | null
  target: string
  module: string
  strict: boolean
  jsx: boolean
  /** Compiler options live behind a disclosure; the choice is persisted. */
  problemsOpen: boolean
}

const TARGETS = [
  'ES5',
  'ES2015',
  'ES2016',
  'ES2017',
  'ES2018',
  'ES2019',
  'ES2020',
  'ES2021',
  'ES2022',
  'ES2023',
  'ESNext',
]
const MODULES = ['ES2015', 'ES2020', 'ES2022', 'ESNext', 'CommonJS', 'Node16', 'NodeNext', 'None']

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
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
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
    jsx: false,
    problemsOpen: true,
  })

  const worker = useWorker<TypeScriptWorker>(() => new TypeScriptWorkerFactory(), ['transpile'])

  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const [output, setOutput] = useState('')
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [typesChecked, setTypesChecked] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isTranspiling, setIsTranspiling] = useState(false)
  // Session state: a popover that restored itself open would cover the editor at launch.
  const [optionsOpen, setOptionsOpen] = useState(false)
  const problemsId = useId()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestRef = useRef(0)
  // Auto-transpile runs on every debounced keystroke; only a compile the user
  // asked for is allowed to toast, otherwise the status bar chatters.
  const announceRef = useRef(false)

  const { input, target, module: moduleKind, strict, jsx } = state
  const compilerOptions = useMemo(
    () => ({ target, module: moduleKind, strict, jsx }),
    [target, moduleKind, strict, jsx]
  )
  const optionsRef = useRef(compilerOptions)
  optionsRef.current = compilerOptions
  const inputRef = useRef(input)
  inputRef.current = input

  const hasCode = input.trim().length > 0

  const goToProblem = useCallback((problem: ProblemItem) => {
    const editor = editorRef.current
    if (!editor || problem.line === undefined) return
    const position = { lineNumber: problem.line, column: problem.column ?? 1 }
    editor.revealPositionInCenter(position)
    editor.setPosition(position)
    editor.focus()
  }, [])

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

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!monaco || !model) return
    monaco.editor.setModelMarkers(
      model,
      'typescript-playground',
      diagnostics
        .filter((diagnostic) => diagnostic.line !== undefined)
        .map((diagnostic) => ({
          startLineNumber: diagnostic.line ?? 1,
          startColumn: diagnostic.column ?? 1,
          endLineNumber: diagnostic.line ?? 1,
          endColumn: (diagnostic.column ?? 1) + 1,
          message: diagnostic.message,
          code: `TS${diagnostic.code}`,
          severity:
            diagnostic.category === 'error'
              ? monaco.MarkerSeverity.Error
              : diagnostic.category === 'warning'
                ? monaco.MarkerSeverity.Warning
                : monaco.MarkerSeverity.Hint,
        }))
    )
    return () => monaco.editor.setModelMarkers(model, 'typescript-playground', [])
  }, [diagnostics, state.jsx])

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
      updateState({
        input: action.content,
        fileName: action.filename,
        jsx: /\.[jt]sx$/i.test(action.filename),
      })
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
      void copy(output, { success: 'Output copied', failure: 'Copy failed' })
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
        <DocumentToolbar border aria-label="TypeScript playground actions">
          <DocumentIdentity
            title={state.fileName ?? 'Untitled.ts'}
            icon={
              <FileTsIcon
                size={16}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)]"
              />
            }
            // Only the settled result is announced. "Compiling…" goes in
            // aria-hidden so a keystroke-triggered run does not speak twice,
            // while the live region itself stays mounted — a region added and
            // removed around each run announces nothing at all.
            status={
              isTranspiling && hasCode ? <span aria-hidden="true">{summary}</span> : settledSummary
            }
            statusIcon={
              !isTranspiling && hasCode && !error && sorted.length === 0 ? (
                <CheckCircleIcon
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-success)]"
                />
              ) : !isTranspiling && sorted.length > 0 ? (
                <WarningCircleIcon
                  size={12}
                  aria-hidden="true"
                  className="shrink-0"
                  style={{
                    color: errorCount > 0 ? 'var(--color-error)' : 'var(--color-warning)',
                  }}
                />
              ) : undefined
            }
          />

          <ToolbarGroup label="Playground actions" separated>
            <SettingsPopover
              label="Options"
              title="Compiler options"
              open={optionsOpen}
              onOpenChange={setOptionsOpen}
              description="Compiles automatically as you type."
            >
              <SettingsSection>
                <SettingsRow label="Target">
                  <Select
                    value={state.target}
                    onChange={(e) => updateState({ target: e.target.value })}
                  >
                    {TARGETS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </SettingsRow>
                <SettingsRow label="Module">
                  <Select
                    value={state.module}
                    onChange={(e) => updateState({ module: e.target.value })}
                  >
                    {MODULES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </SettingsRow>
                <SettingsRow label="Strict">
                  {({ labelId }) => (
                    <Toggle
                      aria-labelledby={labelId}
                      checked={state.strict}
                      onChange={(checked) => updateState({ strict: checked })}
                    />
                  )}
                </SettingsRow>
                <SettingsRow label="JSX / TSX">
                  {({ labelId }) => (
                    <Toggle
                      aria-labelledby={labelId}
                      checked={state.jsx}
                      onChange={(checked) => updateState({ jsx: checked })}
                    />
                  )}
                </SettingsRow>
              </SettingsSection>
            </SettingsPopover>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCompile}
              disabled={!hasCode}
              // Deliberately not `loading`: a background auto-compile would
              // then disable the very button that requests an announced one.
              title={`Compile now (${formatShortcut('mod+enter')})`}
            >
              Compile
              <Kbd keys="mod+enter" variant="inline" className="ml-1" />
            </Button>
            <CopyButton text={output} label="Copy output" />
            <Button
              variant="secondary"
              size="sm"
              disabled={!output}
              onClick={() =>
                sendToTool('code-formatter', { input: output, language: 'javascript' })
              }
              title="Open the compiled JavaScript in Code Formatter"
            >
              Format output
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSave}
              disabled={!output}
              title={`Save the JavaScript output to a file (${formatShortcut('mod+s')})`}
              aria-label="Save output to file"
              className="gap-1"
            >
              <FloppyDiskIcon size={14} aria-hidden="true" />
              Save
            </Button>
          </ToolbarGroup>
        </DocumentToolbar>
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
          <PaneHeader
            title="TypeScript"
            hint={`input · ${inputLines} line${inputLines === 1 ? '' : 's'}`}
          />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <Editor
              theme={monacoTheme}
              language={state.jsx ? 'typescriptreact' : 'typescript'}
              value={input}
              onChange={(v) => updateState({ input: v ?? '' })}
              options={editorOptions}
              onMount={(editor, monaco) => {
                editorRef.current = editor
                monacoRef.current = monaco
              }}
            />
            {!hasCode && (
              // Click-through so the hint never stands between user and caret;
              // only the button itself takes pointer events.
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-[var(--color-text-muted)]">
                <FileTsIcon size={32} weight="light" aria-hidden="true" />
                <p className="text-sm text-[var(--color-text)]">Paste or type TypeScript</p>
                <p className="max-w-xs text-xs">
                  It compiles as you type and reports type errors below.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadExample}
                  className="pointer-events-auto"
                >
                  Load sample
                </Button>
              </div>
            )}
          </div>
        </section>

        <section
          aria-label="JavaScript output"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <PaneHeader
            title="JavaScript"
            hint={`${state.target} · ${state.module} · ${outputLines} line${outputLines === 1 ? '' : 's'}`}
          />
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
          <ProblemsList
            items={sorted.map((diagnostic, index) => ({
              id: `${diagnostic.code}-${diagnostic.line ?? 0}-${diagnostic.column ?? 0}-${index}`,
              message: diagnostic.message,
              severity: diagnostic.category === 'suggestion' ? 'info' : diagnostic.category,
              ...(diagnostic.line === undefined ? {} : { line: diagnostic.line }),
              ...(diagnostic.column === undefined ? {} : { column: diagnostic.column }),
              code: `TS${diagnostic.code}`,
            }))}
            onSelect={goToProblem}
            emptyMessage={hasCode ? 'No problems found.' : 'Nothing to compile yet.'}
            className="min-h-0 flex-1 overflow-auto pb-2"
          />
        )}
      </section>
    </ToolLayout>
  )
}
